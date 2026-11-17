# Tabelas e relações — gerado do `baseline.sql`

> Gerado por `node scripts/auditoria/dados-documentados-e-retencao.mjs`.
> Não editar à mão: o que envelhece é a prosa, não o schema.

| Medida | Valor |
|---|---|
| Tabelas | **180** |
| Com `COMMENT ON TABLE` | **76** |
| Com `organization_id` (de um tenant) | **170** |
| Globais (plataforma) | **10** |
| Com `deleted_at` (soft delete) | **0** |
| Chaves estrangeiras | **315** (cascade 215 · restrict 3 · set null 88) |
| Crons com retenção/limpeza | **3** |

## Exclusão

Não há `deleted_at` em nenhuma tabela: a exclusão é **hard delete** com
`on delete cascade` em 215 chaves, `set null` em 88 e `restrict` em 3.
O que a LGPD exige preservar não é apagado: é **anonimizado** em cascata por
`POST /api/v1/lgpd/anonymize` (nulifica PII, marca `is_anonymized`/`anonymized_at`,
reescreve `display_name`, redige payload de atividades), e a trilha de auditoria
é retida por prazo (abaixo).

## Retenção

As janelas estão em `lib/retencao/politica.ts`, com piso que o knob não fura:

| Trilha | Variável | Padrão | Piso |
|---|---|---|---|
| Fila de jobs (`job_queue`) | `JOB_QUEUE_RETENTION_DAYS` | 90 dias | 7 dias |
| Auditoria (`api_audit_log`/`event_log`) | `AUDIT_LOG_RETENTION_DAYS` | **1825 dias (5 anos — regra L-10)** | 90 dias |
| Espelho de agenda | `CALENDAR_MIRROR_RETENTION_DAYS` | 90 dias | 7 dias |
| Captação de lead | `LEAD_CAPTURE_RETENTION_DAYS` | 365 dias | 30 dias |
| Log de webhook — corpo | `WEBHOOK_LOG_BODY_RETENTION_DAYS` | 7 dias | — |
| Log de webhook — linha | `WEBHOOK_LOG_ROW_RETENTION_DAYS` | 90 dias | — |

E os crons que executam: `/cron/agenda-google-sync` (reconciliação), `/cron/data-retention` (poda por prazo (RPC)), `/cron/webhook-log-retention` (retenção própria).

Poda por prazo chama RPC no banco: `fn_podar_fila_de_jobs`,
`fn_expurgar_auditoria_vencida`, `fn_expurgar_espelho_da_agenda` e
`fn_expurgar_nonces_de_oauth` — a auditoria de cada rodada fica em
`retention.sweep_run` no `event_log`.

## Tabelas

