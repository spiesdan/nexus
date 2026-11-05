/**
 * O NÚMERO QUEIMADO VIRA INUTILIZAÇÃO SOZINHO.
 *
 * ─── O problema medido ──────────────────────────────────────────────────────
 *
 * A emissão reserva o número ANTES de transmitir (é o que impede duas notas de
 * saírem com o mesmo `nNF`). Quando a SEFAZ REJEITA a nota — 905, 232, 696,
 * 778 —, o número fica consumido: a próxima tentativa reserva outro e a nota
 * passa a ter o número novo. O antigo não pertence a nota nenhuma.
 *
 * Medido nesta instalação em 05/11/2026: 4580, 4581, 4583 e 4587 viraram
 * buracos na sequência da série 1 — **quatro números que a SEFAZ nunca soube
 * que não seriam usados**. Buraco de numeração é obrigação acessória: tem de
 * ser inutilizado, senão a escrituração do cliente não fecha com a SEFAZ.
 *
 * ─── Quando NÃO inutilizar ──────────────────────────────────────────────────
 *
 * - **Falha antes da SEFAZ** (validação, certificado, XML): o número é
 *   devolvido ao contador por `devolverNumeroDaNota` — não existe buraco.
 * - **Resposta ambígua** (timeout, lote em processamento, 108/109): a SEFAZ
 *   pode ter recebido a nota. Inutilizar seria declarar morto um número que
 *   pode estar vivo.
 * - **Duplicidade (204/539)**: o número já existe no fisco — inutilizar é
 *   recusado e, pior, esconde o fato de que há nota com ele.
 * - **Denegada**: a nota existe (denegada tem protocolo). O número foi usado.
 *
 * ─── E o buraco antigo? ─────────────────────────────────────────────────────
 *
 * `inutilizarLacunasDaNumeracao` varre a sequência e inutiliza o que não tem
 * nota e não está coberto — é o botão "Inutilizar lacunas" da tela de Ações
 * fiscais e o que conserta buracos anteriores a esta automação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

import { transmitirInutilizacaoRegistrada } from "./transmissao";

export const MOTIVO_MIN = 15;
export const MOTIVO_MAX = 255;

/**
 * `cStat` em que o número NÃO pode ser inutilizado: a nota existe no fisco
 * (100/150/204/539) ou a resposta não é definitiva (103/104/105/108/109).
 */
const CSTAT_COM_NUMERO_NO_FISCO = new Set([
  "100",
  "150",
  "204",
  "539",
  "103",
  "104",
  "105",
  "108",
  "109",
]);

/** O número foi de fato para a SEFAZ e voltou como recusa definitiva? */
export function podeInutilizar(resultado: {
  status: string;
  sefaz_cstat?: string | null;
} | null): resultado is { status: string; sefaz_cstat: string } {
  if (!resultado || resultado.status === "autorizada" || resultado.status === "denegada") {
    return false;
  }
  const cstat = (resultado.sefaz_cstat ?? "").trim();
  // Só código NUMÉRICO de rejeição: "VALIDACAO"/"XML_INVALIDO" são locais, e
  // timeout/lote em processamento não têm cStat nenhum.
  if (!/^\d{3}$/.test(cstat)) return false;
  return !CSTAT_COM_NUMERO_NO_FISCO.has(cstat);
}

/** Texto da inutilização — 15..255 caracteres, com o rastro da nota. */
export function motivoDoNumeroQueimado(input: {
  numero: number;
  serie: string;
  cstat: string | null;
  notaNumero: number | null;
}): string {
  const nota = input.notaNumero ? ` da nota ${input.notaNumero}` : "";
  const motivo =
    `Número ${input.numero} da série ${input.serie} não utilizado: a nota${nota} ` +
    `foi rejeitada pela SEFAZ (${input.cstat ?? "sem cStat"}) e reemitida com numeração nova.`;
  if (motivo.length > MOTIVO_MAX) return motivo.slice(0, MOTIVO_MAX - 1) + "…";
  if (motivo.length < MOTIVO_MIN) return `${motivo} Numeração não utilizada.`;
  return motivo;
}

