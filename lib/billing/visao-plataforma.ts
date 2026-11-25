/**
 * A VISÃO DA COBRANÇA PARA QUEM VENDE A INSTALAÇÃO — de/para estado → rótulo.
 *
 * ─── O DEFEITO QUE ISTO EXISTE PARA IMPEDIR ─────────────────────────────────
 *
 * A pergunta do dono é "quem está pagando e quem não está". A resposta errada
 * mais cara é chamar de "sem assinatura" uma organização que TEM `customer` no
 * Stripe mas cuja última leitura falhou: o Stripe fora do ar não é inadimplência,
 * e quem lê "não paga" toma decisão de negócio (suspender, cobrar, ligar) com
 * base num dado que ninguém confirmou. Organização sem leitura é
 * `nao_verificado` — nem paga, nem devedora.
 *
 * ─── O QUE ESTE MÓDULO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não chama o Stripe, não consulta o banco e não formata fuso "de tela". Ele
 * recebe o que o banco local já tem (o `billing-reconcile` sincroniza) e
 * devolve estado + texto. Toda chamada ao Stripe por linha seria N+1: com 50
 * organizações a lista abriria 50 requisições síncronas e ficaria lenta por
 * construção.
 *
 * ─── O QUE É CONFIRMADO E O QUE É INFERIDO ──────────────────────────────────
 *
 * CONFIRMADO pelo schema: `billing_customers`, `billing_subscriptions.status`,
 * `billing_invoices.status/due_at/paid_at`, `billing_plans.valor_cents`.
 * INFERIDO (regra deste módulo, escrita aqui porque não existia em doc):
 *   - fatura `open`/`unpaid`/`action_required` vencida manda mais que
 *     `subscription.status`: os dois vêm do mesmo Stripe e a fatura é o
 *     documento que decide o atraso;
 *   - status desconhecido nunca vira "sem assinatura" nem "ativa" — vira
 *     `nao_verificado`.
 */

import { comoMoeda } from "@/lib/format/moeda";

export type EstadoAssinatura =
  | "ativa"
  | "em_atraso"
  | "sem_assinatura"
  | "cancelada"
  | "nao_verificado";

export const ESTADOS_DE_COBRANCA: readonly EstadoAssinatura[] = [
  "ativa",
  "em_atraso",
  "sem_assinatura",
  "cancelada",
  "nao_verificado",
] as const;

/** Os quatro rótulos que a tela conta. `nao_verificado` é o quinto, e aparece
 *  separado justamente para a soma não fechar em silêncio. */
export const ESTADOS_CONTADOS: readonly EstadoAssinatura[] = [
  "ativa",
  "em_atraso",
  "sem_assinatura",
  "cancelada",
] as const;

export const ROTULO_ESTADO: Record<EstadoAssinatura, string> = {
  ativa: "Ativa",
  em_atraso: "Em atraso",
  sem_assinatura: "Sem assinatura",
  cancelada: "Cancelada",
  nao_verificado: "Não verificada",
};