| Tabela | Colunas | Dono | FKs | Documentada |
|---|---|---|---|---|
| `agent_case_events` | 10 | tenant | 3 | — |
| `agent_cases` | 16 | tenant | 4 | — |
| `agent_inbox_items` | 10 | tenant | 1 | — |
| `ai_agent_runs` | 9 | tenant | 0 | — |
| `ai_agent_versions` | 10 | tenant | 0 | — |
| `ai_agents` | 6 | tenant | 0 | — |
| `ai_budgets` | 7 | tenant | 0 | — |
| `ai_chunks` | 3 | tenant | 0 | — |
| `ai_execution_policies` | 6 | tenant | 2 | sim |
| `ai_faq_items` | 3 | tenant | 0 | — |
| `ai_invocations` | 6 | tenant | 0 | sim |
| `ai_knowledge_sources` | 6 | tenant | 0 | — |
| `ai_knowledge_versions` | 6 | tenant | 0 | — |
| `ai_models` | 7 | **plataforma** | 0 | — |
| `ai_pricing` | 5 | **plataforma** | 0 | — |
| `ai_provider_credentials` | 4 | tenant | 0 | — |
| `ai_purpose_bindings` | 10 | tenant | 2 | sim |
| `ai_router_decisions` | 10 | tenant | 3 | — |
| `ai_router_members` | 10 | tenant | 3 | — |
| `ai_routers` | 10 | tenant | 3 | — |
| `api_audit_log` | 3 | tenant | 0 | sim |
| `api_tokens` | 5 | tenant | 0 | — |
| `attendant_availability` | 8 | tenant | 2 | — |
| `attendant_availability` | 8 | tenant | 2 | — |
| `automatic_sales_campaigns` | 18 | tenant | 2 | sim |
| `automatic_sales_events` | 7 | tenant | 3 | sim |
| `automatic_sales_queue` | 18 | tenant | 7 | sim |
| `automation_rule_runs` | 8 | tenant | 3 | — |
| `automation_rules` | 12 | tenant | 1 | — |
| `before_send_traces` | 9 | tenant | 4 | — |
| `business_prospects` | 45 | tenant | 6 | sim |
| `calendar_appointments` | 33 | tenant | 8 | sim |
| `calendar_availability_exceptions` | 10 | tenant | 2 | sim |
| `calendar_connection_calendars` | 11 | tenant | 2 | sim |
| `calendar_connections` | 15 | tenant | 2 | sim |
| `calendar_event_types` | 24 | tenant | 2 | sim |
| `calendar_external_events` | 14 | tenant | 2 | sim |
| `calendar_oauth_nonces` | 5 | tenant | 2 | sim |
| `catalog_products` | 17 | tenant | 1 | sim |
| `channel_knobs` | 5 | tenant | 2 | — |
| `channel_session_health` | 11 | tenant | 2 | — |
| `channel_session_warmup` | 3 | tenant | 0 | — |
| `channel_sessions` | 9 | tenant | 0 | — |
| `commercial_activities` | 9 | tenant | 2 | sim |
| `commercial_commission_baixas` | 9 | tenant | 2 | sim |
| `commercial_goals` | 7 | tenant | 1 | sim |
| `commercial_order_counters` | 3 | tenant | 1 | — |
| `commercial_order_items` | 12 | tenant | 3 | sim |
| `commercial_orders` | 20 | tenant | 4 | sim |
| `commercial_policies` | 7 | tenant | 1 | sim |
| `commercial_shipment_counters` | 3 | tenant | 1 | — |
| `commercial_tasks` | 17 | tenant | 3 | sim |
| `commercial_titulo_baixas` | 9 | tenant | 2 | sim |
| `contact_field_proposals` | 17 | tenant | 6 | sim |
| `contacts` | 9 | tenant | 0 | sim |
| `conversation_assignment_events` | 8 | tenant | 5 | — |
| `conversation_notes` | 7 | tenant | 3 | — |
| `conversations` | 13 | tenant | 0 | — |
| `crm_lead_activities` | 2 | tenant | 0 | — |
| `crm_lead_links` | 1 | tenant | 0 | — |
| `crm_lead_reactivations` | 10 | tenant | 3 | sim |
| `crm_lead_risk_decisions` | 6 | tenant | 2 | sim |
| `crm_lead_risk_states` | 7 | tenant | 2 | sim |
| `crm_lead_scores` | 9 | tenant | 2 | sim |
| `crm_leads` | 7 | tenant | 0 | — |
| `crm_pipelines` | 5 | tenant | 0 | — |
| `crm_stages` | 8 | tenant | 0 | — |
| `cron_jobs` | 16 | tenant | 2 | — |
| `demanda_conversas` | 4 | tenant | 3 | — |
| `demandas` | 18 | tenant | 5 | sim |
| `disclosure_template_pointers` | 3 | tenant | 2 | — |
| `disclosure_template_versions` | 4 | tenant | 1 | — |
| `endereco_entradas` | 14 | tenant | 3 | sim |
| `event_log` | 4 | tenant | 0 | sim |
| `financial_pagaveis` | 16 | tenant | 3 | sim |
| `financial_payments` | 11 | tenant | 2 | — |
| `financial_receivables` | 15 | tenant | 4 | — |
| `fiscal_certificates` | 12 | tenant | 1 | sim |
| `fiscal_cfop_equivalentes` | 6 | tenant | 1 | — |
| `fiscal_document_events` | 13 | tenant | 2 | sim |
| `fiscal_document_items` | 23 | tenant | 3 | sim |
| `fiscal_emitidas_cursor` | 4 | tenant | 1 | sim |
| `fiscal_entrada_cursor` | 3 | tenant | 1 | sim |
| `fiscal_entradas` | 23 | tenant | 2 | sim |
| `fiscal_events` | 10 | tenant | 2 | — |
| `fiscal_ibpt` | 18 | tenant | 1 | sim |
| `fiscal_inutilizacoes` | 12 | tenant | 1 | — |
| `fiscal_jobs` | 13 | tenant | 2 | — |
| `fiscal_manifestations` | 11 | tenant | 2 | sim |
| `fiscal_settings` | 7 | tenant | 1 | sim |
| `fiscal_sync_logs` | 17 | tenant | 1 | sim |
| `fleet_drivers` | 10 | tenant | 2 | sim |
| `fleet_vehicles` | 8 | tenant | 1 | sim |
| `flywheel_distiller_proposals` | 9 | tenant | 1 | — |
| `flywheel_judge_verdicts` | 12 | tenant | 1 | — |
| `followup_enrollment_events` | 8 | tenant | 2 | — |
| `followup_enrollments` | 19 | tenant | 5 | — |
| `followup_flow_pointers` | 10 | tenant | 2 | — |
| `followup_flow_versions` | 5 | tenant | 2 | — |
| `idempotency_keys` | 3 | tenant | 0 | — |
| `incidents` | 4 | tenant | 0 | — |
| `inventory_movements` | 11 | tenant | 3 | sim |
| `invoice_orders` | 4 | tenant | 3 | sim |
| `invoices` | 15 | tenant | 3 | sim |
| `job_queue` | 15 | tenant | 2 | — |
| `judge_alignment_pool` | 6 | tenant | 1 | — |
| `knowledge_searches` | 8 | tenant | 1 | — |
| `lab_avaliacoes` | 13 | tenant | 1 | — |
| `lead_checkpoints` | 10 | tenant | 3 | — |
| `lead_notes` | 8 | tenant | 2 | — |
| `lead_state` | 7 | tenant | 2 | — |
| `lead_state_transitions` | 9 | tenant | 3 | — |
| `lgpd_requests` | 7 | tenant | 0 | — |
| `llm_calls` | 15 | tenant | 3 | — |
| `mercos_import_runs` | 16 | tenant | 2 | — |
| `merge_queue` | 2 | tenant | 0 | — |
| `message_templates` | 9 | tenant | 3 | — |
| `messages` | 7 | tenant | 0 | — |
| `meta_templates` | 15 | tenant | 1 | sim |
| `metrics` | 6 | tenant | 1 | — |
| `nuvemshop_products` | 7 | tenant | 0 | — |
| `operational_alerts` | 17 | tenant | 2 | — |
| `orders` | 7 | tenant | 0 | — |
| `org_guardrail_layers` | 4 | tenant | 1 | — |
| `org_memory_entries` | 10 | tenant | 2 | — |
| `org_memory_pointers` | 3 | tenant | 2 | — |
| `org_memory_versions` | 6 | tenant | 1 | — |
| `organizations` | 8 | **plataforma** | 0 | sim |
| `outbound_copies` | 6 | tenant | 2 | — |
| `pacing_ledger` | 4 | tenant | 2 | — |
| `platform_admins` | 3 | **plataforma** | 0 | sim |
| `platform_branding` | 10 | **plataforma** | 0 | sim |
| `platform_google_oauth` | 5 | **plataforma** | 0 | sim |
| `playbook_pointers` | 4 | tenant | 2 | — |
| `playbook_versions` | 5 | tenant | 1 | — |
| `price_table_items` | 7 | tenant | 3 | sim |
| `price_tables` | 8 | tenant | 1 | sim |
| `product_categories` | 8 | tenant | 2 | sim |
| `product_images` | 7 | tenant | 3 | sim |
| `promise_table_pointers` | 3 | tenant | 2 | — |
| `promise_table_versions` | 4 | tenant | 1 | — |
| `prospect_search_results` | 5 | tenant | 3 | — |
| `prospecting_cache_hits` | 4 | tenant | 2 | sim |
| `prospecting_campaigns` | 13 | tenant | 2 | sim |
| `prospecting_message_presets` | 6 | tenant | 1 | — |
| `prospecting_searches` | 32 | tenant | 2 | sim |
| `prospecting_sends` | 7 | tenant | 3 | — |
| `prospecting_settings` | 17 | tenant | 1 | sim |
| `purchase_order_counters` | 3 | tenant | 1 | — |
| `purchase_order_items` | 11 | tenant | 3 | — |
| `purchase_orders` | 9 | tenant | 2 | sim |
| `push_subscriptions` | 8 | tenant | 2 | sim |
| `reentry_knob_pointers` | 3 | tenant | 2 | — |
| `reentry_knob_versions` | 4 | tenant | 1 | — |
| `reentry_template_pointers` | 3 | tenant | 2 | — |
| `reentry_template_versions` | 4 | tenant | 1 | — |
| `send_ledger` | 11 | tenant | 3 | — |
| `shipment_closings` | 15 | tenant | 3 | sim |
| `shipment_destination_recoveries` | 11 | tenant | 3 | sim |
| `shipment_destinations` | 19 | tenant | 2 | sim |
| `shipment_notices` | 12 | tenant | 4 | sim |
| `shipment_orders` | 9 | tenant | 3 | sim |
| `shipment_positions` | 8 | tenant | 3 | — |
| `shipment_proofs` | 8 | tenant | 4 | sim |
| `shipment_route_versions` | 12 | tenant | 3 | sim |
| `shipments` | 11 | tenant | 2 | sim |
| `skill_activations` | 7 | tenant | 2 | — |
| `skill_pointers` | 4 | tenant | 2 | — |
| `skill_versions` | 7 | tenant | 1 | — |
| `storage_redaction_queue` | 3 | tenant | 0 | — |
| `suppliers` | 10 | tenant | 1 | sim |
| `system_update_runs` | 9 | **plataforma** | 1 | sim |
| `system_version` | 10 | **plataforma** | 1 | sim |
| `tenant_integrations` | 5 | tenant | 0 | — |
| `user_organizations` | 5 | tenant | 0 | — |
| `user_recovery_codes` | 2 | **plataforma** | 0 | — |
| `watchdog_cursors` | 4 | **plataforma** | 0 | — |
| `webhook_events_log` | 5 | tenant | 0 | — |
| `webhook_lead_captures` | 18 | tenant | 4 | sim |
| `webhook_sources` | 15 | tenant | 3 | — |

