# NEXUS 2.0 — Parity Matrix (obrigatória §5)

> Nunca assumir inexistência sem investigar. Status medido em 2026-09-24.

| Funcionalidade | Existe | Funciona | Preservar | Refatorar | Recriar | Remover | Prova |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Clientes | ✅ | ✅ | ✅ | ✅ | — | — | `contacts/` API+UI+`[id]/_whatsapp360` |
| Contatos | ✅ | ✅ | ✅ | ✅ | — | — | `contacts`, `contact_field_proposals`, `contact-phones` cron |
| Customer 360 | ✅ | ✅ | ✅ | ✅ | — | — | migration `0003_customer_360`, timeline, `_whatsapp360` |
| Oportunidades/pipelines | ✅ | ✅ | ✅ | ✅ | — | — | `crm_pipelines/stages`, `kanban/` 20 comps, `pipelines/[id]` |
| Pedidos | ✅ | ✅ | ✅ | ✅ | — | — | `commercial_orders/items`, `criar-pedido.ts`, `pedidos/novo` |
| Pedido rápido/duplicação | ✅ | ✅ | ✅ | — | — | — | `duplicar/route.ts:148` |
| Produtos | ✅ | ✅ | ✅ | ✅ | — | — | `catalog_products`, `products/` |
| Políticas comerciais | ✅ | ✅ | ✅ | — | — | — | `commercial_policies`, `price_tables` |
| Vendedores/metas/comissões | ✅ | ✅ | ✅ | ✅ | — | — | `carteira`, `comissoes`, `commercial_goals`, `commission_baixas` |
| Radar risco | ✅ | ✅ | ✅ | ✅ | — | — | `risk-radar.ts`, `radar-de-risco.ts`, `at-risk`, `risk-watcher` |
| Radar recompra | ✅ | ✅ | ✅ | ✅ | — | — | `radar-compras.ts` (8 estados), `radar-score`, `radar-digest`, `radar-compras` API+UI |
| Recompra (ciclo/previsão) | ✅ | ✅ | ✅ | ✅ | — | — | `last_purchase/cycle/predicted/delay` derivados de `commercial_orders` |
| Prospecção | ✅ | ✅ | ✅ | ✅ | — | — | `lib/prospeccao/` 15, `prospeccao/`, `prospecting/*` APIs, mapa |
| Mapas/rotas | ✅ | ✅ | ✅ | ✅ | — | — | `roteirizador_de_entregas` (0231), `shipments/rota`, geocode |
| Expedição/cargas/romaneio | ✅ | ✅ | ✅ | ✅ | — | — | `shipments/*`, `expedicao/`, `romaneio-pdf`, `entregas/outbox` |
| Financeiro (receber/pagar/fluxo) | ✅ | parcial | ✅ | ✅ | partes | — | `financeiro/`, `financial_*`, `titulos`, `faturamento`; fatiar receber/pagar/fluxo |
| Cobranças | ✅ | ✅ | ✅ | ✅ | — | — | `recuperacao/` + follow-up + `.demo-recuperacao.json` |
| Fiscal NFe/DANFE/SPED | ✅ | parcial | ✅ | ✅ | partes | — | `lib/fiscal/` 10, `fiscal-*` APIs, `notas`, `fiscal-drain`, sidecar |
| WhatsApp Inbox | ✅ | ✅ | ✅ | ✅ | — | — | WAHA adapter, `inbox/` 35 comps, 3 colunas, mídia/áudio/templates/snooze/handoff |
| IA agentes/runtime | ✅ | ✅ | ✅ | ✅ | — | — | `lib/ai` 93 + `agent-engine` 123 + workers |
| IA Memory/RAG/Skills/Router | ✅ | ✅ | ✅ | — | — | — | memory, `ai_chunks`, skills 0068/69, `0085_intent_router` |
| IA Follow-ups/flows | ✅ | ✅ | ✅ | ✅ | — | — | `lib/followup` 54, `followups` UI+API+crons |
| IA Handoff/governança | ✅ | ✅ | ✅ | ✅ | — | — | `handoff/orchestrator.ts`, guardrails, budgets |
| Automações (WHEN/IF/THEN) | ✅ | ✅ | ✅ | ✅ | — | — | `automation_rules`, `engine.ts`, `event_log` drain, `webhooks/` |
| Sales Brain | ❌ | ❌ | — | — | ✅ | — | 0 hits — CRIAR sobre `inteligencia/`+`graph.ts`+radar |
| Sales Orchestrator | ❌ | ❌ | — | — | ✅ | — | só handoff orchestrator — CRIAR genérico |
| Copilot contextual | ❌ | ❌ | — | — | ✅ | — | CRIAR `/api/v1/copilot` |
| AI Decision Log/Approvals | ❌ | ❌ | — | — | ✅ | — | CRIAR (base: `before_send_traces`, `llm_calls`) |
| AI Sales Control | ❌ | ❌ | — | — | ✅ | — | CRIAR painel |
| Meu Dia | ❌ | ❌ | — | — | ✅ | — | CRIAR (mobile-first) |
| Estoque/Compras | parcial | parcial | ✅ | ✅ | partes | — | `catalog_products`; CRIAR saldo/movimento/reserva/compras/fornecedores |
| Campanhas | ✅ | ✅ | ✅ | ✅ | — | — | `prospecting_campaigns`, `message-templates` |
| Multi-tenancy/RLS/RBAC | ✅ | ✅ | ✅ | ✅ | — | — | `organization_id`, 84/183, `requireRole`, invariantes |
| LGPD | ✅ | ✅ | ✅ | — | — | — | `lib/lgpd` 12, workers, SLA watcher |
| API v1 padronizada | ✅ | ✅ | ✅ | ✅ | — | — | `ok/fail`, cursor, 219 usos |
| Health `/api/v1/health` | ✅ | ✅ | ✅ | — | — | — | supabase+redis+waha |
| Docker/GHCR/stable | ✅ | ✅ | ✅ | ✅ | — | — | multi-stage, 3 imagens, imagetools |
| `scripts/deploy.sh` | ❌ | ❌ | — | — | ✅ | — | lógica dispersa em `hostgator-setup-kit/` |
| Mercos/ERP sync | ❌ (só scrape) | — | — | — | — | ✅ (arquivar) | `scripts/mercos-scrape/` → `docs/legacy/`; **nunca** adapter/sync |

**Vereditos**: NEXUS já é System of Record de facto (`commercial_orders` própria, radar deriva dela, Mercos sem sync). Sales Brain/Orchestrator/Copilot/Approvals/Meu Dia/Estoque-Compras/Deploy.sh são os únicos RECRIAR. Todo o resto é PRESERVAR+REFATORAR.
