# NEXUS 2.0 — Migration Plan (FASE 0 → 10)

> Regra: ENTENDER→PRESERVAR→MELHORAR · ISOLAR→CORRIGIR→TESTAR · CONSOLIDAR fonte de verdade · MAPEAR→MIGRAR→TESTAR→REMOVER. Sem big-bang.

## FASE 0 — Auditoria ✅ CONCLUÍDA (2026-09-24)

- [x] Inventário (`inventory.md`), arquitetura, rotas, API, banco, IA, segurança, infra, design, parity-matrix, este plano
- [x] Branch `nexus-v2` + tag `nexus-v1-archive` + push p/ `nexus` + `deploy-performance.md` baseline (a medir)

## FASE 1 — Fundação ✅ PARTE 1 (2026-09-24/25, commits na `nexus-v2`)

- [x] `lib/crm|sales|finance/` fachadas + `lib/ai/sales-brain/` real + Orchestrator puro + `lib/ai/copilot/`
- [x] `scripts/deploy.sh` + `ci.yml` concurrency (paths e worker multi-stage ficam p/ parte 2)
- [x] `DEFAULT_APP_NAME` → `NEXUS` (protocolo/infra intactos de propósito)
- [x] `/api/v1/sales-brain`, `/api/v1/copilot/context` (cliente/radar/pedido/fiscal), páginas Meu Dia, Decisões, Controle
- [ ] Registry → taxonomia §19 completa · Design tokens consolidados (parte 2, com QA visual)

## FASE 2 — CRM

Clientes (busca/filtros/massa) → Customer 360 (9 abas + próxima ação IA) → timeline/atividades → oportunidades/pipelines/kanban. Testes: auth, tenancy, customers, 360.

## FASE 3 — Vendas

Pedidos (rápido, políticas, aprovação, comissão) → novo pedido (teclado, inline, recorrentes, IA X→Y) → produtos (SKU, margem, similares/complementares) → vendedores/metas/comissões. E2E Jornada 1.

## FASE 4 — Radar + Sales Brain

Radar real (8 estados + filtros vendedor/região/valor/frequência/produto/risco) → recompra (`last/cycle/predicted/delay`) → oportunidades (inativo, cross/upsell, queda) → Sales Brain operacional + Roadmap mensal. E2E Jornada 2.

## FASE 5 — WhatsApp + IA

Inbox 3 colunas + contexto rico → AI Draft/Copilot → agents por função (níveis 0–6) → intent/memory/RAG/skills → follow-up engine → handoff. E2E Jornada 3.

## FASE 6 — Estoque + Compras

Saldo/entradas/saídas/ajustes/reservas/inventário/alertas → pedidos respeitam estoque → fornecedores/pedidos compra/sugestão/demanda → Product Intelligence (A→B juntos, baixo giro).

## FASE 7 — Logística

Pedido→separação→carga→romaneio→rota→entrega→finalização; cargas, motorista/veículo, geocode real (nunca inventar coords), otimização, posição. E2E Jornada 4.

## FASE 8 — Financeiro

Receber/pagar/cobrança/pagamentos/conciliação/fluxo; pedido gera título controlado; Customer Finance no 360. E2E Jornada 5.

## FASE 9 — Fiscal

Pedido→faturamento→doc→NFe→DANFE→status; jobs, CCE, inutilização, SPED, importação, manifestação. E2E Jornada 6. Pedidos podem aguardar faturamento (regra operacional).

## FASE 10 — Autonomia

Orchestrator → autonomy levels → Decision Log → policies → vendedor autônomo → campanhas/follow-ups autônomos → aprendizado (flywheel judge já existe: `flywheel-judge-live.ts`, `judge_alignment_pool`).

## Limpeza legado (contínuo, KEEP/REFACTOR/REPLACE/REMOVE)

- REMOVE: `mercos-scrape` runtime, `DataTable*` dupes, `tenant_id`, `Visitors` como marca, `build:` prod, `latest`-only.
- REPLACE: `deploy.sh`, Sales Brain, Orchestrator, Copilot, `graph.ts`→Brain.
- REFACTOR: branding default, sidebar, worker Dockerfile, CI, tabelas, fiscal parcial, financeiro monolito.
- KEEP: todo §6 do doc (CRM, vendas, radar, recompra, prospecção, mapas, expedição, financeiro, fiscal, WhatsApp, IA, automações).

## Critério de sucesso (§94)

Checklist integral no fechamento (auditado→parity→classificado→SoR sem Mercos/ERP→CRM/360/pedidos/estoque/financeiro/fiscal/expedição/rotas/WhatsApp/Radar/Brain/follow-up/IA/agentes/governança/autônomo→UI 100%→responsivo→perf→tenancy/RLS/auditoria→testes/E2E→docker/cache/sem-build/GHCR/health/rollback/medido→docs).
