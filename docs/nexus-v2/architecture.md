# NEXUS 2.0 — Architecture (atual → alvo)

## 1. Arquitetura atual (auditada)

```
Next.js 16 (App Router) + React 19
  app/            → 121 pages + 309 routes (309 = 307 v1 + internal + mcp)
  components/     → 336 .tsx (uimaxxing 66, motion 50, inbox 35, admin 29…)
  hooks/          → 134 files
  lib/            → 824 files (ai 93, agent-engine 123, followup 54, leads 44…)
  workers/        → agent-worker/main.ts + ai-response/sentiment + rag-indexer + lgpd + media
  supabase/       → 220 migrations + baseline (116 tabelas, RLS 84/183)
  proxy.ts        → borda (não middleware.ts)
```

Padrão de API já canônico: `lib/api/wrappers.ts` (`ok()`/`fail()` + `X-Request-Id` + cursor pagination) + `lib/api/errors.ts` (ApiErrorCodes). Uso em 219 pontos.
Navegação já canônica: `lib/navigation/registry.ts` (774 linhas, 56 destinations, 27 sidebar) + testes `navegacao-registry` + `navegacao-completude` (rota fora do registro reprova).
Shell já existe: `components/shell/*` (12 arquivos: Sidebar, MobileSidebar, TopBar, CommandPalette, MobileDock, UserMenu, TenantSwitcher, AlertsBell, SearchTrigger, NavHub, VersionFooter, SidebarNotice - faltam Breadcrumb, ContextualDrawer, NotificationCenter, ver `redesign-inventory.md`).

## 2. Problemas estruturais (não reescrever, migrar gradual)

1. **Lógica comercial espalhada**: `lib/comercial/`, `lib/leads/`, `lib/fiscal/`, `lib/entregas/` (1 arquivo!) — sem separação domain/application/infrastructure/ui.
2. **Componentes duplicados**: `ui/` vs `nexus-ui/` vs `uimaxxing/`; 7 tabelas admin iguais + 26 wrappers de página sobre `ui/table` (recontado 2026-09-25 — `DataTableA/B/Old`/`TableNew` não existem, era alvo fantasma; ver `redesign-inventory.md`).
3. **Branding**: `DEFAULT_APP_NAME="DeskcommCRM"` (`lib/branding.ts:19`); `Visitors` é design-system, não produto; `Nexus*` é namespace de código (94 matches em components) mas não white-label.
4. **Domínios sem pasta**: `lib/crm`, `lib/sales`, `lib/finance` não existem (equivalentes: `lib/leads`, `lib/comercial`, `lib/fiscal`).
5. **Workers**: `Dockerfile.worker` single-stage; sem `domain/` separado.

## 3. Arquitetura alvo NEXUS 2.0

```
Domínios (fonte de verdade lógica, não move tudo num commit):
  CRM, SALES, CUSTOMERS, PRODUCTS, INVENTORY, PURCHASING,
  LOGISTICS, FINANCE, FISCAL, WHATSAPP, PROSPECTING,
  AI, AUTOMATION, PLATFORM

Camadas (por domínio, gradual):
  domain/         → entities, policies, validators (puro, sem I/O)
  application/    → use-cases, services (orquestra domain + repositories)
  infrastructure/ → repositories (supabase), providers, adapters
  ui/             → components, hooks, pages (só chama application)
  workers/        → jobs, cron, filas

Fluxo canônico:
  UI → Application Service → Domain → Repository → Database
  PROIBIDO: React Component → SQL improvisado
```

## 4. Estratégia de migração gradual (regra do doc §8)

- NÃO mover tudo num commit. Criar fachadas primeiro:
  - `lib/crm/` → re-export de `lib/leads/*` + `lib/contacts/*`
  - `lib/sales/` → re-export de `lib/comercial/*`
  - `lib/finance/` → re-export de `lib/fiscal/*` + `financial_*`
  - `lib/ai/sales-brain/` → novo (hoje 0 hits) sobre `lib/nexus/graph.ts` + `radar-compras.ts` + `risk-radar.ts`
  - `lib/ai/orchestrator/` → novo (hoje só handoff orchestrator) — máquina evento→contexto→prioridade→intenção→ferramenta→ação→resultado→aprendizado
- Cada domínio ganha `entities/services/use-cases/repositories/validators/policies` conforme tocado (boy-scout, não big-bang).
- `event_log` = relógio da automação (drain); follow-up = outro relógio (`next_eval_at` + cron). Não misturar (doutrina `.specs/features/crm-automacao-fluxos/spec.md`).

## 5. System of Record (decisão §1 — inegociável)

NEXUS é SoR de clientes, contatos, produtos, preços, estoque, compras, pedidos, vendedores, metas, comissões, financeiro, fiscal, logística, CRM, WhatsApp, oportunidades, campanhas, IA, automações, histórico.
- PROIBIDO: ERP Adapter/Connector, sync Mercos, importação operacional permanente.
- Mercos = carga histórica one-shot arquivada (`scripts/mercos-scrape/` → `docs/legacy/`). `commercial_orders.origem='mercos'` é vestígio, não sync.
- Integrações permitidas (complementares, nunca SoR): WhatsApp/WAHA, Meta, provedores IA, e-mail, mapas/geocode, Nuvemshop.
