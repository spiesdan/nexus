# NEXUS 2.0 — Parity Matrix (obrigatória §5)

> Nunca assumir inexistência sem investigar. Status medido em 2026-09-24;
> **recontada no passo 8, 2026-09-27** (o que era ❌/parcial na primeira
> medição foi entregue e está provado abaixo — commits no fim do arquivo e
> no histórico de `progress.md`).

| Funcionalidade | Existe | Funciona | Preservar | Refatorar | Recriar | Remover | Prova |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Clientes | ✅ | ✅ | ✅ | ✅ | — | — | `contacts/` API+UI+`[id]/_whatsapp360` |
| Contatos | ✅ | ✅ | ✅ | ✅ | — | — | `contacts`, `contact_field_proposals`, `contact-phones` cron |
| Customer 360 | ✅ | ✅ | ✅ | ✅ | — | — | migration `0003_customer_360`, 9 abas (`contacts/[id]/_client.tsx:104-118`), timeline, `_whatsapp360` |
| Oportunidades/pipelines | ✅ | ✅ | ✅ | ✅ | — | — | `crm_pipelines/stages`, `kanban/` 20 comps, `pipelines/[id]` |
| Pedidos | ✅ | ✅ | ✅ | ✅ | — | — | `commercial_orders/items`, `criar-pedido.ts`, `pedidos/novo`; E2E `jornada-venda` |
| Pedido rápido/duplicação | ✅ | ✅ | ✅ | — | — | — | `duplicar/route.ts:148` |
| Produtos | ✅ | ✅ | ✅ | ✅ | — | — | `catalog_products`, `products/` |
| Políticas comerciais | ✅ | ✅ | ✅ | — | — | — | `commercial_policies`, `price_tables` |
| Vendedores/metas/comissões | ✅ | ✅ | ✅ | ✅ | — | — | `carteira`, `comissoes`, `commercial_goals`, `commission_baixas` |
| Radar risco | ✅ | ✅ | ✅ | ✅ | — | — | `risk-radar.ts`, `radar-de-risco.ts`, `at-risk`, `risk-watcher`; E2E `risk-radar` |
| Radar recompra | ✅ | ✅ | ✅ | ✅ | — | — | `radar-compras.ts` (8 estados), `radar-score`, `radar-digest`; E2E `recompra-radar` |
| Recompra (ciclo/previsão) | ✅ | ✅ | ✅ | ✅ | — | — | `last_purchase/cycle/predicted/delay` derivados de `commercial_orders` |
| Prospecção | ✅ | ✅ | ✅ | ✅ | — | — | `lib/prospeccao/` 15, `prospeccao/`, `prospecting/*` APIs, mapa |
| Mapas/rotas | ✅ | ✅ | ✅ | ✅ | — | — | `roteirizador_de_entregas` (0231), `shipments/rota`, geocode |
| Expedição/cargas/romaneio | ✅ | ✅ | ✅ | ✅ | — | — | `shipments/*`, `expedicao/`, `romaneio-pdf`, `entregas/outbox`; E2E `jornada-expedicao` (carga→rota→entrega) |
| Financeiro (receber/pagar/fluxo) | ✅ | ✅ | ✅ | ✅ | — | — | 6 abas (`financeiro/_client.tsx:254-259`: receber, pagar, cobranças, conciliação, fluxo, títulos) + pagamentos/estorno em recebíveis (`:1050,:1068`); E2E `jornada-financeiro` |
| Cobranças | ✅ | ✅ | ✅ | ✅ | — | — | `recuperacao/` + follow-up + `.demo-recuperacao.json` |
| Fiscal NFe/DANFE/SPED | ✅ | ✅ | ✅ | ✅ | — | — | `lib/fiscal/` 10, `fiscal-*` APIs, `notas`, `fiscal-drain`, sidecar; E2E `jornada-fiscal` (emitir→pendente→retorno SEFAZ) |
| WhatsApp Inbox | ✅ | ✅ | ✅ | ✅ | — | — | WAHA adapter, `inbox/` 35 comps, 3 colunas; E2E `inbox-scope`/`inbox-responder-citando`/`inbox-quem-manda` |
| IA agentes/runtime | ✅ | ✅ | ✅ | ✅ | — | — | `lib/ai` 93 + `agent-engine` 123 + workers; E2E `capacidades-do-agente` |
| IA Memory/RAG/Skills/Router | ✅ | ✅ | ✅ | — | — | — | memory, `ai_chunks`, skills 0068/69, `0085_intent_router` |
| IA Follow-ups/flows | ✅ | ✅ | ✅ | ✅ | — | — | `lib/followup` 54, `followups` UI+API+crons; E2E `followup-*` (7 specs) |
| IA Handoff/governança | ✅ | ✅ | ✅ | ✅ | — | — | `handoff/orchestrator.ts`, guardrails, budgets (`case-guardrail`, `orcamento-*`) |
| Automações (WHEN/IF/THEN) | ✅ | ✅ | ✅ | ✅ | — | — | `automation_rules`, `engine.ts`, `event_log` drain, `webhooks/` |
| Sales Brain | ✅ | ✅ | ✅ | — | — | — | entregue `327f6a637` (puro, 10 testes) + operacional `62631898c` (`BrainRecomendacoes`); E2E `jornada-ia` (propose determinístico) |
| Sales Orchestrator | ✅ | ✅ | ✅ | — | — | — | entregue `327f6a637` — `lib/ai/orchestrator/decide.ts` níveis 0–6 (`NivelAutonomia`), política `autonomia-nivel-N` |
| Copilot contextual | ✅ | ✅ | ✅ | — | — | — | entregue `00e0349af`/`babc7c961`/`dc353505d` — `/api/v1/copilot/context` (cliente/radar/pedido/fiscal) + RLS |
| AI Decision Log/Approvals | ✅ | ✅ | ✅ | — | — | — | entregue `962e97728`/`66e21c072` — `/app/ai/decisoes`, cadeia de custódia `ai.action.approved`; E2E `jornada-ia` proposta→aprovar→executar |
| AI Sales Control | ✅ | ✅ | ✅ | — | — | — | entregue `eaa7fbcbf`/`55d0e2fb8` — `/app/ai/controle` (7 cartões) + resumo |
| Meu Dia | ✅ | ✅ | ✅ | — | — | — | entregue `f6019dc4e` — `/app/meu-dia` + registry |
| Estoque/Compras | ✅ | ✅ | ✅ | ✅ | — | — | CRIADO no NEXUS 2.0: `inventory_movements` (0240), saldo/entrada/saída/reserva, fornecedores/pedidos de compra; E2E `estoque-entrada-saida-e-saldo` + `compras-do-rascunho-ao-estoque` |
| Campanhas | ✅ | ✅ | ✅ | ✅ | — | — | `prospecting_campaigns`, `message-templates` |
| Multi-tenancy/RLS/RBAC | ✅ | ✅ | ✅ | ✅ | — | — | `organization_id`, 89/169 handlers service-role, `requireRole`, job `invariants` |
| LGPD | ✅ | ✅ | ✅ | — | — | — | `lib/lgpd` 12, workers, SLA watcher |
| API v1 padronizada | ✅ | ✅ | ✅ | ✅ | — | — | `ok/fail`, cursor, 219 usos |
| Health `/api/v1/health` | ✅ | ✅ | ✅ | — | — | — | supabase+redis+waha + probe TCP no compose |
| Docker/GHCR/stable | ✅ | ✅ | ✅ | ✅ | — | — | multi-stage, 3 imagens, imagetools; check `imagens-ok` |
| `scripts/deploy.sh` | ✅ | ✅ | — | — | — | — | entregue `327f6a637` — `set -euo pipefail`, 9 passos, pull-first; rollback automático no kit (`agent.sh:234` `PREV_IMAGE`) |
| Mercos/ERP sync | ❌ (sem integração) | — | — | — | — | ✅ feito | 0 adapter/sync/rota/tabela/cron (medido); kit offline arquivado em `docs/legacy/mercos-scrape/` (`256ee46ef`) — **nunca** adapter/sync |

