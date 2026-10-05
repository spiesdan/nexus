/**
 * OS EVENTOS FISCAIS — cancelamento, carta de correção e inutilização.
 *
 * Transmitir é ato formal: só acontece se o provedor for o sidecar real
 * (provedor "spednfe" + FISCAL_SIDECAR_URL/SECRET + certificado configurado).
 * Quando não é possível, o chamador recebe `xmotivo` explicando o porquê e o
 * registro fica local — nada aqui escreve "transmitida" sem ter ido à SEFAZ.
 *
 * Contratos do sidecar (fiscal/sidecar/README.md):
 *   POST /carta-correcao → {ok, protocolo, sequencia, cstat, xmotivo}
 *   POST /inutilizar     → {ok, protocolo, cstat, xmotivo}
 *   POST /cancelar       → {ok, protocolo_cancelamento}
 */

import { MAX_CARTAS_POR_NOTA } from "@/lib/schemas/fiscal";

import { eRetentavel } from "./fila";
import { carregarContextoSped, type ContextoSped } from "./sped-payload";

export interface RetornoEvento {
  /** true = SEFAZ registrou o evento. */
  ok: boolean;
  /** Protocolo do evento, quando a SEFAZ devolveu. */
  protocolo: string | null;
  /** cStat quando disponível (ex.: "135" CC-e, "1002" inutilização). */
  cstat: string | null;
  /** Motivo legível — da SEFAZ ou do caminho até ela. */
  xmotivo: string | null;
  /** Dá para tentar de novo (rede/timeout/sidecar fora)? */
  retentavel: boolean;
}

interface CorpoSidecar {
  ok?: boolean;
  protocolo?: string;
  protocolo_cancelamento?: string;
  cstat?: string;
  xmotivo?: string;
  sequencia?: number;
  codigo?: string;
  mensagem?: string;
}

function falha(mensagem: string, cstat: string | null = null): RetornoEvento {
  return { ok: false, protocolo: null, cstat, xmotivo: mensagem, retentavel: eRetentavel(mensagem) };
}

/**
 * O lado "chegar até a SEFAZ": provedor real, env do sidecar e certificado.
 * Devolve null quando dá para transmitir, senão o motivo em português.
 */
export function motivoDeNaoTransmitir(ctx: ContextoSped): string | null {
  if (ctx.emitente.provedor !== "spednfe") {
    return "Provedor fiscal é o stub: nada é transmitido à SEFAZ (configure o sidecar).";
  }
  if (!process.env.FISCAL_SIDECAR_URL?.trim() || !process.env.FISCAL_SIDECAR_SECRET?.trim()) {
    return "Sidecar fiscal fora do ar (FISCAL_SIDECAR_URL/SECRET ausentes).";
  }
  if (!ctx.emitente.emitente_documento) return "CNPJ do emitente ausente (configuração fiscal).";
  if (!ctx.emitente.ie) return "Inscrição Estadual ausente (configuração fiscal).";
  if (!ctx.emitente.uf) return "UF do emitente ausente (configuração fiscal).";
  if (!ctx.emitente.certificado_path) {
    return "Certificado A1 ausente: coloque o .pfx em /certs e registre o caminho.";
  }
  if (!ctx.senhaCertificado) return "Senha do certificado ausente (configuração fiscal).";
  return null;
}

function envelope(ctx: ContextoSped): Record<string, unknown> {
  const e = ctx.emitente;
  return {
    config: {
      ambiente: e.ambiente,
      serie: e.serie,
      cnpj: e.emitente_documento,
      razao: e.emitente_documento,
      ie: e.ie,
      crt: e.crt,
      natureza: e.natureza_operacao,
      uf: e.uf,
      codigo_municipio: e.codigo_municipio,
    },
    certificado_arquivo: e.certificado_path,
    certificado_senha: ctx.senhaCertificado,
  };
}

