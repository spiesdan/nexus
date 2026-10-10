/**
 * OS ALERTAS DE VENCIMENTO: o preventivo e o vencido.
 *
 * ─── As duas janelas ─────────────────────────────────────────────────────────
 *
 * O pedido de 45 dias tem DOIS alertas, e a diferença entre eles é o que o
 * pedido original pede:
 *
 *   - preventivo, no 30º dia: 15 dias antes do vencimento. Ainda há tempo de
 *     resolver com folga; é uma heads-up, não uma cobrança.
 *   - vencimento, no 45º dia: o prazo chegou.
 *
 * Para 30 dias há só o segundo: o preventivo seria 15 dias antes, o que é
 * metade do prazo, e um aviso em toda segunda-feira sobre algo que vence na
 * quinta following não informa nada.
 *
 * ─── Por que o valor é `_cents` e nunca float ────────────────────────────────
 *
 * `valor_original_cents / 100` em `number` arredonda errado em centavos grandes
 * de forma que o teste não pega. O alerta é texto para o operador: formata com
 * `Intl.NumberFormat` e não faz conta de dinheiro.
 */
import { DIAS_DO_AVISO_PREVENTIVO_45, DIAS_DE_PRAZO } from "@/lib/comercial/pedido-fiscal";
import type { AlertaParaSubir } from "@/lib/alertas/reconciliar";

/** O que a rota lê de `financial_receivables`. */
export interface RecebivelParaConferir {
  id: string;
  order_id: string | null;
  contact_id: string | null;
  /** preenchido pela rota com um JOIN/enriquecimento. */
  cliente_nome?: string | null;
  valor_original_cents: number;
  vencimento: string | null;
  status: string;
  forma_pagamento: string | null;
  parcela_n: number;
  total_parcelas: number;
  vencimento_depende_de_nf?: boolean;
}

/** Quantos dias antes do vencimento o preventivo dispara. */
export const ANTECEDENCIA_DO_VENCIMENTO = 5;

/** Quantos dias antes, o preventivo do 45 dias. */
export const ANTECEDENCIA_DO_PREVENTIVO = 15;

export function chaveDoAlerta(recebivelId: string): string {
  return `vencimento:${recebivelId}`;
}

export function chaveDoPreventivo(recebivelId: string): string {
  return `vencimento_proximo:${recebivelId}`;
}

function dinheiro(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Os dois avisos, e nada mais.
 *
 * A chave é o RECEBÍVEL e não o pedido: um pedido parcelado tem uma linha por
 * parcela, e cada uma vence em dia diferente. Com o id do pedido na chave, a
 * segunda parcela não geraria aviso próprio.
 */
export function alertasDeVencimento(
  recebiveis: RecebivelParaConferir[],
  hoje: string,
  organizationId: string,
): AlertaParaSubir[] {
  const saida: AlertaParaSubir[] = [];
  void organizationId;

  for (const r of recebiveis) {
    if (!r.vencimento) continue;
    // O filtro de status é AQUI e não só no SELECT da rota. Uma função que
    // confia no chamador para a parte que decide o que o operador vê é uma
    // função que um chamador novo vai errar — e o teste `pago` existe para
    // lembrar que existe.
    if (r.status === "pago" || r.status === "cancelado") continue;
    // Uma parcela que depende da NF não tem data que seja a dela; a data aqui
    // é real e não pode ser a de outro evento.
    if (r.vencimento_depende_de_nf) continue;

    const dias = diasEntre(hoje, r.vencimento);
    const quem = r.cliente_nome ?? `Recebível #${r.parcela_n}`;
    const parcela = r.total_parcelas > 1 ? ` (parcela ${r.parcela_n}/${r.total_parcelas})` : "";

    if (dias < 0) {
      saida.push({
        chave: chaveDoAlerta(r.id),
        origemTipo: "vencimento_vencido",
        origemId: r.id,
        titulo: `${quem} — vencido há ${Math.abs(dias)} dias`,
        descricao: `${dinheiro(r.valor_original_cents)}${parcela}, vencimento em ${r.vencimento}.`,
        acaoRecomendada: "Regularizar: receber, renegociar ou cancelar a parcela.",
        href: r.order_id ? `/app/pedidos/${r.order_id}` : "/app/financeiro",
        prioridade: "critica",
      });
      continue;
    }

    if (dias === 0) {
      saida.push({
        chave: chaveDoAlerta(r.id),
        origemTipo: "vencimento_vencido",
        origemId: r.id,
        titulo: `${quem} — vence hoje`,
        descricao: `${dinheiro(r.valor_original_cents)}${parcela}, vencimento em ${r.vencimento}.`,
        acaoRecomendada: "Confirmar o recebimento hoje.",
        href: r.order_id ? `/app/pedidos/${r.order_id}` : "/app/financeiro",
        prioridade: "critica",
      });
      continue;
    }

    // O preventivo do 45 dias, e só dele. A razão está no pedido original: um
    // aviso preventivo que dispara a cada poucos dias para o mesmo pedido é
    // ruído que faz o operador parar de olhar.
    const preventivoDe = DIAS_DE_PRAZO.agendado_45
      ? DIAS_DE_PRAZO.agendado_45 - ANTECEDENCIA_DO_PREVENTIVO
      : null;
    const ePreventivoDe45 =
      r.forma_pagamento === "agendado_45" &&
      preventivoDe !== null &&
      dias <= preventivoDe &&
      dias >= DIAS_DE_PRAZO.agendado_45! - DIAS_DO_AVISO_PREVENTIVO_45;

    if (ePreventivoDe45) {
      saida.push({
        chave: chaveDoPreventivo(r.id),
        origemTipo: "vencimento_proximo",
        origemId: r.id,
        titulo: `${quem} — ${dias} dias para o vencimento`,
        descricao: `${dinheiro(r.valor_original_cents)}${parcela}, vencimento em ${r.vencimento} (45 dias).`,
        acaoRecomendada: "Aviso preventivo: cobrar antes do vencimento.",
        href: r.order_id ? `/app/pedidos/${r.order_id}` : "/app/financeiro",
        prioridade: "normal",
      });
      continue;
    }

    if (dias <= ANTECEDENCIA_DO_VENCIMENTO) {
      saida.push({
        chave: chaveDoAlerta(r.id),
        origemTipo: "vencimento_vencido",
        origemId: r.id,
        titulo: `${quem} — vence em ${dias} dias`,
        descricao: `${dinheiro(r.valor_original_cents)}${parcela}, vencimento em ${r.vencimento}.`,
        acaoRecomendada: "Confirmar o recebimento ou renegociar.",
        href: r.order_id ? `/app/pedidos/${r.order_id}` : "/app/financeiro",
        prioridade: "alta",
      });
    }
  }

  return saida;
}