**Vereditos (recontados no passo 8)**: NEXUS é System of Record
(`commercial_orders` própria, radar/Brain derivam dela, Mercos sem sync nenhum).
**Nenhuma linha sobra como RECRIAR** — o que era ❌/parcial foi entregue e
provado por E2E verde. Todo o resto segue PRESERVAR+REFATORAR (o refatorar
do monólito financeiro/fiscal continua nas REFACTOR da limpeza, sem quebrar
o que está verde).

## Entregue na branch `nexus-v2` (histórico completo em `progress.md`)

| Bloco | Commits-chave | Prova |
|---|---|---|
| FASE 0 docs (11) + branch + tag | — | `docs/nexus-v2/`, `nexus-v1-archive` |
| FASE 1 fundação (Brain, Orchestrator, facades, deploy.sh, Meu Dia, Decisões, Controle) | `327f6a637`, `62631898c`, `00e0349af`, `babc7c961`, `dc353505d`, `0480cbf54`, `085ee13f3`, `c43627a81`, `225996ef8`, `aa61bba1c`, `c97ac801b`, `962e97728`, `66e21c072`, `f6019dc4e`, `eaa7fbcbf`, `55d0e2fb8`, `3c0905cb2` | testes `lib/ai/sales-brain/*`, `orchestrator/decide`, E2E `jornada-ia` |
| Passos 1–4 (fundação, rotas, fases 0–2 shell) | `727faf650` e demais handoffs | `progress.md` |
| Passo 5 (refatoração por módulo + superfície canônica: NexusPageHeader, FilterBar, tabs, NexusKpi/NexusChart, FormField) | `fd6a18d9e`, `c370b8c8a`, `05857124a`, `3fbd91b21`, … | regressões por fase (ver handoffs) |
| Passo 6 (redesign §100: responsividade §60 + auditoria de aceite) | `b12004435`, `6b3732ee0`, `8935da608` | `evidence/fase6-mobile/`, `evidence/fase6b-aceite/`, VIOLACOES(0)/106 rotas |
| Passo 7 (E2E §86: 5 jornadas + Compras/Estoque) | `e83ac2fdd`, `7839671f1` | 7/7 specs verdes, gates 49/49 |
| Passo 8 (fechamento: kit Mercos arquivado, docs recontados) | `256ee46ef` | este arquivo + `migration-plan.md` §94 |

## O que ainda NÃO está fechado (medido, sem gambiarra)

- **Deploy medido (§84)** — `deploy-performance.md` continua com a coluna
  "Medido" vazia: as metas só se provam no primeiro deploy real na VPS.
- **Execução autônoma ampla (§35 níveis 4–6 / §38)** — Decision Log
  propõe→aprova→executa com cadeia de custódia, mas o **único executor
  implementado é `agendar_followup`** (`gerar_abordagem` responde 422 honesto
  "Ferramenta sem executor"); envio/matrícula autônoma de pedido exige
  política explícita do dono — **não inventada**.
- **Lighthouse/CLS/INP** — alvos escritos (`EPIC-12`, S-12.05 deferido);
  o CI mede build+tamanho (`build-and-size`), não campo. Declarado, não
  é gate.
- **PR `nexus-v2 → main`** — só com ordem explícita do usuário
  (decisão pendente registrada em `progress.md`).
