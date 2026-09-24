/**
 * NEXUS 2.0 — fachada SALES (§8 migração gradual).
 *
 * Fonte de verdade continua em `lib/comercial/*`.
 * Novos imports devem usar `@/lib/sales`; a migração interna é gradual.
 */
export { historicoDeCompra, ROTULO_RECOMPRA } from "@/lib/comercial/radar-compras";
export type { HistoricoCompra, PedidoParaRadar, SituacaoRecompra } from "@/lib/comercial/radar-compras";
export { brainDoLote } from "@/lib/ai/sales-brain/batch";
export { ordenarRecomendacoes, recomendar } from "@/lib/ai/sales-brain/recommend";
export type { BrainPrioridade, BrainRecomendacao } from "@/lib/ai/sales-brain/recommend";