async function chamarEvento(rota: string, corpo: Record<string, unknown>): Promise<RetornoEvento> {
  const base = process.env.FISCAL_SIDECAR_URL?.trim();
  const segredo = process.env.FISCAL_SIDECAR_SECRET?.trim();
  if (!base || !segredo) {
    return falha("Sidecar fiscal fora do ar (FISCAL_SIDECAR_URL/SECRET ausentes).");
  }

  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 60000);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fiscal-Secret": segredo },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    const c = (await res.json().catch(() => null)) as CorpoSidecar | null;
    if (!c) return falha("Sidecar respondeu fora do contrato (não-JSON).");

    if (c.ok) {
      return {
        ok: true,
        protocolo: c.protocolo ?? c.protocolo_cancelamento ?? null,
        cstat: c.cstat ?? null,
        xmotivo: c.xmotivo ?? null,
        retentavel: false,
      };
    }
    // Falha do lado SEFAZ/sidecar: codigo vem "SEFAZ_204" (→ cStat 204) ou
    // "VALIDACAO"/"EXCECAO" (cStat nulo, mensagem do contrato).
    const codigo = c.codigo ?? "";
    const cstat = codigo.startsWith("SEFAZ_") ? codigo.slice("SEFAZ_".length) : null;
    const mensagem = c.mensagem ?? "Sem motivo informado.";
    return { ok: false, protocolo: null, cstat, xmotivo: mensagem, retentavel: eRetentavel(`${codigo} ${mensagem}`) };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "tempo esgotado (60s)" : "inalcançável";
    return falha(`Sidecar fiscal ${msg}.`);
  } finally {
    clearTimeout(limite);
  }
}

export interface DadosCartaCorrecao {
  chave: string;
  correcao: string;
  sequencia: number;
}

export async function transmitirCartaCorrecao(ctx: ContextoSped, dados: DadosCartaCorrecao): Promise<RetornoEvento> {
  const bloqueio = motivoDeNaoTransmitir(ctx);
  if (bloqueio) return falha(bloqueio);
  if (!/^\d{44}$/.test(dados.chave)) return falha("Chave de acesso inválida (44 dígitos).", null);
  if (dados.sequencia < 1 || dados.sequencia > MAX_CARTAS_POR_NOTA) {
    return falha(`Sequência da carta fora de 1..${MAX_CARTAS_POR_NOTA}.`, null);
  }
  return chamarEvento("/carta-correcao", { ...envelope(ctx), ...dados });
}

export interface DadosInutilizacao {
  serie: string;
  numero_inicial: number;
  numero_final: number;
  justificativa: string;
  ano?: string | null;
  modelo?: string | null;
}

export async function transmitirInutilizacao(ctx: ContextoSped, dados: DadosInutilizacao): Promise<RetornoEvento> {
  const bloqueio = motivoDeNaoTransmitir(ctx);
  if (bloqueio) return falha(bloqueio);
  const serie = Number(dados.serie);
  if (!Number.isInteger(serie) || serie < 0) return falha("Série inválida (só dígitos).", null);
  return chamarEvento("/inutilizar", {
    ...envelope(ctx),
    serie,
    numero_inicial: dados.numero_inicial,
    numero_final: dados.numero_final,
    justificativa: dados.justificativa,
    ano: dados.ano ?? null,
    modelo: dados.modelo ?? "55",
  });
}

export interface DadosCancelamento {
  chave: string;
  protocolo: string;
  justificativa: string;
}

export async function transmitirCancelamento(ctx: ContextoSped, dados: DadosCancelamento): Promise<RetornoEvento> {
  const bloqueio = motivoDeNaoTransmitir(ctx);
  if (bloqueio) return falha(bloqueio);
  if (!/^\d{44}$/.test(dados.chave)) return falha("Chave de acesso inválida (44 dígitos).", null);
  if (dados.justificativa.trim().length < 15) return falha("Justificativa do cancelamento: mínimo de 15 caracteres.", null);
  return chamarEvento("/cancelar", { ...envelope(ctx), ...dados });
}

/**
 * A mensagem da carta (`[n/20] texto` + `\n[Motivo] ...`) é contrato — tela e
 * rota leem o mesmo formato — e vive em `lib/schemas/fiscal.ts`; reexportada
 * aqui para o resto do módulo fiscal continuar importando de um só lugar.
 */
export { montarMensagemCarta, lerMensagemCarta, type CartaLida } from "@/lib/schemas/fiscal";

export { carregarContextoSped };
