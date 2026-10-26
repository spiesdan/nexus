/**
 * Tipos do mapa de status do Mercos (`status.mjs`).
 *
 * O worker roda em Node puro (`.mjs`, sem build), então a fonte é JS. Esta
 * declaração existe para o teste em TypeScript e para qualquer consumidor TS
 * ler o mapa com o vocabulário fechado do CRM — sem `any`.
 */
export type StatusDoPedidoNoCrm =
  | "rascunho"
  | "em_analise"
  | "aprovado"
  | "faturado"
  | "expedido"
  | "entregue"
  | "cancelado";

export declare const STATUS: Record<string, StatusDoPedidoNoCrm>;