/** Faixas contíguas — `[4580,4581,4583]` → `[{ini:4580,fim:4581},{ini:4583,fim:4583}]`. */
export function agruparEmFaixas(numeros: number[]): { inicial: number; final: number }[] {
  const ordenados = [...new Set(numeros)].sort((a, b) => a - b);
  const faixas: { inicial: number; final: number }[] = [];
  for (const numero of ordenados) {
    const ultima = faixas[faixas.length - 1];
    if (ultima && numero === ultima.final + 1) {
      ultima.final = numero;
    } else {
      faixas.push({ inicial: numero, final: numero });
    }
  }
  return faixas;
}

export interface LacunaDaSerie {
  serie: string;
  numeros: number[];
}

/**
 * Os números que estão ENTRE o primeiro e o último emitido de cada série e não
 * pertencem a nota nenhuma — nem a uma cancelada (cancelada usou o número).
 */
export function lacunasDaNumeracao(
  notas: { serie: string; numero: number }[],
  faixasInutilizadas: { serie: string; inicial: number; final: number }[],
): { serie: string; numeros: number[] }[] {
  const porSerie = new Map<string, { min: number; max: number; usados: Set<number> }>();
  for (const n of notas) {
    const atual = porSerie.get(n.serie) ?? { min: n.numero, max: n.numero, usados: new Set<number>() };
    atual.min = Math.min(atual.min, n.numero);
    atual.max = Math.max(atual.max, n.numero);
    atual.usados.add(n.numero);
    porSerie.set(n.serie, atual);
  }

  const saida: { serie: string; numeros: number[] }[] = [];
  for (const [serie, dados] of porSerie) {
    const numeros: number[] = [];
    // Sequência fiscal é contígua na prática; o teto evita varrer um intervalo
    // absurdo se alguém digitar um número errado na configuração.
    if (dados.max - dados.min > 200_000) continue;
    for (let numero = dados.min; numero <= dados.max; numero += 1) {
      if (dados.usados.has(numero)) continue;
      const coberta = faixasInutilizadas.some(
        (f) => f.serie === serie && numero >= f.inicial && numero <= f.final,
      );
      if (!coberta) numeros.push(numero);
    }
    if (numeros.length > 0) saida.push({ serie, numeros });
  }
  return saida.sort((a, b) => a.serie.localeCompare(b.serie));
}

/**
 * Ano da numeração (2 dígitos) no fuso do Brasil — o da nota, não o do servidor.
 *
 * Aritmética de offset em vez de `Intl` com locale fixo: isto é dado fiscal, não
 * formatação de tela (o gate de i18n proíbe data com idioma cravado, e com
 * razão). O Brasil não tem horário de verão desde 2019, então UTC-3 é
 * constante; sem o ajuste, uma nota emitida às 22h de 31/12 sairia com o ano
 * seguinte.
 */
const FUSO_BRASIL_MS = -3 * 60 * 60 * 1000;

export function anoDaNumeracao(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return String(new Date(d.getTime() + FUSO_BRASIL_MS).getUTCFullYear()).slice(-2);
}

async function ambienteDaOrg(admin: SupabaseClient, orgId: string): Promise<"producao" | "homologacao"> {
  const { data } = await admin
    .from("fiscal_settings")
    .select("ambiente")
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as unknown as { ambiente?: string } | null)?.ambiente === "producao"
    ? "producao"
    : "homologacao";
}

/** A faixa já está coberta por inutilização registrada (qualquer status)? */
async function jaCoberta(
  admin: SupabaseClient,
  orgId: string,
  serie: string,
  inicial: number,
  final: number,
): Promise<boolean> {
  const { data } = await admin
    .from("fiscal_inutilizacoes")
    .select("id")
    .eq("organization_id", orgId)
    .eq("serie", serie)
    .lte("numero_inicial", final)
    .gte("numero_final", inicial)
    .limit(1);
  return (data as unknown[] | null)?.length ? true : false;
}

export interface ResultadoInutilizacao {
  ok: boolean;
  id: string | null;
  status: string | null;
  protocolo: string | null;
  motivo: string | null;
  /** true quando já existia faixa cobrindo o número (nada foi feito). */
  ja_coberta?: boolean;
}

