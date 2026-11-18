/**
 * Idempotência de POST caro — a chave é do cliente, o registro é do banco.
 *
 * ## Por que existe
 *
 * O cliente HTTP do produto já injeta `Idempotency-Key` em todo POST
 * (`lib/api/client.ts`), mas o servidor só honrava a chave em **duas** rotas
 * (`financeiro/.../pagamentos` e `lgpd/.../approve`) e em `commercial-orders`
 * por uma chave de domínio (`chave_sincronizacao`). Nas demais, um retry por
 * timeout criava o efeito duas vezes — e em recebível, duas dívidas.
 *
 * A tabela `idempotency_keys` já existia (unique por
 * `organization_id, key, endpoint`, TTL em `expires_at`, RLS por organização).
 * O que faltava era um caminho único para usá-la sem copiar o bloco em cada
 * rota.
 *
 * ## Contrato
 *
 * 1. `lerRespostaIdempotente` devolve a resposta gravada, se houver; se a mesma
 *    chave vier com corpo DIFERENTE, devolve `conflito` (reusar chave para outro
 *    pedido é erro do cliente, não cache hit);
 * 2. `gravarRespostaIdempotente` é best-effort: se o insert falhar por corrida
 *    (23505), relê o vencedor e o devolve; qualquer outro erro é engolido — a
 *    operação de negócio **já aconteceu** e falhar a resposta por causa do
 *    cache seria pior que não cachear;
 * 3. nada aqui decide autorização nem valida payload: o chamador faz isso antes.
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Hash estável do corpo (chaves ordenadas) — detecta reuso de chave com outro pedido. */
export function hashDaRequisicao(corpo: unknown): string {
  return createHash("sha256").update(JSON.stringify(ordenar(corpo))).digest("hex");
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ordenar(v)]),
    );
  }
  return valor;
}

export type RespostaGravada = { status: number; body: unknown };

export type LeituraIdempotente =
  | { estado: "ausente" }
  | { estado: "replay"; resposta: RespostaGravada }
  | { estado: "conflito" }
  /**
   * Linha de reivindicação (status 0) de uma requisição que ainda está
   * executando. Quem chega depois espera a conclusão em vez de repetir o
   * efeito — é o que faz a concorrência da MESMA chave ter um vencedor.
   */
  | { estado: "em_andamento" };

/** `status_code` da linha que reivindica a chave antes do efeito. */
const STATUS_EM_ANDAMENTO = 0;

/**
 * O banco antigo guarda `request_hash` como bytea; o PostgREST devolve `\x…`.
 * A comparação é sempre com o hex puro — a coluna passa a text na 0317, mas
 * instalações que ainda não a aplicaram continuam legíveis.
 */
function hashDaColuna(valor: unknown): string {
  const texto = String(valor ?? "");
  return texto.startsWith("\\x") ? texto.slice(2) : texto;
}

export async function lerRespostaIdempotente(
  admin: SupabaseClient,
  args: { orgId: string; endpoint: string; chave: string; requestHash: string },
): Promise<LeituraIdempotente> {
  const { data, error } = await admin
    .from("idempotency_keys")
    .select("request_hash, status_code, response_body")
    .eq("organization_id", args.orgId)
    .eq("endpoint", args.endpoint)
    .eq("key", args.chave)
    .maybeSingle();
  if (error || !data) return { estado: "ausente" };

  const linha = data as unknown as {
    request_hash: string;
    status_code: number;
    response_body: unknown;
  };
  if (hashDaColuna(linha.request_hash) !== args.requestHash) return { estado: "conflito" };
  if (linha.status_code === STATUS_EM_ANDAMENTO) return { estado: "em_andamento" };
  return {
    estado: "replay",
    resposta: { status: linha.status_code, body: linha.response_body },
  };
}

export async function gravarRespostaIdempotente(
  admin: SupabaseClient,
  args: {
    orgId: string;
    endpoint: string;
    chave: string;
    requestHash: string;
    resposta: RespostaGravada;
    ttlHoras?: number;
  },
): Promise<void> {
  const horas = args.ttlHoras ?? 24;
  const expiresAt = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("idempotency_keys").insert({
    organization_id: args.orgId,
    endpoint: args.endpoint,
    key: args.chave,
    request_hash: args.requestHash,
    response_body: args.resposta.body as never,
    status_code: args.resposta.status,
    expires_at: expiresAt,
  });
  // Corrida perdida na unique: o vencedor já gravou; não sobrescrevemos.
  if (error && error.code !== "23505") {
    // Cache é otimização: a operação de negócio já aconteceu. Não derruba a
    // resposta por causa dele.
    return;
  }
}


