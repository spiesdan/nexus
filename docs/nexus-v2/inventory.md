# NEXUS 2.0 — Inventory (FASE 0 Auditoria)

> Gerado em 2026-09-24, branch `nexus-v2`, tag `nexus-v1-archive`.
> Fonte: medição direta do repo (Get-ChildItem + Select-String). Sem mocks.

## 1. Contagens oficiais

| Área | Contagem | Prova |
|---|---|---|
| `app/**/page.tsx` | **121** | `(Get-ChildItem app -Filter page.tsx -Recurse).Count` |
| `app/api/**/route.ts` | **309** (307 v1 + 1 internal + 1 mcp) | `(Get-ChildItem app\api -Filter route.ts -Recurse).Count` |
| `components/**/*.tsx` | **336** | 25 dirs top |
| `hooks/` | 48 top (19 dirs + 29 files), 134 recurse | |
| `lib/` | 81 top (63 dirs + 18 files), **824 recurse**, 114 dirs | |
| `workers/` | 17 entries (16 files + `agent-worker/`) | |
| `supabase/migrations/*.sql` | **220** arquivos, 1,03 MB + `baseline.sql` 958 KB | |
| `CREATE TABLE` distinct | **116** (121 linhas − comentários) | |
| `ENABLE RLS` | **84** | |
| `CREATE POLICY` | **183** | |
| `tests/unit` | **479** | |
| `tests/e2e` | **76** | |
| `tests/invariants` | **146** | |
| `tests/journeys` | 4 + setup | |
| Total `*.test.ts(x)` | **838** | |
| `.github/workflows` | 6 (`ci, perf, e2e, publish-image, release, relogio`) | |
| Dockerfiles | `Dockerfile` (multi-stage) + `Dockerfile.worker` + `Dockerfile.scheduler` + `fiscal/sidecar/Dockerfile` | |
| `docker-compose*` | `yml` (dev) + `prod.yml` + `build.yml` + `oracle.yml` + `traefik.yml` | |

## 2. Páginas (121)

- Raiz: `app/page.tsx` (1)
- `(public)`: login, forgot, mfa, recovery, reset, signup (6)
- Sistema: 403, 500, 503, account-suspended (4)
- `admin/(protected)`: dashboard, audit, inbox, incidents, lgpd, marca, platform-admins, tenants, usage, users + google (21)
- `onboarding`: 9 etapas (welcome → done)
- `legal`: terms, privacy (2) · `design`: page + premium (2) · `team/accept-invite`, `vitrine-agenda` (2)
- `app/app` tenant (**74**):
  - `ai/` (20): agents, cases, credentials, evolution, followups, inbox, knowledge/sources, memory, proposals, providers, routers, runs, skills, usage
  - `settings/` (15): api-tokens, atendimento, atualizacao, billing, canal-oficial, marca, notifications, profile, security, templates, tenant (+agenda, pipelines, whatsapp)
  - operação (39): agenda, audit, carteira, comissoes, connections, contacts(+[id]), expedicao(+[id]), faturamento, financeiro, inbox(+[id]), indicadores, integrations/nuvemshop, inteligencia, kanban, leads/[id], lgpd, metrics, notas, pedidos(+novo,[id],imprimir), pipelines/[id], products, prospeccao, radar, recuperacao, relatorios, tarefas, team(+invite), templates, titulos, webhooks
- Layouts: 11 (`app/layout`, `app/app/layout`, `ai/layout`, `admin/*`, `(public)`, `onboarding`, `legal`, `design`)

## 3. APIs (307 em v1)

Domínios top: `ai:63`, `cron:23`, `admin:21`, `conversations:19`, `leads:13`, `shipments:13`, `prospecting:10`, `contacts:9`, `webhooks:9`, `invoices:8`, `pipelines:7`, `financeiro:7`, `team:6`, `agenda:6`, `commercial-orders:6`, `products:5`, `channels:5`, `automation-rules:5`, `system:5`, `lgpd:5`, `channel-sessions:4`, `fiscal-entradas:4`, resto 1–3 cada. Detalhe completo em `api.md`.

## 4. Components (276 `.tsx` — recontado 2026-09-25; a contagem original 336 incluía `.ts` e defasou)

`uimaxxing:66` (~60 sem importador), `inbox:36`, `admin:29`, `ui:27`, `kanban:20`, `nexus-ui:19`, `ai:16`, `shell:12`, resto disperso. **`motion/` não existe** (o "motion:50" era fantasma; sem `framer-motion` no package.json). Duplicação real: 7 tabelas admin (1.412 linhas do mesmo padrão) + 26 wrappers de página sobre `ui/table` + `ui/*` vs `nexus-ui/*` vs `uimaxxing/*` → consolidar (ver `redesign-inventory.md`; `DataTableA/B/Old`/`TableNew` nunca existiram — alvo fantasma da FASE 0).

