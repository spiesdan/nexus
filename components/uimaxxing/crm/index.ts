/**
 * Camada de adaptação CRM sobre o UImaxxing Registry (FASE 6).
 *
 * Regra §33: nada aqui duplica `components/ui` — os adaptadores compõem os
 * componentes reais instalados (`components/uimaxxing/*` + primitivas em
 * `components/ui/*`) com dados do produto via props.
 */
export { CrmPageHeader } from "./crm-page-header";
export { CrmKpi, CrmKpiGrid, type CrmTrend } from "./crm-kpi";
export { CrmInsightCard } from "./crm-insight";
export { CrmStatusBadge, CrmPresenceDot } from "./crm-status";
export { CrmLoading, CrmEmpty, CrmError, CrmProgress } from "./crm-states";
