/**
 * F-17 — a lista das tabelas que SAÍRAM do `DEBITO_CONHECIDO` porque agora têm
 * prova comportamental em `rls-camadas-restantes-do-debito.test.ts`.
 *
 * Vive num módulo próprio (e não exportada do teste) porque dois arquivos a
 * consomem: o teste que prova e a varredura de completude que confere. Importar
 * um arquivo de teste de dentro de outro registraria os `describe` dos dois no
 * mesmo contexto — os casos apareceriam duas vezes no run.
 *
 * Regra: esta lista só cresce com teste novo por trás. Nenhuma tabela NOVA entra
 * aqui; tabela nova entra em `TABLES` (rls-isolation.test.ts), no mesmo commit
 * da migration, como o cabeçalho de lá exige.
 */
export const TABELAS_PROVADAS_AQUI = [
  "agent_inbox_items",
  "ai_provider_credentials",
  "api_tokens",
  "before_send_traces",
  "channel_knobs",
  "channel_session_health",
  "channel_sessions",
  "conversation_notes",
  "crm_lead_scores",
  "crm_pipelines",
  "crm_stages",
  "cron_jobs",
  "disclosure_template_pointers",
  "disclosure_template_versions",
  "flywheel_distiller_proposals",
  "flywheel_judge_verdicts",
  "job_queue",
  "judge_alignment_pool",
  "lead_checkpoints",
  "lead_notes",
  "lead_state",
  "lead_state_transitions",
  "llm_calls",
  "message_templates",
  "metrics",
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
  "tenant_integrations",
] as const;
