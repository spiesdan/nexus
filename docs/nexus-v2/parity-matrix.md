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

## Entregue na branch `nexus-v2` (2026-09-24/25, tudo commitado e no ar)

| Entrega | Commit | Prova |
|---|---|---|
| FASE 0 docs (11) + branch + tag | — | `docs/nexus-v2/`, `nexus-v1-archive` |
| Sales Brain puro + batch | `327f6a637` | `lib/ai/sales-brain/*` 10 testes |
| Orchestrator puro (níveis 0–6) | `327f6a637` | `lib/ai/orchestrator/decide.ts` |
| Facades `lib/crm\|sales\|finance` | `327f6a637` | re-export sem quebra |
| `GET /api/v1/sales-brain` | `327f6a637` | recomendações sobre pedidos reais |
| `scripts/deploy.sh` + CI concurrency | `327f6a637` | `set -euo pipefail`, 9 passos |
| Brain operacional na Inteligência | `62631898c` | `BrainRecomendacoes.tsx` |
| Copilot contexto (cliente/radar) | `00e0349af` | `/api/v1/copilot/context` + RLS |
| Copilot pedido + fiscal | `babc7c961`, `dc353505d` | travas + saúde fiscal |
| Brain no 360 | `0480cbf54` | `_inteligencia360.tsx` primeiro insight |
| Bulk-tag + seleção em massa | `0480cbf54` | `contacts/bulk-tag`, checkboxes |
| Afinidade X→Y + recorrentes | `babc7c961` | `lib/comercial/afins` + API |
| Quem leva junto no pedido | `7cd824127` | `_afins.tsx` no editor |
| Sales Roadmap anual | `085ee13f3` | `/api/v1/roadmap` + metas |
| Inbox 360 (Brain + follow-ups) | `c43627a81` | `PainelBrainFollowups` + `?contact_id=` |
| Sugestão de compra | `225996ef8` | `/api/v1/inventory/sugestoes` |
| Separação + trava (migration 0240) | `aa61bba1c` | schema + 2 portas, 1 regra |
| Fluxo de caixa | `c97ac801b` | `/api/v1/financeiro/fluxo` |
| Runner + propose + Decisões | `962e97728`, `66e21c072` | Decision Log na auditoria |
| Meu Dia | `f6019dc4e` | `/app/meu-dia` + registry |
| Controle de IA (7 cartões) | `eaa7fbcbf`, `55d0e2fb8` | `/app/ai/controle` + resumo |
| Marca padrão NEXUS | `3c0905cb2` | default + gates + instalador |

## Fica para a parte 2 (motivo escrito, sem gambiarra)

- Movimentações/reservas/estoque mínimo e fornecedores/compras: pedem tabela nova + `test:db` (Docker fora do ar aqui).
- Execução autônoma (envio/matrícula de pedido): exige política explícita (qual fluxo? qual aprovação?) — não inventada.
- Redesign global 100%: exige QA visual rota a rota.
- `docs/legacy/` do scrape Mercos: arquivamento (mover scripts, sem apagar história).
- Deploy medido: `deploy-performance.md` preenche no primeiro deploy `nexus-v2`.
