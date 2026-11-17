# Inventário de APIs

> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/inventario-completo.ts`.
> Fonte: `app/**/route.ts`. Gerado em 2026-11-17T16:38:51.452Z. Não editar à mão.

**419 handlers**. Medido no arquivo: métodos exportados, guarda, validação, efeitos declarados.

São **417** em `app/api/**` mais **2** fora (`/auth/confirm`, `/icone-512`). Dizer só um dos dois números faz o total parecer divergente — são medidas de coisas diferentes.

| Medida | Valor |
|---|---|
| Handlers | 419 |
| Sem nenhuma guarda identificável | 0 |
| Com `Idempotency-Key` | 2 |
| Com rate limit | 3 |
| Com `service role` | 332 |

## Por prefixo

| Prefixo | Handlers |
|---|---|
| `/api/v1/ai` | 68 |
| `/api/v1/prospecting` | 32 |
| `/api/v1/cron` | 30 |
| `/api/v1/shipments` | 25 |
| `/api/v1/admin` | 21 |
| `/api/v1/conversations` | 21 |
| `/api/v1/leads` | 13 |
| `/api/v1/commercial-orders` | 11 |
| `/api/v1/contacts` | 10 |
| `/api/v1/invoices` | 10 |
| `/api/v1/team` | 10 |
| `/api/v1/products` | 9 |
| `/api/v1/webhooks` | 9 |
| `/api/v1/financeiro` | 8 |
| `/api/v1/fiscal-entradas` | 8 |
| `/api/v1/pipelines` | 7 |
| `/api/v1/agenda` | 6 |
| `/api/v1/automatic-sales` | 5 |
| `/api/v1/automation-rules` | 5 |
| `/api/v1/channels` | 5 |
| `/api/v1/fleet` | 5 |
| `/api/v1/lgpd` | 5 |
| `/api/v1/system` | 5 |
| `/api/v1/channel-sessions` | 4 |
| `/api/v1/fiscal-inutilizacoes` | 4 |

## Handlers SEM guarda identificável (0)

Guarda "—" significa que nenhum marcador conhecido apareceu. Pode ser rota pública
legítima (webhook com HMAC, healthcheck) ou **buraco**. Cada linha precisa de olho humano.

| Rota | Métodos |
|---|---|

## Todos os handlers (419)

| Rota | Métodos | Guarda | Validação | Efeitos | Idem. | Limite |
|---|---|---|---|---|---|---|
| `/api/internal/agents/run` | POST | pública (auth na rota) · secret/bearer+service-role | zod inline | — | — | — |
| `/api/mcp` | POST, GET, DELETE | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/admin/audit` | GET | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/audit/[entryId]` | GET | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/dashboard/kpis` | GET | platform-admin+service-role | — | — | — | — |
| `/api/v1/admin/impersonate/end` | POST | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/admin/inbox/conversations` | GET | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/inbox/conversations/[id]` | GET | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/admin/incidents` | GET | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/incidents/[id]` | GET | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/admin/incidents/[id]/resolve` | POST | platform-admin+service-role | zod inline | auditoria, event_log | — | — |
| `/api/v1/admin/lgpd/requests` | GET | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/lgpd/requests/[id]` | GET | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/admin/platform-admins` | GET, POST, PATCH, DELETE | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/admin/tenants` | GET, POST | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/tenants/[id]` | GET | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/admin/tenants/[id]/health` | GET | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/admin/tenants/[id]/impersonate` | POST | platform-admin+service-role | — | auditoria, event_log | — | — |
| `/api/v1/admin/tenants/[id]/reactivate` | POST | platform-admin+service-role | zod inline | auditoria, event_log | — | — |
| `/api/v1/admin/tenants/[id]/suspend` | POST | platform-admin+service-role | zod inline | auditoria, event_log | — | — |
| `/api/v1/admin/usage` | GET | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/users` | GET | platform-admin+service-role | zod inline | auditoria | — | — |
| `/api/v1/admin/users/[id]` | GET | platform-admin+service-role | — | auditoria | — | — |
| `/api/v1/agenda/agendamentos` | GET, POST, PATCH, DELETE | requireRole(viewer|agent|manager|admin) | zod inline | — | — | — |
| `/api/v1/agenda/google/callback` | GET | pública (auth na rota) · sessão+service-role | — | auditoria | — | — |
| `/api/v1/agenda/google/connect` | GET | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/agenda/google/desconectar` | DELETE | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/agenda/horarios-livres` | GET | requireRole(viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/agenda/tipos` | GET, POST, PATCH, DELETE | requireRole(viewer|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/agents` | GET, POST | requireRole(manager|admin)+service-role | McpCreateSchema, CreateSchema | auditoria | — | — |
| `/api/v1/ai/agents/[id]` | GET, PATCH, DELETE | requireRole(manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/ai/agents/[id]/duplicate` | POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/ai/agents/[id]/pause` | POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/ai/agents/[id]/proposals` | GET | requireRole(agent|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/ai/agents/[id]/proposals/[pid]/apply` | POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/ai/agents/[id]/publish` | POST | requireRole(admin|manager)+service-role | zod inline | auditoria, event_log | — | — |
| `/api/v1/ai/agents/[id]/runs` | GET | requireRole(manager|admin) | ListQuerySchema | — | — | — |
| `/api/v1/ai/agents/[id]/tool-usage` | GET | requireRole(manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/ai/agents/[id]/versions` | GET, POST | requireRole(manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/ai/agents/[id]/versions/[vid]` | GET, PATCH | requireRole(manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/ai/agents/[id]/versions/[vid]/test` | POST | requireRole(admin|manager)+service-role | RunSchema | auditoria | — | — |
| `/api/v1/ai/agents/assignable` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/ai/automatico-ativo` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/ai/budget` | GET, PATCH | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/cases` | GET | requireRole(agent|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/ai/cases/[id]` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/ai/cases/[id]/reply` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria, fila | — | — |
| `/api/v1/ai/controle/resumo` | GET | requireRole(manager|admin) | — | — | — | — |
| `/api/v1/ai/credentials` | GET, POST | requireRole(manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/ai/credentials/[id]` | DELETE | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/ai/credentials/[id]/revalidate` | POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/ai/decisions/[id]/decide` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/decisions/[id]/executar` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/decisions/propose` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/evolution` | GET | requireRole(manager|admin) | zod inline | event_log | — | — |
| `/api/v1/ai/followup-flows` | GET, POST | requireRole(viewer|manager|admin)+service-role | FollowupFlowSchema | auditoria | — | — |
| `/api/v1/ai/followup-flows/[id]` | GET, PATCH, DELETE | requireRole(viewer|manager|admin)+service-role | FollowupFlowSchema | auditoria | — | — |
| `/api/v1/ai/followup-flows/[id]/disable` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/followup-flows/[id]/publish` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/followup-flows/[id]/rollback` | POST | requireRole(manager|admin)+service-role | FollowupFlowSchema | auditoria | — | — |
| `/api/v1/ai/followups/enrollments` | GET, POST | requireRole(viewer|manager|admin) | FollowupEnrollmentSchema | — | — | — |
| `/api/v1/ai/followups/enrollments/[id]` | GET | requireRole(viewer|manager|admin)+service-role | GraphSchema | — | — | — |
| `/api/v1/ai/followups/enrollments/[id]/cancel` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/followups/enrollments/[id]/pause` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/followups/enrollments/[id]/resume` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/followups/enrollments/[id]/skip` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/followups/enrollments/[id]/snooze` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/followups/promises/[id]/cancel` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/followups/queue` | GET | requireRole(viewer|manager|admin) | zod inline | fila | — | — |
| `/api/v1/ai/guardrail-layers` | GET, PUT | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/inbox` | GET | requireRole(agent|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/ai/inbox/[id]` | PATCH | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/knowledge/chave` | GET | requireRole(manager|admin)+service-role | — | — | — | — |
| `/api/v1/ai/knowledge/sources` | GET, POST | requireRole(manager|admin)+service-role | SourceSchema | — | — | — |
| `/api/v1/ai/knowledge/sources/[id]` | GET, PATCH, DELETE | requireRole(manager|admin)+service-role | SourceSchema | — | — | — |
| `/api/v1/ai/knowledge/sources/[id]/reindex` | POST | requireRole(manager|admin)+service-role | BodySchema | fila | — | — |
| `/api/v1/ai/knowledge/sources/[id]/trechos` | GET | requireRole(manager|admin) | — | — | — | — |
| `/api/v1/ai/knowledge/sources/upload` | POST | requireRole(manager|admin)+service-role | IdSchema | storage | — | — |
| `/api/v1/ai/memory` | GET, POST | requireRole(agent|admin|manager)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/memory/entries` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/memory/entries/[id]` | PATCH | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/memory/versions/[id]` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/ai/operator-metrics` | GET | requireRole(manager|admin) | — | event_log | — | — |
| `/api/v1/ai/pacing` | GET, PUT | requireRole(agent|manager|admin)+service-role | KnobsUpdateSchema | auditoria | — | — |
| `/api/v1/ai/policies` | GET, PATCH | requireRole(viewer|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/providers` | GET, PUT | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/providers/[provider]/models` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/ai/routers` | GET, POST | requireRole(agent|admin|manager)+service-role | RouterSchema | auditoria | — | — |
| `/api/v1/ai/routers/[id]` | GET, PATCH, DELETE | requireRole(agent|admin|manager)+service-role | RouterSchema | auditoria | — | — |
| `/api/v1/ai/routers/[id]/members` | PUT | requireRole(admin|manager)+service-role | PutSchema | auditoria | — | — |
| `/api/v1/ai/routers/[id]/test` | POST | requireRole(manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/ai/runs` | GET | requireRole(manager|admin) | zod inline | — | — | — |
| `/api/v1/ai/skills` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/ai/skills/[name]` | DELETE | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/skills/[name]/install` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/ai/skills/import` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/ai/usage` | GET | requireRole(manager|admin) | zod inline | event_log | — | — |
| `/api/v1/alertas` | GET | requireRole(viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/alertas/[id]` | PATCH | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/assistente/chat` | POST | requireRole(viewer|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/assistente/executar` | POST | requireRole(manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/atividades` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/attendants/availability` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/attendants/availability/[user_id]` | PATCH | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/audit` | GET | requireRole(manager|admin) | QuerySchema | — | — | — |
| `/api/v1/audit/export` | GET | requireRole(manager|admin) | QuerySchema | — | — | — |
| `/api/v1/auth/realtime-token` | GET | sessão | — | — | — | — |
| `/api/v1/automatic-sales/campaigns` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | VaCreateSchema | auditoria | — | — |
| `/api/v1/automatic-sales/campaigns/[id]` | GET, PATCH, DELETE | requireRole(viewer|agent|manager|admin)+service-role | VaUpdateSchema | auditoria | — | — |
| `/api/v1/automatic-sales/campaigns/[id]/painel` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/automatic-sales/campaigns/[id]/queue` | GET | requireRole(viewer|manager|admin) | — | fila | — | — |
| `/api/v1/automatic-sales/queue/[id]` | POST | requireRole(agent|manager|admin)+service-role | DaFilaSchema | auditoria, fila | — | — |
| `/api/v1/automation-rules` | GET, POST | requireRole(manager|admin)+service-role | AutomationRuleSchema | auditoria | — | — |
| `/api/v1/automation-rules/[id]` | PATCH, DELETE | requireRole(manager|admin)+service-role | AutomationRuleSchema | auditoria | — | — |
| `/api/v1/automation-rules/[id]/runs` | GET | requireRole(manager|admin) | — | — | — | — |
| `/api/v1/automation-rules/runs` | GET | requireRole(manager|admin) | — | — | — | — |
| `/api/v1/automation-rules/runs/[runId]/resend` | POST | requireRole(manager|admin)+service-role | — | auditoria, event_log, e-mail | — | — |
| `/api/v1/categories` | GET, POST | requireRole(viewer|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/categories/[id]` | GET, PATCH, DELETE | requireRole(viewer|manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/channel-sessions` | GET, POST | requireRole(admin|manager)+service-role | ChannelSchema | auditoria | — | — |
| `/api/v1/channel-sessions/[id]` | GET, PATCH, DELETE | requireRole(admin|manager)+service-role | zod inline | auditoria | — | — |
| `/api/v1/channel-sessions/[id]/qr` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/channel-sessions/[id]/reconnect` | POST | requireRole(admin|manager)+service-role | zod inline | auditoria | — | — |
| `/api/v1/channels/official` | GET, POST | requireRole(admin|manager)+service-role | zod inline | — | — | — |
| `/api/v1/channels/partner` | GET, POST | requireRole(admin|manager)+service-role | zod inline | — | — | — |
| `/api/v1/channels/partner/templates` | GET, POST | sessão+service-role | zod inline | auditoria | — | — |
| `/api/v1/channels/partner/templates/media` | POST | sessão+service-role | — | — | — | — |
| `/api/v1/channels/templates` | GET, POST | requireRole(admin|manager)+service-role | — | — | — | — |
| `/api/v1/comercial/inativos` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/commercial-goals` | GET, PUT | requireRole(viewer|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/commercial-orders` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/commercial-orders/[id]` | GET, PATCH, DELETE | requireRole(viewer|agent|manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/commercial-orders/[id]/duplicar` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/commercial-orders/[id]/itens` | PATCH | requireRole(agent|manager|admin)+service-role | PatchSchema | — | — | — |
| `/api/v1/commercial-orders/[id]/mercos` | POST | requireRole(manager|admin)+service-role | — | auditoria, fila | — | — |
| `/api/v1/commercial-orders/[id]/orcamento` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/commercial-orders/[id]/pdf` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/commercial-orders/[id]/timeline` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/commercial-orders/importar-ia` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | sim |
| `/api/v1/commercial-orders/importar-mercos` | GET, POST | requireRole(viewer|manager|admin)+service-role | — | auditoria, fila | — | — |
| `/api/v1/commercial-orders/pdf` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/commercial-policies` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/commissions` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/commissions/baixas` | POST, DELETE | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/contacts` | GET, POST | requireRole(agent|manager|admin)+service-role | ListQuerySchema | — | — | — |
| `/api/v1/contacts/[id]` | GET, PATCH, DELETE | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/contacts/[id]/avatar` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/contacts/[id]/crm-summary` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/contacts/[id]/proposals` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/contacts/[id]/proposals/[proposal_id]` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/contacts/[id]/timeline` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/contacts/bulk-tag` | POST | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/contacts/cnpj-lookup` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/contacts/import` | POST | requireRole(agent|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/conversation-tags` | GET | requireRole(viewer|manager|admin) | ConversationTagsSchema | — | — | — |
| `/api/v1/conversations` | GET | sessão+service-role | ConversationsQuerySchema | — | — | — |
| `/api/v1/conversations/[id]` | GET, PATCH | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/conversations/[id]/claim` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/[id]/close` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/[id]/draft-reply` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/conversations/[id]/mark-read` | POST | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/conversations/[id]/media` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/conversations/[id]/messages` | GET | sessão+service-role | MessagesQuerySchema | — | — | — |
| `/api/v1/conversations/[id]/no-send` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/[id]/notes` | GET, POST | requireRole(agent|manager|admin)+service-role | NoteSchema | auditoria | — | — |
| `/api/v1/conversations/[id]/notes/[noteId]` | DELETE | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/[id]/pause-ai` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/[id]/reactivate-bot` | POST | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/conversations/[id]/release` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/[id]/retention` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/conversations/[id]/snooze` | POST, DELETE | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/conversations/[id]/transfer` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/[id]/usable-for-rag` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/arquivar-todas` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/conversations/counts` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/conversations/open-with-contact` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/copilot/context` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/cron/agenda-google-push` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/agenda-google-refresh` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/agenda-google-sync` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/agent-dispatcher` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/attendant-heartbeat` | GET | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/automatic-sales` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/channel-health` | (sem export nomeado) | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/contact-avatars` | (sem export nomeado) | pública (auth na rota) · secret/bearer+service-role | — | fila | — | — |
| `/api/v1/cron/contact-phones` | (sem export nomeado) | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/contact-proposals-watcher` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/data-retention` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria, fila | — | — |
| `/api/v1/cron/event-log-drain` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | event_log | — | — |
| `/api/v1/cron/expedition-notices` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/fiscal-drain` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/fiscal-entradas-sync` | GET, POST | pública (auth na rota) · secret/bearer+service-role | zod inline | — | — | — |
| `/api/v1/cron/followup-flow-worker` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria, fila | — | — |
| `/api/v1/cron/kb-conversations-batch` | GET | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/lgpd-sla-watcher` | GET | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/mercos-import` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/meu-dia-alertas` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/prospecting-drain` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/prospecting-fit` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/prospecting-send` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/recover-stuck-messages` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/risk-watcher` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/routing-worker` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria, event_log | — | — |
| `/api/v1/cron/snooze-watcher` | GET, POST | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/cron/storage-redaction` | GET | pública (auth na rota) · secret/bearer+service-role | — | fila | — | — |
| `/api/v1/cron/sync-model-catalog` | (sem export nomeado) | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/cron/webhook-log-retention` | GET | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/demandas/[id]` | PATCH | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/faturamento` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/financeiro/conciliacao` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/financeiro/dashboard` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/financeiro/fluxo` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/financeiro/gerar` | POST | requireRole(manager|admin)+service-role | FinanceiroSchema | auditoria | — | — |
| `/api/v1/financeiro/pagamentos/[id]` | DELETE | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/financeiro/recebiveis` | GET, POST | requireRole(viewer|manager|admin)+service-role | QuerySchema, CreateSchema | auditoria | — | — |
| `/api/v1/financeiro/recebiveis/[id]` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/financeiro/recebiveis/[id]/pagamentos` | POST | requireRole(manager|admin)+service-role | CreateSchema | auditoria | sim | — |
| `/api/v1/financial-pagaveis` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-cfop-equivalentes` | GET, POST | requireRole(viewer|manager|admin)+service-role | EquivalenteSchema | auditoria | — | — |
| `/api/v1/fiscal-cfop-equivalentes/[id]` | PUT, DELETE | requireRole(manager|admin)+service-role | EquivalenteSchema | auditoria | — | — |
| `/api/v1/fiscal-entradas` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/fiscal-entradas/[id]` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-entradas/[id]/conferencia` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/fiscal-entradas/[id]/ignorar` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/fiscal-entradas/[id]/importar` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/fiscal-entradas/[id]/itens/[itemId]` | PATCH | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/fiscal-entradas/[id]/manifestar` | POST | requireRole(agent|manager|admin)+service-role | EntradaSchema | auditoria | — | — |
| `/api/v1/fiscal-entradas/[id]/xml` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-eventos` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-events/[id]/retransmitir` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/fiscal-fornecedores` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-ibpt/consulta` | GET | requireRole(viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/fiscal-ibpt/importar` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/fiscal-ibpt/importar-siscomex` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/fiscal-inutilizacoes` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/fiscal-inutilizacoes/[id]/retransmitir` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/fiscal-inutilizacoes/lacunas` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/fiscal-inutilizacoes/puladas` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/fiscal-jobs` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-manifestacoes` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-produtos` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-relatorios` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal-settings` | GET, PUT | requireRole(viewer|manager|admin)+service-role | FiscalSchema | auditoria | — | — |
| `/api/v1/fiscal-settings/certificado` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/fiscal-sincronizacoes` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fiscal/cadastro-do-cnpj` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/fleet` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/fleet/drivers` | GET, POST | requireRole(viewer|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/fleet/drivers/[id]` | PATCH, DELETE | requireRole(manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/fleet/vehicles` | GET, POST | requireRole(viewer|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/fleet/vehicles/[id]` | PATCH, DELETE | requireRole(manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/health` | GET | pública (auth na rota) · secret/bearer+service-role | — | — | — | — |
| `/api/v1/home/mes` | GET | requireRole(viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/indicadores/perguntar` | POST | requireRole(viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/integrations/nuvemshop/callback` | GET | pública (auth na rota) · secret/bearer+service-role | — | auditoria | — | — |
| `/api/v1/inventory/movements` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/inventory/sugestoes` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/invoices` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/invoices/[id]` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/invoices/[id]/ajustes` | GET, PATCH | requireRole(viewer|agent|manager|admin)+service-role | DaNotaSchema | — | — | — |
| `/api/v1/invoices/[id]/cancel` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/invoices/[id]/carta-correcao` | POST | requireRole(agent|manager|admin)+service-role | CorrecaoSchema | auditoria | — | — |
| `/api/v1/invoices/[id]/danfe` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/invoices/[id]/reemitir` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/invoices/[id]/xml` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/invoices/importar-xmls` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/invoices/validar` | POST | requireRole(agent|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/lead-captures` | GET | requireRole(manager|admin) | CapturesQuerySchema | — | — | — |
| `/api/v1/leads` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/leads/[id]` | PATCH | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/leads/[id]/lose` | POST | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/leads/[id]/move` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/leads/[id]/next-action` | POST | requireRole(agent|manager|admin) | zod inline | — | — | — |
| `/api/v1/leads/[id]/reactivation` | POST | requireRole(agent|manager|admin) | zod inline | — | — | — |
| `/api/v1/leads/[id]/timeline` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/leads/[id]/win` | POST | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/leads/at-risk` | GET | requireRole(agent|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/leads/bulk` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/leads/import` | POST, GET | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/leads/proposals` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/leads/reactivations` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/lgpd/anonymize` | POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/lgpd/requests` | GET | requireRole(admin|manager) | zod inline | — | — | — |
| `/api/v1/lgpd/requests/[id]` | GET | requireRole(admin|manager)+service-role | — | — | — | — |
| `/api/v1/lgpd/requests/[id]/approve` | POST | requireRole(admin|manager)+service-role | zod inline | auditoria, event_log | sim | — |
| `/api/v1/lgpd/requests/[id]/preview` | GET | requireRole(admin|manager)+service-role | — | — | — | — |
| `/api/v1/marca/logo` | POST, DELETE | platform-admin+service-role | zod inline | auditoria, event_log, storage | — | sim |
| `/api/v1/mcp/tools` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/message-templates` | GET, POST | requireRole(agent|manager|admin)+service-role | TemplateSchema | auditoria | — | — |
| `/api/v1/message-templates/[id]` | PATCH, DELETE | requireRole(agent|manager|admin)+service-role | TemplateSchema | auditoria | — | — |
| `/api/v1/messages` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/messages/[id]/media` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/metrics/atrito` | GET, PATCH | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/metrics/attendants` | GET | requireRole(agent|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/notifications/push` | GET, PUT, DELETE | requireRole(viewer|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/onboarding/whatsapp/qr` | GET | sessão+service-role | — | — | — | — |
| `/api/v1/onboarding/whatsapp/session` | GET, POST | sessão+service-role | — | — | — | — |
| `/api/v1/pipelines` | GET, POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/pipelines/[id]` | PATCH, DELETE | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/pipelines/[id]/agent-mapping` | GET, PUT | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/pipelines/[id]/board` | GET | sessão | — | — | — | — |
| `/api/v1/pipelines/[id]/stages` | POST | requireRole(manager|admin) | zod inline | — | — | — |
| `/api/v1/pipelines/[id]/stages/[stageId]` | PATCH, DELETE | requireRole(manager|admin) | zod inline | — | — | — |
| `/api/v1/pipelines/default` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/price-tables` | GET, POST | requireRole(viewer|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/price-tables/[id]` | GET, PATCH | requireRole(viewer|manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/price-tables/[id]/items` | PUT | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/products` | GET, POST | requireRole(viewer|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/products/[id]` | PATCH, DELETE | requireRole(manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/products/[id]/images` | GET, POST | requireRole(viewer|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/products/[id]/images/[imageId]` | GET, DELETE | requireRole(viewer|manager|admin)+service-role | — | auditoria, storage | — | — |
| `/api/v1/products/afins` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/products/images` | POST | requireRole(viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/products/import` | POST, GET | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/products/ncm-completar` | POST | requireRole(manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/products/ncm-sugestao` | GET | requireRole(viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/prospecting/campaigns` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | CreateSchema | fila | — | — |
| `/api/v1/prospecting/campaigns/[id]` | GET, PATCH, DELETE | requireRole(viewer|agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/prospecting/campaigns/[id]/controle` | GET | requireRole(viewer|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/prospecting/campaigns/[id]/executar` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria, fila | — | — |
| `/api/v1/prospecting/campaigns/[id]/laboratorio` | POST, GET | requireRole(manager|viewer|admin)+service-role | — | auditoria | — | — |
| `/api/v1/prospecting/campaigns/[id]/liberar-reservas` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/prospecting/campaigns/[id]/painel` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/prospecting/campaigns/[id]/publico` | GET | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/prospecting/campaigns/[id]/reenviar-falhas-de-pagamento` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/prospecting/campaigns/canais` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/prospecting/campaigns/midia` | POST | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/prospecting/campaigns/numeros` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/prospecting/campaigns/opcoes` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/prospecting/campaigns/preview` | POST | requireRole(agent|manager|admin)+service-role | PreviewSchema | auditoria | — | — |
| `/api/v1/prospecting/campaigns/recuperacao` | POST | requireRole(agent|manager|admin)+service-role | DeRecuperacaoSchema | — | — | — |
| `/api/v1/prospecting/campaigns/recuperacao/preview` | POST | requireRole(agent|manager|admin)+service-role | PreviewSchema | auditoria | — | — |
| `/api/v1/prospecting/campaigns/regiao` | POST | requireRole(agent|manager|admin)+service-role | PorRegiaoSchema | — | — | — |
| `/api/v1/prospecting/campaigns/regiao/cidades` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/prospecting/campaigns/regiao/preview` | POST | requireRole(agent|manager|admin)+service-role | PreviewSchema | auditoria | — | — |
| `/api/v1/prospecting/consumo` | GET | requireRole(manager|admin) | — | — | — | — |
| `/api/v1/prospecting/mensagens-por-categoria` | GET, PUT | requireRole(agent|manager|admin)+service-role | PorCategoriaSchema | auditoria | — | — |
| `/api/v1/prospecting/mercado` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/prospecting/prospects` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/prospecting/prospects/[id]` | PATCH, DELETE | requireRole(agent|manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/prospecting/prospects/[id]/raio-x` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/prospecting/prospects/categorias` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/prospecting/prospects/disparar` | POST | requireRole(agent|manager|admin)+service-role | zod inline | fila | — | — |
| `/api/v1/prospecting/prospects/import` | POST | requireRole(agent|manager|admin)+service-role | BatchSchema | auditoria | — | — |
| `/api/v1/prospecting/prospects/import-arquivo` | POST | requireRole(agent|manager|admin)+service-role | MapsSchema | auditoria | — | — |
| `/api/v1/prospecting/searches` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | CreateSchema | auditoria, fila | — | — |
| `/api/v1/prospecting/searches/[id]` | GET, PATCH | requireRole(viewer|agent|manager|admin)+service-role | zod inline | auditoria, fila | — | — |
| `/api/v1/prospecting/settings` | GET, PUT | requireRole(manager|admin)+service-role | PutSchema | auditoria | — | — |
| `/api/v1/public/orcamento/[token]` | GET, POST | pública (auth na rota) · —service-role | — | — | — | — |
| `/api/v1/purchase-orders` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/purchase-orders/[id]` | GET, PATCH | requireRole(viewer|agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/purchase-orders/[id]/receber` | POST | requireRole(agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/radar-compras` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/roadmap` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/rotas` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/sales-brain` | GET | requireRole(viewer|manager|admin)+service-role | — | — | — | — |
| `/api/v1/settings/api-tokens` | GET, POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/settings/api-tokens/[id]/revoke` | POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/settings/routing` | GET, PATCH | requireRole(manager|admin)+service-role | ConfigSchema | auditoria | — | — |
| `/api/v1/shipments` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/shipments/[id]` | GET, PATCH, DELETE | requireRole(viewer|agent|manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/shipments/[id]/conciliar` | POST | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/destinos/[destinationId]/confirmar` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/destinos/[destinationId]/entrada/confirmar` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/destinos/[destinationId]/rejeitar` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/destinos/[destinationId]/reverter` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/fechamento` | GET, PUT | requireRole(viewer|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/fechamento/pdf` | GET | requireRole(viewer|manager|admin)+service-role | zod inline | — | — | — |
| `/api/v1/shipments/[id]/orders` | GET, POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/orders/[orderId]` | PATCH, DELETE | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/orders/[orderId]/proof` | POST, GET | requireRole(agent|viewer|manager|admin)+service-role | — | auditoria, storage | — | — |
| `/api/v1/shipments/[id]/romaneio` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/shipments/[id]/rota` | GET | requireRole(viewer|manager|admin) | — | — | — | — |
| `/api/v1/shipments/[id]/rota/distribuicao` | PATCH | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/rota/finalizar` | POST | requireRole(agent)+service-role | — | — | — | — |
| `/api/v1/shipments/[id]/rota/geocodificar` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/rota/iniciar` | POST | requireRole(agent)+service-role | — | — | — | — |
| `/api/v1/shipments/[id]/rota/manual` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/rota/ordem` | PATCH | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/shipments/[id]/rota/otimizar` | POST | requireRole(agent|manager|admin) | zod inline | — | — | — |
| `/api/v1/shipments/[id]/rota/otimizar/veiculos` | POST | requireRole(agent|manager|admin) | zod inline | — | — | — |
| `/api/v1/shipments/[id]/rota/posicao` | POST, GET | requireRole(agent|viewer|manager|admin) | zod inline | — | — | — |
| `/api/v1/shipments/[id]/rota/recuperacoes` | GET | requireRole(agent|manager|admin) | — | — | — | — |
| `/api/v1/shipments/[id]/rota/recuperar` | POST | requireRole(agent|manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/sped/arquivo` | GET | requireRole(manager|admin) | — | — | — | — |
| `/api/v1/suppliers` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | — | auditoria | — | — |
| `/api/v1/system/agent` | POST | pública (auth na rota) · secret/bearer+service-role | zod inline | auditoria | — | — |
| `/api/v1/system/instalacao` | GET | requireRole(manager|admin)+service-role | — | — | — | — |
| `/api/v1/system/relogio/tick` | POST, GET | pública (auth na rota) · requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/system/update` | POST | sessão+service-role | — | auditoria | — | — |
| `/api/v1/system/version` | GET | sessão+service-role | zod inline | — | — | — |
| `/api/v1/tarefas` | GET, POST | requireRole(viewer|agent|manager|admin)+service-role | CreateSchema | auditoria | — | — |
| `/api/v1/tarefas/[id]` | PATCH | requireRole(agent|manager|admin)+service-role | PatchSchema | auditoria | — | — |
| `/api/v1/team` | GET | requireRole(manager|admin)+service-role | — | — | — | — |
| `/api/v1/team/[user_id]` | PATCH | requireRole(admin)+service-role | — | — | — | — |
| `/api/v1/team/[user_id]/canais` | PATCH | requireRole(admin)+service-role | — | — | — | — |
| `/api/v1/team/[user_id]/motorista` | PATCH | requireRole(admin)+service-role | — | — | — | — |
| `/api/v1/team/[user_id]/nome` | PATCH | requireRole(admin)+service-role | — | — | — | — |
| `/api/v1/team/[user_id]/revoke` | POST | requireRole(admin|manager)+service-role | — | auditoria | — | — |
| `/api/v1/team/[user_id]/role` | PATCH | requireRole(admin)+service-role | — | — | — | — |
| `/api/v1/team/[user_id]/setor` | PATCH | requireRole(admin)+service-role | — | — | — | — |
| `/api/v1/team/assignable` | GET | requireRole(agent|manager|admin)+service-role | — | — | — | — |
| `/api/v1/team/invite` | POST | requireRole(admin|manager)+service-role | — | auditoria, e-mail | — | — |
| `/api/v1/titulos` | GET | requireRole(viewer|manager|admin) | — | fila | — | — |
| `/api/v1/titulos/baixas` | POST, DELETE | requireRole(manager|admin)+service-role | zod inline | auditoria | — | — |
| `/api/v1/webhook-sources` | GET, POST | requireRole(manager|admin)+service-role | WebhookSourceSchema | — | — | — |
| `/api/v1/webhook-sources/[id]` | PATCH, DELETE | requireRole(manager|admin)+service-role | WebhookSourceSchema | auditoria | — | — |
| `/api/v1/webhook-sources/[id]/events` | GET | requireRole(manager|admin) | — | — | — | — |
| `/api/v1/webhooks/channel/[token]` | POST | token na rota (HMAC/segredo decifrado) | — | — | — | — |
| `/api/v1/webhooks/in/[token]` | POST | token na rota (HMAC/segredo decifrado) | zod inline | auditoria, event_log | — | sim |
| `/api/v1/webhooks/meta/[token]` | GET, POST | token na rota (HMAC/segredo decifrado) | zod inline | — | — | — |
| `/api/v1/webhooks/nuvemshop/[event]` | POST | pública (auth na rota) · secret/bearer+service-role | zod inline | auditoria, event_log | — | — |
| `/api/v1/webhooks/nuvemshop/customer-data-request` | POST | pública (auth na rota) · secret/bearer+service-role | zod inline | auditoria, event_log | — | — |
| `/api/v1/webhooks/nuvemshop/customer-redact` | POST | pública (auth na rota) · secret/bearer+service-role | zod inline | auditoria, event_log | — | — |
| `/api/v1/webhooks/nuvemshop/store-redact` | POST | pública (auth na rota) · secret/bearer+service-role | zod inline | auditoria | — | — |
| `/api/v1/webhooks/waha` | POST | pública (auth na rota) · secret/bearer+service-role | zod inline | auditoria | — | — |
| `/api/v1/webhooks/waha/[token]` | POST | token na rota (HMAC/segredo decifrado) | zod inline | auditoria | — | — |
| `/auth/confirm` | GET | pública (auth na rota) · sessão+service-role | — | auditoria | — | — |
| `/icone-512` | GET | pública (auth na rota) · —service-role | — | — | — | — |

