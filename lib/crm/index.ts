/**
 * NEXUS 2.0 — fachada CRM (§8 migração gradual).
 *
 * Fonte de verdade continua em `lib/leads/*` + `lib/contacts/*`.
 * Novos imports devem usar `@/lib/crm`; a migração interna é gradual.
 */
export { classifyRisk, resolveStageWindow, RISK_COLD_HOURS, RISK_CRITICAL_HOURS } from "@/lib/leads/risk-radar";
export type { RiskBucket, RiskInput, RiskResult, StageWindow } from "@/lib/leads/risk-radar";
