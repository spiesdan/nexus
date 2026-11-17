/**
 * AS TRANSIÇÕES VÁLIDAS DO PEDIDO — a máquina de estados em um lugar só.
 *
 * O vocabulário é o do Mercos (decisão do dono): o pedido nasce **em
 * orçamento**, vira **aprovado** e fecha **concluído**; faturamento e logística
 * vêm depois. Antes desta função, o PATCH deixava qualquer status ir para
 * qualquer status — `entregue → rascunho` e `cancelado → aprovado` passavam.
 *
 * `rascunho → concluido` e `em_analise → concluido` são permitidos de propósito:
 * é o botão **"Marcar como concluído"**, que fecha o pedido direto de quem
 * ainda está em orçamento.
 *
 * `entregue` e `cancelado` são terminais. Cancelar um pedido entregue é o fluxo
 * de devolução da Expedição, não um PATCH de status.
 */
import type { StatusDoPedido } from "@/lib/schemas/pedidos";

export const TRANSICOES_DO_PEDIDO: Record<StatusDoPedido, readonly StatusDoPedido[]> = {
  rascunho: ["em_analise", "aprovado", "concluido", "cancelado"],
  em_analise: ["rascunho", "aprovado", "concluido", "cancelado"],
  aprovado: ["concluido", "faturado", "cancelado"],
  concluido: ["faturado", "expedido", "cancelado"],
  faturado: ["expedido", "entregue", "cancelado"],
  expedido: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

export function podeTransicionar(de: string, para: string): boolean {
  if (de === para) return true;
  return (TRANSICOES_DO_PEDIDO[de as StatusDoPedido] ?? []).includes(para as StatusDoPedido);
}

/**
 * Cancelar devolve o estoque que a venda baixou? Só quando a baixa aconteceu:
 * `rascunho` nunca baixou, e `cancelado` já devolveu (evita devolver duas vezes).
 */
export function cancelamentoDevolveEstoque(de: string): boolean {
  return de !== "rascunho" && de !== "cancelado";
}