/**
 * Registra e transmite a inutilização de UM número queimado.
 *
 * Nunca lança: chamada do dreno, e falhar aqui não pode desfazer a nota.
 * Quando a transmissão não acontece (sem certificado, sidecar fora), a linha
 * fica `registrada` com o motivo — visível na tela e retransmissível.
 */
export async function inutilizarNumeroQueimado(
  admin: SupabaseClient,
  orgId: string,
  dados: {
    serie: string;
    numero: number;
    cstat: string | null;
    notaNumero: number | null;
    invoiceId: string;
    anoDaNota?: string | null;
  },
): Promise<ResultadoInutilizacao> {
  const serie = dados.serie.trim();
  if (!/^\d{1,3}$/.test(serie)) {
    logger.warn("fiscal: série não numérica — inutilização automática não é possível", {
      organization_id: orgId,
      invoice_id: dados.invoiceId,
      serie,
      numero: dados.numero,
    });
    return { ok: false, id: null, status: null, protocolo: null, motivo: `Série "${serie}" não é numérica.` };
  }

  if (await jaCoberta(admin, orgId, serie, dados.numero, dados.numero)) {
    return { ok: true, id: null, status: null, protocolo: null, motivo: null, ja_coberta: true };
  }

  const motivo = motivoDoNumeroQueimado({
    numero: dados.numero,
    serie,
    cstat: dados.cstat,
    notaNumero: dados.notaNumero,
  });
  const ambiente = await ambienteDaOrg(admin, orgId);

  const { data, error } = await admin
    .from("fiscal_inutilizacoes")
    .insert({
      organization_id: orgId,
      serie,
      numero_inicial: dados.numero,
      numero_final: dados.numero,
      motivo,
      ambiente,
      status: "registrada",
      created_by: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    logger.error("fiscal: não consegui registrar a inutilização do número queimado", {
      organization_id: orgId,
      invoice_id: dados.invoiceId,
      numero: dados.numero,
      erro: error?.message.slice(0, 300) ?? "sem id",
    });
    return { ok: false, id: null, status: null, protocolo: null, motivo: error?.message ?? null };
  }
  const id = (data as unknown as { id: string }).id;

  const { linha, motivo: motivoTransmissao } = await transmitirInutilizacaoRegistrada(orgId, id, {
    serie,
    numero_inicial: dados.numero,
    numero_final: dados.numero,
    justificativa: motivo,
    ano: dados.anoDaNota ?? null,
    modelo: "55",
  });

  await audit({
    organizationId: orgId,
    action: "fiscal.inutilizacao",
    resourceType: "fiscal_inutilizacoes",
    resourceId: id,
    metadata: {
      automatica: true,
      invoice_id: dados.invoiceId,
      serie,
      numero: dados.numero,
      status: linha?.status ?? null,
      protocolo: linha?.sefaz_protocolo ?? null,
    },
  });

  if (!linha) {
    logger.error("fiscal: inutilização registrada, transmissão não respondida", {
      organization_id: orgId,
      inutilizacao_id: id,
      motivo: motivoTransmissao ?? null,
    });
  }

  return {
    ok: linha?.status === "transmitida",
    id,
    status: linha?.status ?? "registrada",
    protocolo: linha?.sefaz_protocolo ?? null,
    motivo: motivoTransmissao ?? null,
  };
}

const LOTE = 1000;

/** Lê em páginas — o PostgREST corta em 1000 linhas e a conta de lacuna mentiria. */
async function carregarEmLotes<T>(
  consulta: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const saida: T[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await consulta(desde, desde + LOTE - 1);
    if (error) throw new Error(error.message);
    saida.push(...((data ?? []) as T[]));
    if (!data || data.length < LOTE) break;
  }
  return saida;
}

export interface ResumoDasLacunas {
  faixas: {
    serie: string;
    inicial: number;
    final: number;
    status: string;
    protocolo: string | null;
    motivo: string | null;
  }[];
  inutilizados: number;
  falhas: number;
}

/**
 * Inutiliza TODA lacuna da numeração — os buracos que já existem, inclusive os
 * anteriores à automação. Agrupa números contíguos numa faixa só (a SEFAZ
 * aceita até 1000 por inutilização; aqui o teto é a própria lacuna).
 */
export async function inutilizarLacunasDaNumeracao(
  admin: SupabaseClient,
  orgId: string,
  opcoes: { motivoBase?: string } = {},
): Promise<ResumoDasLacunas> {
  // Paginado: um teto silencioso faria a conta de lacuna mentir numa base
  // grande — e lacuna errada vira inutilização errada.
  const notasDb = await carregarEmLotes<{ serie: string; numero: number; created_at: string }>(
    (de, ate) =>
      admin
        .from("invoices")
        .select("serie, numero, created_at")
        .eq("organization_id", orgId)
        .not("numero", "is", null)
        .order("serie")
        .order("numero")
        .range(de, ate),
  );
  const faixasDb = await carregarEmLotes<{
    serie: string;
    numero_inicial: number;
    numero_final: number;
  }>((de, ate) =>
    admin
      .from("fiscal_inutilizacoes")
      .select("serie, numero_inicial, numero_final")
      .eq("organization_id", orgId)
      .order("serie")
      .order("numero_inicial")
      .range(de, ate),
  );

  const notas = notasDb
    .filter((n) => typeof n.numero === "number")
    .map((n) => ({ serie: n.serie, numero: n.numero, created_at: n.created_at }));
  const faixas = faixasDb.map((f) => ({
    serie: f.serie,
    inicial: f.numero_inicial,
    final: f.numero_final,
  }));

  const lacunas = lacunasDaNumeracao(notas, faixas);
  const ambiente = await ambienteDaOrg(admin, orgId);
  const resumo: ResumoDasLacunas = { faixas: [], inutilizados: 0, falhas: 0 };

  for (const lacuna of lacunas) {
    for (const faixa of agruparEmFaixas(lacuna.numeros)) {
      const quantidade = faixa.final - faixa.inicial + 1;
      const motivoBase =
        opcoes.motivoBase ??
        `Numeração pulada na série ${lacuna.serie}: ${quantidade === 1 ? "número não utilizado" : "números não utilizados"} na emissão.`;
      const motivo = motivoBase.length > MOTIVO_MAX ? motivoBase.slice(0, MOTIVO_MAX) : motivoBase;

      const { data, error } = await admin
        .from("fiscal_inutilizacoes")
        .insert({
          organization_id: orgId,
          serie: lacuna.serie,
          numero_inicial: faixa.inicial,
          numero_final: faixa.final,
          motivo,
          ambiente,
          status: "registrada",
          created_by: null,
        })
        .select("id")
        .single();
      if (error || !data) {
        resumo.falhas += 1;
        resumo.faixas.push({
          serie: lacuna.serie,
          inicial: faixa.inicial,
          final: faixa.final,
          status: "erro",
          protocolo: null,
          motivo: error?.message ?? "Erro ao registrar.",
        });
        continue;
      }
      const id = (data as unknown as { id: string }).id;
      const notaDaFaixa = notas
        .filter((n) => n.serie === lacuna.serie && n.numero >= faixa.inicial && n.numero <= faixa.final)
        .map((n) => n.created_at)
        .sort()
        .at(-1);
      const { linha, motivo: motivoTransmissao } = await transmitirInutilizacaoRegistrada(orgId, id, {
        serie: lacuna.serie,
        numero_inicial: faixa.inicial,
        numero_final: faixa.final,
        justificativa: motivo,
        ano: anoDaNumeracao(notaDaFaixa),
        modelo: "55",
      });

      await audit({
        organizationId: orgId,
        action: "fiscal.inutilizacao",
        resourceType: "fiscal_inutilizacoes",
        resourceId: id,
        metadata: {
          automatica: true,
          origem: "lacunas",
          serie: lacuna.serie,
          inicial: faixa.inicial,
          final: faixa.final,
          status: linha?.status ?? null,
          protocolo: linha?.sefaz_protocolo ?? null,
        },
      });

      resumo.faixas.push({
        serie: lacuna.serie,
        inicial: faixa.inicial,
        final: faixa.final,
        status: linha?.status ?? "registrada",
        protocolo: linha?.sefaz_protocolo ?? null,
        motivo: motivoTransmissao ?? null,
      });
      if (linha?.status === "transmitida") resumo.inutilizados += quantidade;
      else resumo.falhas += 1;
    }
  }

  return resumo;
}