/** Fatura como veio do banco (nada de objeto Stripe aqui). */
export interface FaturaLocal {
  status: string;
  amount_cents: number;
  currency: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface AssinaturaLocal {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface EntradaClassificacao {
  /** Existe cliente no Stripe para a org? `null` = nunca assinou. */
  customer: { stripe_customer_id: string | null } | null;
  assinatura: AssinaturaLocal | null;
  /** Faturas da org, em QUALQUER ordem — a função ordena por `created_at`. */
  faturas: readonly FaturaLocal[];
  agora?: Date;
}

const STATUS_ATIVA = new Set(["active", "trialing"]);
const STATUS_ATRASO = new Set(["past_due", "unpaid", "incomplete"]);
const STATUS_CANCELADA = new Set(["canceled", "incomplete_expired"]);
const STATUS_FATURA_ATRASO = new Set(["unpaid", "action_required"]);
const STATUS_FATURA_ABERTA = new Set(["open"]);

function instante(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Fatura mais recente por `created_at`, sem depender da ordem do SELECT. */
export function faturaMaisRecente(faturas: readonly FaturaLocal[]): FaturaLocal | null {
  let escolhida: FaturaLocal | null = null;
  let escolhidaMs = -Infinity;
  for (const fatura of faturas) {
    const ms = instante(fatura.created_at) ?? -Infinity;
    if (ms > escolhidaMs) {
      escolhida = fatura;
      escolhidaMs = ms;
    }
  }
  return escolhida;
}

export function faturaVencidaNaoPaga(
  faturas: readonly FaturaLocal[],
  agora: Date,
): FaturaLocal | null {
  const limite = agora.getTime();
  let escolhida: FaturaLocal | null = null;
  let escolhidaMs = -Infinity;
  for (const fatura of faturas) {
    const atrasada = STATUS_FATURA_ATRASO.has(fatura.status) || STATUS_FATURA_ABERTA.has(fatura.status);
    if (!atrasada) continue;
    const due = instante(fatura.due_at);
    if (due === null || due > limite) continue;
    if (due > escolhidaMs) {
      escolhida = fatura;
      escolhidaMs = due;
    }
  }
  return escolhida;
}

/**
 * De/para estado → rótulo. A ordem das perguntas é a regra:
 *   1. assinatura conhecida (com fatura vencida vencendo o status local);
 *   2. sem assinatura, mas com cliente → NÃO VERIFICADO (nunca "não paga");
 *   3. sem cliente e sem assinatura → sem assinatura.
 */
export function classificarAssinatura(entrada: EntradaClassificacao): EstadoAssinatura {
  const agora = entrada.agora ?? new Date();
  const { assinatura, customer } = entrada;

  if (assinatura) {
    const status = (assinatura.status ?? "").trim().toLowerCase();
    if (!status) return "nao_verificado";
    // Cancelada é um estado da ASSINATURA, e a fatura antiga continua sendo
    // exibida na linha ("falhou"/"em aberto"). Deixar a fatura vencer o status
    // aqui transformaria churn cancelado em "em atraso" e inflaria a contagem
    // de quem está devendo mensalidade.
    if (STATUS_CANCELADA.has(status)) return "cancelada";
    if (faturaVencidaNaoPaga(entrada.faturas, agora)) return "em_atraso";
    if (STATUS_ATIVA.has(status)) return "ativa";
    if (STATUS_ATRASO.has(status)) return "em_atraso";
    // `paused`, status novo do Stripe: o sistema não sabe o que é — e não saber
    // não autoriza dizer "não paga".
    return "nao_verificado";
  }

  if (customer?.stripe_customer_id) return "nao_verificado";
  if (entrada.faturas.length > 0) {
    // Fatura sem cliente nem assinatura é dado inconsistente. Dizer "sem
    // assinatura" aqui seria apagar a pista de que houve cobrança.
    return "nao_verificado";
  }
  return "sem_assinatura";
}

/** Por que uma linha está `nao_verificado` — a tela mostra isso, não um "—". */
export function motivoNaoVerificado(entrada: EntradaClassificacao): string | null {
  if (classificarAssinatura(entrada) !== "nao_verificado") return null;
  if (entrada.assinatura && !(entrada.assinatura.status ?? "").trim()) {
    return "Assinatura sem status na última leitura";
  }
  if (entrada.assinatura) return `Status “${entrada.assinatura.status}” não reconhecido`;
  if (entrada.customer?.stripe_customer_id) {
    return "Cliente Stripe existe, mas nenhuma assinatura foi lida";
  }
  return "Há cobrança registrada sem cliente vinculado";
}

// ---------------------------------------------------------------------------
// Textos de data e cobrança
// ---------------------------------------------------------------------------

/**
 * Dia/mês/ano em UTC. O Stripe devolve epoch UTC e a cobrança é um dia inteiro;
 * converter para o fuso do navegador faria `2026-12-16T00:00:00Z` aparecer como
 * 15/12 em São Paulo — um dia antes do vencimento real.
 */
export function formatarDia(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = instante(iso);
  if (ms === null) return null;
  const d = new Date(ms);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

export interface VencimentoNaTela {
  iso: string | null;
  texto: string;
  vencido: boolean;
}

/**
 * Próximo vencimento: fatura vencida em aberto primeiro (é o que está
 * acontecendo AGORA), senão o fim do período da assinatura. Sem nenhum dos
 * dois, "—" — não uma data inventada.
 */
export function proximoVencimento(
  entrada: EntradaClassificacao,
  agora: Date = new Date(),
): VencimentoNaTela {
  const faturaVencida = faturaVencidaNaoPaga(entrada.faturas, agora);
  if (faturaVencida?.due_at) {
    const dia = formatarDia(faturaVencida.due_at);
    if (dia) return { iso: faturaVencida.due_at, texto: `venceu ${dia}`, vencido: true };
  }
  if (entrada.assinatura?.current_period_end) {
    const dia = formatarDia(entrada.assinatura.current_period_end);
    if (dia) {
      const vencido = (instante(entrada.assinatura.current_period_end) ?? 0) < agora.getTime();
      return {
        iso: entrada.assinatura.current_period_end,
        texto: vencido ? `venceu ${dia}` : dia,
        vencido,
      };
    }
  }
  return { iso: null, texto: "—", vencido: false };
}

export interface UltimaCobranca {
  iso: string | null;
  texto: string;
  falhas: number;
  paga: boolean;
}

const ROTULO_FATURA: Record<string, string> = {
  paid: "paga",
  open: "em aberto",
  unpaid: "falhou",
  action_required: "exige ação",
  void: "anulada",
  draft: "rascunho",
};

/**
 * Última cobrança = fatura mais recente por `created_at`.
 * `falhas` conta as faturas em `unpaid`/`action_required` — é o "falhou 2×" da
 * lista, e é CONTAGEM DE LINHAS, não tentativa de adivinhar retry do Stripe.
 */
export function ultimaCobranca(
  faturas: readonly FaturaLocal[],
  agora: Date = new Date(),
): UltimaCobranca {
  const falhas = faturas.filter((f) => STATUS_FATURA_ATRASO.has(f.status)).length;
  const recente = faturaMaisRecente(faturas);
  if (!recente) return { iso: null, texto: "—", falhas, paga: false };

  const diaCriacao = formatarDia(recente.created_at);
  const rotulo = ROTULO_FATURA[recente.status] ?? recente.status;

  if (recente.status === "paid") {
    const diaPagamento = formatarDia(recente.paid_at) ?? diaCriacao;
    return {
      iso: recente.paid_at ?? recente.created_at,
      texto: diaPagamento ? `paga em ${diaPagamento}` : "paga",
      falhas,
      paga: true,
    };
  }
  if (STATUS_FATURA_ATRASO.has(recente.status)) {
    return {
      iso: recente.paid_at ?? recente.created_at,
      texto: falhas > 1 ? `falhou ${falhas}×` : "falhou",
      falhas,
      paga: false,
    };
  }
  if (STATUS_FATURA_ABERTA.has(recente.status)) {
    const due = instante(recente.due_at);
    const texto =
      due !== null && due < agora.getTime()
        ? `venceu ${formatarDia(recente.due_at) ?? ""}`.trim()
        : `em aberto${diaCriacao ? ` desde ${diaCriacao}` : ""}`;
    return { iso: recente.due_at ?? recente.created_at, texto, falhas, paga: false };
  }
  return { iso: recente.created_at, texto: rotulo, falhas, paga: false };
}

/** Valor do plano no formato de quem vende. Sem plano = null (a tela põe "—"). */
export function valorDoPlano(
  plano: { valor_cents: number; moeda: string } | null | undefined,
): string | null {
  if (!plano || !Number.isFinite(plano.valor_cents)) return null;
  return comoMoeda(plano.valor_cents, plano.moeda);
}

// ---------------------------------------------------------------------------
// Contagens
// ---------------------------------------------------------------------------

export type Contagens = Record<EstadoAssinatura, number>;

export interface ResumoContagens {
  contagens: Contagens;
  total: number;
  /** Soma dos QUATRO rótulos pedidos (sem `nao_verificado`). */
  somaDosQuatro: number;
  /** `total - somaDosQuatro`. Zero é o esperado; diferente de zero é a prova
   *  de que há estado fora dos quatro e a tela NÃO pode esconder. */
  diferenca: number;
  fecha: boolean;
}

export function resumirEstados(
  estados: readonly EstadoAssinatura[],
  totalOrganizacoes = estados.length,
): ResumoContagens {
  const contagens: Contagens = {
    ativa: 0,
    em_atraso: 0,
    sem_assinatura: 0,
    cancelada: 0,
    nao_verificado: 0,
  };
  for (const estado of estados) contagens[estado] += 1;
  const somaDosQuatro = ESTADOS_CONTADOS.reduce((soma, estado) => soma + contagens[estado], 0);
  return {
    contagens,
    total: totalOrganizacoes,
    somaDosQuatro,
    diferenca: totalOrganizacoes - somaDosQuatro,
    fecha: totalOrganizacoes === somaDosQuatro,
  };
}

// ---------------------------------------------------------------------------
// Frescor do dado — "sincronizado há X", nunca "tempo real"
// ---------------------------------------------------------------------------

export function tempoRelativo(iso: string | null | undefined, agora: Date = new Date()): string | null {
  const ms = instante(iso);
  if (ms === null) return null;
  const segundos = Math.max(0, Math.round((agora.getTime() - ms) / 1000));
  if (segundos < 60) return "há menos de 1 min";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `há ${dias} d`;
  const meses = Math.round(dias / 30);
  return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
}
