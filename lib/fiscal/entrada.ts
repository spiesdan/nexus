/**
 * O CLIENTE DAS ENTRADAS — fala com o sidecar (`fiscal/sidecar/`) nos
 * endpoints de distribuição DF-e e manifestação do destinatário.
 *
 * Mesmo molde de `provedor-spednfe.ts`: erro de rede, timeout ou resposta
 * fora do contrato vira `erro` — nunca exceção estourada na rota, e nunca
 * documento presumido.
 */

import type { DuplicataEntrada, ItemEntrada } from "@/lib/schemas/fiscal-entrada";

export interface DocumentoSefaz {
  nsu: string;
  tipo: "resumo" | "completa" | "evento";
  chave: string;
  emitente_cnpj: string;
  emitente_nome: string;
  emitente_ie: string | null;
  numero: number | null;
  serie: string | null;
  dh_emi: string | null;
  valor_cents: number;
  xml: string | null;
  itens: ItemEntrada[];
  cobranca: DuplicataEntrada[];
  tp_evento?: string;
  desc_evento?: string;
}

export interface ResultadoDistribuicao {
  ok: boolean;
  erro: string | null;
  ultNSU: number;
  maxNSU: number;
  cstat: string | null;
  aviso: string | null;
  documentos: DocumentoSefaz[];
}

export interface ResultadoManifestacao {
  ok: boolean;
  erro: string | null;
  manifestacao: string | null;
  cstat: string | null;
  protocolo: string | null;
}

export interface ContextoEntrada {
  ambiente: string;
  cnpj: string;
  razao: string;
  ie: string;
  uf: string;
  certificadoPath: string;
  senhaCertificado: string;
  /**
   * O certificado COMO O SIDECAR VÊ (`/certs/{orgId}/certificado.pfx`).
   *
   * `certificadoPath` é o nome que o app guarda — o suficiente para a tela, que
   * só precisa mostrar o que existe, e insuficiente para o sidecar, que valida
   * que o caminho está dentro de `/certs/` antes de abrir o certificado. Vem do
   * contexto (`caminhoDoCertificadoNoSidecar`), e o nome fica como reserva para
   * um contexto que não traga o caminho completo.
   */
  caminhoDoCertificado?: string | null;
}

function baseESegredo(): { base: string; segredo: string } | { erro: string } {
  const base = process.env.FISCAL_SIDECAR_URL?.trim();
  const segredo = process.env.FISCAL_SIDECAR_SECRET?.trim();
  if (!base || !segredo) {
    return { erro: "Sidecar fiscal fora do ar (FISCAL_SIDECAR_URL/SECRET ausentes)." };
  }
  return { base: base.replace(/\/$/, ""), segredo };
}

async function chamarSidecar<T>(rota: string, corpo: unknown): Promise<T | null> {
  const cfg = baseESegredo();
  if ("erro" in cfg) return null;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 120000);
  try {
    const res = await fetch(`${cfg.base}${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fiscal-Secret": cfg.segredo },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  } finally {
    clearTimeout(limite);
  }
}

function envelope(ctx: ContextoEntrada): Record<string, unknown> {
  return {
    config: {
      ambiente: ctx.ambiente,
      cnpj: ctx.cnpj,
      razao: ctx.razao,
      ie: ctx.ie,
      uf: ctx.uf,
    },
    certificado_arquivo: ctx.caminhoDoCertificado ?? ctx.certificadoPath,
    certificado_senha: ctx.senhaCertificado,
  };
}

/** Uma rodada de distribuição a partir do cursor (até ~150 docs). */
export async function buscarNaSefaz(
  ctx: ContextoEntrada,
  ultNsu: number,
): Promise<ResultadoDistribuicao> {
  const corpo =
    (await chamarSidecar<{
      ok: boolean;
      ultNSU?: number;
      maxNSU?: number;
      cstat?: string;
      xmotivo?: string;
      aviso?: string | null;
      documentos?: DocumentoSefaz[];
      codigo?: string;
      mensagem?: string;
    }>("/distribuicao", { ...envelope(ctx), ult_nsu: ultNsu })) ?? null;
  if (!corpo) {
    return {
      ok: false,
      erro: "Sidecar fiscal inalcançável ou fora do contrato.",
      ultNSU: ultNsu,
      maxNSU: ultNsu,
      cstat: null,
      aviso: null,
      documentos: [],
    };
  }
  if (!corpo.ok) {
    return {
      ok: false,
      erro: `SEFAZ/sidecar [${corpo.codigo ?? "?"}]: ${corpo.mensagem ?? "sem motivo"}`,
      ultNSU: ultNsu,
      maxNSU: ultNsu,
      cstat: corpo.codigo ?? null,
      aviso: null,
      documentos: [],
    };
  }
  return {
    ok: true,
    erro: null,
    ultNSU: corpo.ultNSU ?? ultNsu,
    maxNSU: corpo.maxNSU ?? ultNsu,
    cstat: corpo.cstat ?? null,
    aviso: corpo.aviso ?? null,
    documentos: Array.isArray(corpo.documentos) ? corpo.documentos : [],
  };
}

/** Manifesta o destinatário de uma chave (ciência, confirmação…). */
export async function manifestarNaSefaz(
  ctx: ContextoEntrada,
  chave: string,
  evento: string,
  justificativa?: string,
): Promise<ResultadoManifestacao> {
  const corpo =
    (await chamarSidecar<{
      ok: boolean;
      cstat?: string;
      xmotivo?: string;
      protocolo?: string;
      manifestacao?: string;
      codigo?: string;
      mensagem?: string;
    }>("/manifestar", { ...envelope(ctx), chave, evento, justificativa: justificativa ?? "" })) ??
    null;
  if (!corpo) {
    return {
      ok: false,
      erro: "Sidecar fiscal inalcançável ou fora do contrato.",
      manifestacao: null,
      cstat: null,
      protocolo: null,
    };
  }
  if (!corpo.ok) {
    return {
      ok: false,
      erro: `SEFAZ/sidecar [${corpo.codigo ?? "?"}]: ${corpo.mensagem ?? "sem motivo"}`,
      manifestacao: null,
      cstat: corpo.codigo ?? null,
      protocolo: null,
    };
  }
  return {
    ok: true,
    erro: null,
    manifestacao: corpo.manifestacao ?? null,
    cstat: corpo.cstat ?? null,
    protocolo: corpo.protocolo ?? null,
  };
}
