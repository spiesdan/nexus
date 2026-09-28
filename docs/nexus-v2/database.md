# NEXUS 2.0 — Database

> 220 migrations (1,03 MB) + `baseline.sql` (958 KB, 38 tabelas core). 116 tabelas distinct. RLS 84 enables / 183 policies. Tenant = `organization_id` (1078 linhas, 130 arquivos).

## 1. Tabelas âncora por domínio

| Domínio | Tabelas |
|---|---|
| PLATFORM | `organizations`, `user_organizations`, `platform_admins`, `api_tokens`, `api_audit_log`, `system_update_runs/version` |
| CRM | `contacts`, `crm_leads`, `crm_lead_activities/links/scores/risk_states/reactivations`, `crm_pipelines/stages`, `merge_queue`, `contact_field_proposals` |
| SALES | `commercial_orders/items/counters`, `commercial_policies/goals/activities/tasks`, `commission_baixas`, `price_tables/items`, `product_categories`, `catalog_products`, `nuvemshop_products` |
| FINANCE | `financial_receivables/payments/pagaveis`, `titulo_baixas`, `invoices` |
| FISCAL | `fiscal_jobs/events/settings/entradas/inutilizacoes/cfop_equivalentes/entrada_cursor` |
| LOGISTICS | `shipments/orders/positions/proofs`, `commercial_shipment_counters` |
| WHATSAPP | `conversations`, `messages`, `conversation_notes/assignment_events/tags`, `channel_sessions/warmup/health`, `channel_knobs`, `message_templates`, `outbound_copies`, `send_ledger/pacing_ledger` |
| PROSPECTING | `business_prospects`, `prospect_search_results`, `prospecting_campaigns/searches/settings` |
| AGENDA | `calendar_appointments/availability_exceptions/connection_calendars/connections/event_types/external_events/oauth_nonces` |
| AI | `ai_agents/versions/runs/invocations`, `ai_routers/members/decisions`, `ai_knowledge_sources/versions`, `ai_chunks` (pgvector 1536), `ai_models/pricing`, `ai_provider_credentials`, `ai_budgets`, `ai_purpose_bindings`, `org_memory_entries/pointers/versions`, `org_guardrail_layers`, `llm_calls`, `knowledge_searches`, `skill_activations/pointers/versions`, `playbook/reentry/promise/flow/disclosure_template_*` |
| FOLLOW-UP | `followup_enrollments/enrollment_events`, `followup_flow_pointers/versions` |
| AUTOMATION | `automation_rules/runs`, `event_log`, `job_queue`, `cron_jobs`, `webhook_events_log/sources/lead_captures`, `demandas/demanda_conversas`, `agent_cases/case_events/inbox_items`, `incidents`, `metrics`, `push_subscriptions`, `before_send_traces` |
| LGPD | `lgpd_requests`, `storage_redaction_queue` |
| TEAM | `attendant_availability`, `user_recovery_codes` |

## 2. Índices críticos (§11)

Garantir/atualizar para: `commercial_orders` (bônus: `0232_indice_pedidos_cronologico`), `contacts`, `products/catalog_products`, `inventory` (a criar), `financial_*`, `messages` (conversa+tempo), `followups` (`next_eval_at`), `opportunities` (a criar), `campaigns`. Nunca query lenta em página quente (pedidos, inbox, radar).

## 3. RLS + multi-tenancy (§12–§13)

- Função única `fn_user_role_in_org` serve RLS e `requireRole`. Toda tabela comercial tem `organization_id` + policy `tenant_isolation_*_all`.
- Nenhum agente/worker/webhook/job acessa outro tenant. Auditar `agenda-nenhuma-tabela-sem-rls` + `hardening-definer-varredura` + `tests/invariants/*rls*`.
- `tenant_id`: só comentário histórico. `company_id`: 0. Não reintroduzir.

## 4. Migrations (§81)

Aditivas primeiro (additive → deploy → migração seguinte → remoção futura). Sem destrutiva imediata. Fila fiscal/eventos já segue esse padrão (`0234_fila_fiscal_e_eventos`).