/**
 * Reserva FORTE para POST fiscal: uma chave tem UM efeito, inclusive sob
 * concorrência.
 *
 * O helper antigo (`ler` + `gravar`) é cache: dois requests simultâneos com a
 * mesma chave passavam os dois por "ausente", executavam os dois e o perdedor
 * do unique só não sobrescrevia a resposta. Em nota fiscal isso é duas
 * transmissões. Aqui a chave é REIVINDICADA antes do efeito (status 0); o
 * segundo request espera a conclusão e recebe o replay, ou 409 se o payload for
 * outro.
 *
 * Contrato:
 *  - `livre` → execute o efeito e chame `finalizar` (ou `abortar` em erro);
 *  - `replay` → devolva a resposta original com header `Idempotency-Replayed`;
 *  - `conflito` → 409 `idempotency_conflict` (mesma chave, outro payload);
 *  - `em_andamento` → o vencedor não terminou no tempo de espera; 409.
 */
export type ReservaIdempotente =
  | {
      estado: "livre";
      finalizar: (resposta: RespostaGravada) => Promise<void>;
      abortar: () => Promise<void>;
    }
  | { estado: "replay"; resposta: RespostaGravada }
  | { estado: "conflito" }
  | { estado: "em_andamento" }
  | { estado: "erro"; erro: string };

const ESPERA_MS = 150;
const TENTATIVAS_DE_ESPERA = 20;

export async function reservarIdempotencia(
  admin: SupabaseClient,
  args: {
    orgId: string;
    endpoint: string;
    chave: string;
    requestHash: string;
    ttlHoras?: number;
  },
): Promise<ReservaIdempotente> {
  const ler = async (): Promise<LeituraIdempotente> => {
    const { data, error } = await admin
      .from("idempotency_keys")
      .select("request_hash, status_code, response_body")
      .eq("organization_id", args.orgId)
      .eq("endpoint", args.endpoint)
      .eq("key", args.chave)
      .maybeSingle();
    if (error || !data) return { estado: "ausente" };
    const linha = data as unknown as {
      request_hash: string;
      status_code: number;
      response_body: unknown;
    };
    if (hashDaColuna(linha.request_hash) !== args.requestHash) return { estado: "conflito" };
    if (linha.status_code === STATUS_EM_ANDAMENTO) return { estado: "em_andamento" };
    return { estado: "replay", resposta: { status: linha.status_code, body: linha.response_body } };
  };

  const esperar = async (): Promise<ReservaIdempotente> => {
    for (let i = 0; i < TENTATIVAS_DE_ESPERA; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
      const leitura = await ler();
      if (leitura.estado === "replay") return leitura;
      if (leitura.estado === "conflito") return { estado: "conflito" };
      if (leitura.estado === "ausente") break; // quem reivindicou abortou
    }
    return { estado: "em_andamento" };
  };

  const leitura = await ler();
  if (leitura.estado === "conflito") return { estado: "conflito" };
  if (leitura.estado === "replay") return leitura;
  if (leitura.estado === "em_andamento") return esperar();

  // Ausente (ou claim abortado): reivindica. O unique (org, key, endpoint)
  // decide um vencedor; o perdedor espera e relê.
  const horas = args.ttlHoras ?? 24;
  const expiresAt = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("idempotency_keys").insert({
    organization_id: args.orgId,
    endpoint: args.endpoint,
    key: args.chave,
    request_hash: args.requestHash,
    response_body: {} as never,
    status_code: STATUS_EM_ANDAMENTO,
    expires_at: expiresAt,
  });
  if (error?.code === "23505") return esperar();
  if (error) return { estado: "erro", erro: error.message };

  return {
    estado: "livre",
    finalizar: async (resposta) => {
      await admin
        .from("idempotency_keys")
        .update({ status_code: resposta.status, response_body: resposta.body as never })
        .eq("organization_id", args.orgId)
        .eq("endpoint", args.endpoint)
        .eq("key", args.chave)
        .eq("status_code", STATUS_EM_ANDAMENTO);
    },
    abortar: async () => {
      await admin
        .from("idempotency_keys")
        .delete()
        .eq("organization_id", args.orgId)
        .eq("endpoint", args.endpoint)
        .eq("key", args.chave)
        .eq("status_code", STATUS_EM_ANDAMENTO);
    },
  };
}
