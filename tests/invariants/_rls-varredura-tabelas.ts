/**
 * As tabelas tenant-aware que eram `DEBITO_CONHECIDO` na varredura de
 * completude (`rls-completude-varredura.test.ts`) e que passaram a ter **prova
 * comportamental** em `rls-varredura-comportamental.test.ts`.
 *
 * ## Por que a lista mora fora dos dois arquivos
 *
 * A varredura de completude precisa saber que estas tabelas estão cobertas (para
 * cobrar prova de toda tabela NOVA), e o teste comportamental precisa saber
 * quais tabelas semear. Se cada um tivesse a sua cópia, a primeira tabela
 * acrescentada num lado e esquecida no outro viraria dívida silenciosa outra
 * vez — exatamente o defeito que a lista de débito era.
 *
 * ## O que mudou em relação a `DEBITO_CONHECIDO`
 *
 * `DEBITO_CONHECIDO` era um nome: a tabela estava listada, mas nenhum arquivo
 * simulava JWT e contava linha cross-org nela. Aqui a listagem é o **contrato de
 * seed**: `rls-varredura-comportamental.test.ts` semeia uma linha por
 * organização em CADA nome abaixo (o seed é o `beforeAll` daquele arquivo) e
 * reprova se alguma não tiver linha da própria org (controle positivo) — lista
 * que cresce sem seed reprova.
 *
 * ## O que NÃO está aqui, e por quê
 *
 * `SEM_LEITURA_POR_DESENHO` nomeia as duas tabelas que a varredura não consegue
 * provar por leitura, com a razão medida no catálogo. Elas continuam na
 * varredura (escrita cross-org é testada) — só o controle positivo de SELECT
 * não existe.
 */

/**
 * Tabelas semeadas e provadas por `rls-varredura-comportamental.test.ts`.
 * Ordem alfabética: o diff de uma remoção fica visível.
 */
export const TABELAS_DA_VARREDURA = [
  "agent_case_events",
  "agent_cases",
  "agent_inbox_items",
  "ai_agent_runs",
  "ai_agent_versions",
  "ai_agents",
  "ai_budgets",
  "ai_chunks",
  "ai_faq_items",
  "ai_invocations",
  "ai_knowledge_sources",
  "ai_knowledge_versions",
  "ai_provider_credentials",
  "ai_purpose_bindings",
  "ai_router_members",
  "api_audit_log",
  "api_tokens",
  "attendant_availability",
  "before_send_traces",
  "calendar_oauth_nonces",
  "channel_knobs",
  "channel_session_health",
  "channel_session_warmup",
  "channel_sessions",
  "conversation_assignment_events",
  "conversation_notes",
  "crm_lead_activities",
  "crm_lead_links",
  "crm_lead_reactivations",
  "crm_lead_risk_states",
  "crm_lead_scores",
  "crm_pipelines",
  "crm_stages",
  "cron_jobs",
  "demanda_conversas",
  "demandas",
  "disclosure_template_pointers",
  "disclosure_template_versions",
  "event_log",
  "flywheel_distiller_proposals",
  "flywheel_judge_verdicts",
  "idempotency_keys",
  "incidents",
  "job_queue",
  "judge_alignment_pool",
  "lead_checkpoints",
  "lead_notes",
  "lead_state",
  "lead_state_transitions",
  "lgpd_requests",
  "llm_calls",
  "merge_queue",
  "message_templates",
  "metrics",
  "nuvemshop_products",
  "orders",
  "org_memory_pointers",
  "outbound_copies",
  "pacing_ledger",
  "playbook_pointers",
  "playbook_versions",
  "promise_table_pointers",
  "promise_table_versions",
  "reentry_knob_pointers",
  "reentry_knob_versions",
  "reentry_template_pointers",
  "reentry_template_versions",
  "send_ledger",
  "skill_pointers",
  "skill_versions",
  "storage_redaction_queue",
  "tenant_integrations",
  "webhook_events_log",
] as const;

/**
 * Tabelas cujo SELECT não existe para `authenticated` — o controle positivo de
 * leitura é impossível por desenho, e a prova de isolamento é a recusa.
 *
 * Cada entrada foi medida no catálogo (`pg_policies`); o teste reconfere a
 * condição em vez de confiar nesta lista:
 *   - `incidents`: a única policy é `platform_admin_only_incidents`
 *     (`fn_is_platform_admin()`), então um admin de tenant lê 0 linhas por
 *     desenho — inclusive as da própria organização;
 *   - `calendar_oauth_nonces`: a policy `calendar_oauth_nonces_ninguem_le` é
 *     `SELECT false` e `authenticated` não tem GRANT na tabela — a leitura é
 *     negada no privilégio, antes de qualquer policy.
 */
export const SEM_LEITURA_POR_DESENHO: Readonly<Record<string, string>> = {
  incidents:
    "policy única é platform_admin_only_incidents (fn_is_platform_admin()) — admin de tenant lê 0 por desenho",
  calendar_oauth_nonces:
    "SELECT false + sem GRANT para authenticated — a leitura é negada no privilégio",
};

/**
 * Tabelas em que `authenticated` NÃO tem caminho de INSERT (grant/policy), então
 * a escrita é exclusivamente server-side (`service_role`). O teste exige que o
 * INSERT cross-org seja recusado e usa esta lista para não tratar o INSERT
 * recusado na PRÓPRIA organização como regressão de policy.
 */
export const SEM_INSERT_PARA_AUTHENTICATED = [
  "ai_budgets",
  "calendar_oauth_nonces",
  "event_log",
  "incidents",
  "webhook_events_log",
] as const;
