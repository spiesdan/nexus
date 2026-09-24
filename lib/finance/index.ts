/**
 * NEXUS 2.0 — fachada FINANCE (§8 migração gradual).
 *
 * Fonte de verdade continua em `lib/fiscal/*` + `lib/comercial/financeiro.ts`.
 * Novos imports devem usar `@/lib/finance`; o fatiamento
 * receber/pagar/cobrança/fluxo acontece na FASE 8.
 */
export * as fiscalQueue from "@/lib/fiscal/fila";