## 5. lib/ por domínio

| Domínio NEXUS | Path real | Arquivos |
|---|---|---|
| Sales/Comercial | `lib/comercial/` | 26 |
| Fiscal | `lib/fiscal/` | 10 |
| Catálogo | `lib/catalogo/` | 2 |
| Entregas | `lib/entregas/` (só `outbox.ts`) | 1 |
| Prospecção | `lib/prospeccao/` | 15 |
| Leads/CRM | `lib/leads/` | 44 |
| Contacts | `lib/contacts/` | 7 |
| Inbox | `lib/inbox/` | 7 |
| Follow-up | `lib/followup/` | 54 |
| Agenda | `lib/agenda/` | 21 |
| AI core | `lib/ai/` | 93 |
| Agent engine | `lib/agent-engine/` | 123 |
| **Ausentes** | `lib/crm`, `lib/sales`, `lib/finance` | 0 — criar na FASE 1 (fachadas sobre paths reais) |

## 6. Banco (resumo — detalhe em `database.md`)

- 220 migrations + baseline (38 tabelas core).
- Tabelas âncora: `commercial_orders/items/counters`, `contacts`, `catalog_products`, `financial_receivables/payments/pagaveis`, `fiscal_*`, `shipments/*`, `crm_leads/pipelines/stages`, `conversations/messages`, `ai_agents/runs/routers/memory/chunks`, `followup_enrollments`, `event_log`, `organizations/user_organizations`.
- Tenant: `organization_id` (1078 linhas, 130 arquivos). `tenant_id`: 1 (comentário). `company_id`: 0.
- RLS: 84 enables, 183 policies, função `fn_user_role_in_org`.

## 7. IA / WhatsApp / Automação (resumo — detalhe em `ai.md`)

- IA real: `lib/ai` (93) + `lib/agent-engine` (123) + `workers/ai-*` + `agent-worker/main.ts`. Intent Router, Memory, RAG, Skills, Follow-up, Handoff existem e são reais. Agent Runs quase vazio (0 linhas prod em 2026-08-30). **Sales Brain: 0 hits — CRIAR. Orchestrator genérico: 0 — só handoff orchestrator.**
- WhatsApp: canal canônico WAHA (`lib/channels/adapters/waha.ts` + `lib/waha/*` + webhooks `waha/[token]`), 10 testes `waha-*`.
- Cron: 24 rotas (`event-log-drain`, `followup-flow-worker`, `agent-dispatcher`, `risk-watcher`, `fiscal-drain`, etc.).
- Mercos: **só scrape one-shot** (`scripts/mercos-scrape/*`, 35 scripts). Zero adapter/sync/rota/cron no `lib/` ou `app/api`. Nuvemshop é o único adapter real.

## 8. Infra (resumo — detalhe em `infrastructure.md`)

- `Dockerfile` multi-stage standalone; `Dockerfile.worker` single-stage (Fase 4 = multi-stage+prune); `Dockerfile.scheduler` alpine+curl.
- `docker-compose.prod.yml`: `image: ghcr.io/...:stable pull:always`, TCP probe no app (não `/health` — desenho deliberado), `worker :8787/healthz`.
- CI: `ci.yml` (verify+invariants, sem concurrency/paths), `e2e.yml` (com concurrency, sem paths), `publish-image.yml` (GHCR 3 imagens amd64, cache GHA, stable via imagetools), `release.yml` (digest check), `relogio.yml`, `perf.yml`.
- Health: `GET /api/v1/health` existe (supabase+redis+waha, 3s timeout). `scripts/deploy.sh`: **NÃO existe** — lógica dispersa em `hostgator-setup-kit/*.sh`.

## 9. Classificação inicial (KEEP/REFACTOR/REPLACE/REMOVE)

- KEEP: `lib/comercial/radar-compras.ts`, `risk-radar.ts`, `radar-de-risco.ts`, `lib/ai/handoff/orchestrator.ts`, `lib/agent-engine/agent/*`, `lib/api/wrappers.ts`, `lib/navigation/registry.ts`, `components/shell/*`, `app/api/v1/health`, `Dockerfile`, `publish-image.yml`.
- REFACTOR: `components/` (consolidar em Nexus Design System), `lib/branding` (trocar default DeskcommCRM→NEXUS), `Dockerfile.worker` (multi-stage), `ci.yml` (concurrency+paths), sidebar groups (→ taxonomia NEXUS §19).
- REPLACE: `scripts/deploy.sh` (criar canônico sobre hostgator-kit), `lib/nexus/graph.ts` (evoluir → Sales Brain real).
- REMOVE: `scripts/mercos-scrape/*` do runtime (arquivar em `docs/legacy/`), `DataTable*` duplicados, `tenant_id` residual, `middleware.ts` fantasma (já é `proxy.ts`).
