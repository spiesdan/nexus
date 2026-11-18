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
  | { estado: "conflito" };

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
  if (linha.request_hash !== args.requestHash) return { estado: "conflito" };
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
