# Inventário de dados — medido no schema

> Gerado por `pnpm exec tsx scripts/auditoria/inventario-dados.ts`. Não editar à mão.

Três fontes, três verdades. Divergência entre elas é achado, não ruído.

| Medida | `database.types.ts` | `baseline.sql` | `migrations/` |
|---|---|---|---|
| Tabelas | 177 | 180 | 148 |
| Views | 2 | 2 | 2 |
| Funções | 35 | 93 | 80 |
| Enums | 0 | 0 | 0 |
| Triggers | — | 67 | 72 |
| Tabelas com RLS (texto) | — | 142 | 110 |
| Políticas (texto) | — | 303 | 259 |

> **As duas últimas linhas contam TEXTO, não banco.** Elas casam
> `enable row level security` e `create policy` no arquivo. O baseline liga RLS
> também por laço (`execute format('alter table public.%I enable row level
> security', t)` em quatro blocos), então a contagem textual SUBESTIMA a
> cobertura. Medido num Postgres limpo com o baseline aplicado: **179 de 179
> tabelas de `public` com RLS ligada, 0 sem** — e 300 políticas em `public`
> (305 com `storage`). A medida no banco, com o diagnóstico de RLS e o replay
> de migrations, está em `docs/auditoria/12-migrations-e-rls.md`.
## Tabelas no TypeScript que NÃO estão no baseline (0)

Nenhum.

## Tabelas no baseline que NÃO estão nas migrations (32)

- `ai_agents`
- `ai_budgets`
- `ai_chunks`
- `ai_faq_items`
- `ai_invocations`
- `ai_knowledge_sources`
- `ai_knowledge_versions`
- `ai_pricing`
- `api_audit_log`
- `api_tokens`
- `channel_session_warmup`
- `channel_sessions`
- `contacts`
- `conversations`
- `crm_lead_activities`
- `crm_lead_links`
- `crm_leads`
- `crm_pipelines`
- `crm_stages`
- `event_log`
- `idempotency_keys`
- `lgpd_requests`
- `merge_queue`
- `messages`
- `nuvemshop_products`
- `orders`
- `organizations`
- `platform_admins`
- `tenant_integrations`
- `user_organizations`
- `user_recovery_codes`
- `webhook_events_log`

## Tabelas nas migrations que NÃO estão no baseline (0)

Nenhum.

## Tabelas sem `enable row level security` LITERAL no baseline (não é ausência de RLS) (38)

- `agent_inbox_items`
- `ai_router_decisions`
- `ai_router_members`
- `ai_routers`
- `before_send_traces`
- `channel_knobs`
- `channel_session_health`
- `cron_jobs`
- `disclosure_template_pointers`
- `disclosure_template_versions`
- `flywheel_distiller_proposals`
- `flywheel_judge_verdicts`
- `job_queue`
- `judge_alignment_pool`
- `lead_checkpoints`
- `lead_notes`
- `lead_state`
- `lead_state_transitions`
- `llm_calls`
- `metrics`
- `org_memory_entries`
- `org_memory_pointers`
- `org_memory_versions`
- `outbound_copies`
- `pacing_ledger`
- `playbook_pointers`
- `playbook_versions`
- `private`
- `promise_table_pointers`
- `promise_table_versions`
- `reentry_knob_pointers`
- `reentry_knob_versions`
- `reentry_template_pointers`
- `reentry_template_versions`
- `send_ledger`
- `skill_activations`
- `skill_pointers`
- `skill_versions`

## Tabelas com RLS e NENHUMA política (5)

- `platform_branding`
- `platform_google_oauth`
- `system_update_runs`
- `system_version`
- `watchdog_cursors`

## Funções no baseline que o TypeScript não conhece (58)

- `encrypt_cpf`
- `fn_adotar_tipos_de_agendamento_sem_dono`
- `fn_agent_versions_immutable`
- `fn_agora`
- `fn_ai_agent_version_content_immutable`
- `fn_apaga_propostas_de_contato_anonimizado`
- `fn_aplicar_status_mercos`
- `fn_atrito_jaccard`
- `fn_audit_log_row`
- `fn_can_view_channel`
- `fn_carimba_detected_at`
- `fn_carimba_proposta_de_dado`
- `fn_carimba_reativacao`
- `fn_carimbar_ida_ao_google`
- `fn_conversas_contagens`
- `fn_crm_lead_close_on_stage`
- `fn_decrypt_oauth`
- `fn_demanda_abre_no_inbound`
- `fn_demanda_fecha_com_conversa`
- `fn_devolver_numero_nfe`
- `fn_emit_agent_case_event`
- `fn_emit_channel_session_status_changed`
- `fn_emit_conversation_routing`
- `fn_emit_event_on_lead_change`
- `fn_emit_message_event`
- `fn_encrypt_oauth`
- `fn_gasto_de_ia_do_mes`
- `fn_liberar_leads_do_agente`
- `fn_limpar_vinculos_do_agendamento`
- `fn_mercos_fundir_duplicados`
- `fn_mercos_nome`
- `fn_mercos_pago_e_entregue`
- `fn_proximo_numero_carga`
- `fn_proximo_numero_compra`
- `fn_proximo_numero_pedido`
- `fn_redigir_agenda_do_contato_anonimizado`
- `fn_redigir_captacoes_do_contato_anonimizado`
- `fn_redigir_prospeccao_e_fiscal_do_contato_anonimizado`
- `fn_reservar_numero_nfe`
- `fn_seed_default_pipeline_for_org`
- `fn_seed_org_llm_defaults`
- `fn_semear_tipos_de_agendamento_na_org_nova`
- `fn_separar_cidade_uf`
- `fn_set_updated_at`
- `fn_sincronizar_pedido_mercos`
- `fn_stamp_stage_changed_at`
- `fn_touch_updated_at`
- `fn_uf_do_estado`
- `fn_update_budget_consumption`
- `fn_update_last_activity_at`
- `fn_user_org_ids`
- `fn_user_role_in`
- `fn_user_role_in_org`
- `fn_validate_activity_lead_org`
- `fn_validate_lost_reason_required`
- `midpoint`
- `private`
- `prospecting_campaign_reserva_unica`

