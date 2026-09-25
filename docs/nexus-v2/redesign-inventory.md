# NEXUS 2.0 — Inventário visual classificado (§100, passo 6)

> Gerado em 2026-09-25 na branch `nexus-v2`, medição direta (3 auditorias read-only).
> A §100 exige: inventário de rotas/páginas/modais/componentes classificado em
> **NOVO DESIGN / REFATORAR / CONSOLIDAR / REMOVER** ANTES de qualquer fase visual.
> Régua: `# 14. NOVO DESIGN` (premium, limpo, denso, hierarquia; sem glassmorphism,
> sombras pesadas, cards gigantes, AI gimmick), `# 15. DESIGN SYSTEM` (bordas 1px,
> superfícies, tipografia forte, controles compactos, escala única de espaçamento,
> poucos níveis de elevação), `# 16. MICROANIMAÇÕES`, `# 17. SHELL`,
> `# 60. RESPONSIVIDADE` (1920→390) e a referência de estilo `DESIGN.md` (raiz).

## 0. Decisões de régua (INFIDO — registradas para não reabrir)

- **Tema: dark-first MANTIDO.** O spec não manda tema claro (§14/§15 falam de
  estrutura: bordas, densidade, hierarquia — não de inversão de tema), o repo tem
  a escolha registrada como deliberada (`lib/theme.tsx`: "Dark-first (PROMPT V4)",
  `app/layout.tsx:286` fixa `data-theme="dark"` no SSR, `THEME_INIT_SCRIPT` só
  inverte para `light` se o usuário gravou a escolha) e `light` continua
  disponível pela mesma chave. Inverter default seria inventar regra que o spec
  não escreveu. A auditoria visual julga a LINGUAGEM (bordas/densidade/tipografia),
  válida nos dois temas.
- **`DESIGN.md` é referência de estilo**, não mandato de produto: os valores
  (Carbon `#181925`, Fog `#e8e8e8`, Lavender `#918df6`, pill 9999px) são o
  alvo onde o spec não fecha o número.
- **`DataTableA/B/Old` e `TableNew` NÃO EXISTEM** — alvo citado em
  `architecture.md:23`/`inventory.md:49` é fantasma (`git ls-files` + histórico = 0).
  A duplicação real de tabela é outra (ver §3). Corrigir os docs na Fase 0.
- Contagens corrigidas vs `inventory.md`: `components/` = **276 `.tsx`** (não 336);
  `shell/` = **12** (não 14); `nexus-ui/` = **19** (não 16); **`motion/` = 0**
  (o "50 do inventory" é fantasma — não existe `components/motion` nem `framer-motion`).

## 1. Visão geral (142 itens classificados)

| área | NOVO DESIGN | REFATORAR | CONSOLIDAR | REMOVER | total |
|---|---:|---:|---:|---:|---:|
| rotas do tenant `app/app/**` | 14 | 55 | 8 | 3* | 80 |
| fora do tenant (admin/public/onboarding/legal/systemo) | 24 | 23 | 12 | 3 | 62 |
| **total de rotas/layouts** | **38** | **78** | **20** | **6** | **142** |

\* 3 `REMOVER*` do tenant são stubs de redirect (condicional — ver §2.1).
Sinais medidos no tenant: 18/80 rotas importam algo de `nexus-ui`; 9 usam
`NexusPageHeader`; 6 usam `NexusDataTable`; **44** escrevem `<header>/<h1>` à mão;
5 usam `<table>` crua; 8 arquivos com hex literal; **31 sem estado de erro**;
19 sem empty; ~26 sem loading; 24 sem nenhum breakpoint; só 6 `loading.tsx` + 2
`error.tsx` em 80 rotas.

## 2. Rotas classificadas

### 2.1 Tenant — `app/app/**` (80)

| rota | classe | evidência curta |
|---|---|---|
| `/app` (Dashboard) | NOVO | centro de comando pós-tag; KPI/gráfico uimaxxing + `BrainRecomendacoes` |
| `/app/meu-dia` | NOVO | `MeuDiaClient` nexus-ui, estados completos |
| `/app/ai/decisoes` | NOVO | `DecisoesList` nexus-ui (tabela/empty/error) |
| `/app/ai/proposals` | NOVO | `ProposalsList` nexus-ui |
| `/app/carteira` | NOVO | `NexusPageHeader`+`NexusDataTable`+`NexusEmptyState` |
| `/app/comissoes` | NOVO | `NexusPageHeader`+`NexusDataTable`+estados |
| `/app/compras` | NOVO | pós-tag; header+DataTable+empty/erro |
| `/app/compras/[id]` | NOVO | pós-tag; header+estados (tabela ainda shadcn) |
| `/app/estoque` | NOVO | pós-tag; header+3×DataTable+`nexusToast` |
| `/app/expedicao` | NOVO | header+`NexusEmptyState`+estados |
| `/app/faturamento` | NOVO | header+DataTable+estados |
| `/app/inteligencia` | NOVO | `NexusIntelligence`+loading/error; pendência `CrmPageHeader` |
| `/app/notas` | NOVO | header nexus; pendência: 4 `Table` shadcn fora do DataTable |
| `/app/titulos` | NOVO | header+DataTable+estados |
| `/app/financeiro` | CONSOLIDAR | 8 `<table>` cruas; aba "Receber" duplica `/titulos` |
| `/app/kanban` | CONSOLIDAR | é lista de funis; duplica `/settings/tenant/pipelines` |
| `/app/metrics` | CONSOLIDAR | duplica `/indicadores`+`/relatorios` |
| `/app/recuperacao` | CONSOLIDAR | duplica Radar (recompra/risk); sem loading/responsivo |
| `/app/inbox/[id]` | CONSOLIDAR | rota-resolver (push) — **manter**, não é UI |
| `/app/leads/[id]` | CONSOLIDAR | rota-resolver (permalinks radar/webhooks) — **manter** |
| `/app/settings/canal-oficial` | REMOVER* | stub redirect → `connections?aba=oficial` |
| `/app/settings/templates` | REMOVER* | stub redirect → `connections?sub=templates` |
| `/app/settings/tenant/whatsapp` | REMOVER* | stub redirect → `/app/connections` |
| `/app/agenda`, `/app/ai` (hub), `/app/ai/agents`(3), `/app/ai/cases`, `/app/ai/controle`, `/app/ai/credentials`, `/app/ai/evolution`†, `/app/ai/followups`(3), `/app/ai/inbox`, `/app/ai/knowledge/sources`, `/app/ai/memory`, `/app/ai/providers`, `/app/ai/routers`(2), `/app/ai/runs`, `/app/ai/skills`, `/app/ai/usage`, `/app/audit`, `/app/connections`, `/app/contacts`, `/app/contacts/[id]`, `/app/expedicao/[id]`, `/app/inbox`, `/app/indicadores`, `/app/integrations/nuvemshop`, `/app/lgpd/requests`(2), `/app/pedidos`, `/app/pedidos/imprimir`, `/app/pedidos/novo`, `/app/pedidos/[id]`, `/app/pipelines/[id]`, `/app/products`, `/app/prospeccao`, `/app/radar`, `/app/relatorios`, `/app/settings`(hub), `/app/settings/api-tokens`, `/app/settings/atendimento`, `/app/settings/atualizacao`, `/app/settings/billing`, `/app/settings/marca`, `/app/settings/notifications`, `/app/settings/profile`, `/app/settings/security`, `/app/settings/tenant`, `/app/settings/tenant/agenda`, `/app/settings/tenant/pipelines`†, `/app/team`(2), `/app/templates`, `/app/tarefas`, `/app/webhooks` | REFATORAR | († = ver §4) |

\* os 3 stubs só saem se aceitarmos 404 em links salvos (o código documenta essa
troca). Não remover sem decidir.

### 2.2 Fora do tenant (62)

| área | NOVO | REFATORAR | CONSOLIDAR | REMOVER |
|---|---|---|---|---|
| layouts (11) | `(public)`, `legal` | `app/layout` (dark-first mantido §0), `app/app/layout` (falta Breadcrumb/Drawer), `admin/(protected)`, `admin/inbox`, `admin/tenants/[id]`, `onboarding` | `app/design` (4ª fonte de tokens) | `app/ai/layout` (wrapper morto), `admin/layout` (`<>{children}</>`) |
| admin (21) | dashboard? não — ver col. | `admin/dashboard`, `audit/[entryId]`, `google`, `inbox`(2), `incidents/[id]`, `tenants/[id]`, `health`, `users/[id]` | `audit` (duplica `/app/audit`), `lgpd`(2, duplica tenant), `marca` (duplica `settings/marca`), `forbidden` (clone de `/403`) | — |
| public (6) | `forgot`, `reset`, `signup` | `login` (4 blocos alerta copy-paste), `mfa`, `recovery` (não usam RHF+Zod como os irmãos) | — | — |
| onboarding (9) | 7 | `setup-ai`, `funil` (wizards próprios; `NexusSteps` não usado) | — | — |
| sistema/erros (9) | `error.tsx`×2, `not-found`… | `global-error` | `403`/`404`/`500`/`503`/`account-suspended` = **6 clones** → 1 `StatusPage` | — |
| extras (4) | — | `team/accept-invite` (0 `components/ui`, botão à mão), `vitrine-agenda` | `app/design` galeria | `app/(admin)/` (órfão só README) |

Detalhe linha-a-linha completo: ver histórico das 3 auditorias (tabelas com
arquivo+evidência) — reproduzir aqui duplicaria; este documento é a norma.

## 3. Componentes — duplicação real e fonte de verdade por categoria

**Tabelas (a duplicação que EXISTE):**
- Primitiva: `components/ui/table.tsx` (35 importadores) — **MANTER**.
- Container de estados: `nexus-ui/data/NexusDataTable` (6 páginas) — **MANTER/evoluir**.
- Comportamento (sort `aria-sort` + seleção em massa §22): `contacts/ContactsTable`
  (único) — **extrair hooks** `useTableSort`/`useRowSelection`.
- **7 tabelas admin = 1.412 linhas** do mesmo padrão (skeleton+empty+badge+load-more)
  → **`AdminDataTable` único** ✅ Fase 3b (`ab0545095`) + variantes de status em
  `ui/badge` (badges agrupados em `admin/incidents/badges` e
  `admin/tenants/status-badge`).
- **26 wrappers de página** reinventam o entorno da tabela sobre `ui/table`
  (pior: `pedidos/_client` 966, `prospeccao/_empresas` 852) → migrar a
  `NexusDataTable` (ordem crescente de tamanho).
- **6 `<table>` crua**: `financeiro`(8 ocorrências), `indicadores/_indicadores`,
  `ai/agents/[id]/VersionDiff`, `settings/notifications` → `ui/table`/`NexusDataTable`;
  exceções documentadas: `pedidos/imprimir` (visual de impressão) e
  `design/SectionTokens` (galeria).

**Diálogos/estados:**
- `NexusFormDialog` (62 linhas) com **0 uso** vs **55 `DialogContent`** em domínio →
  adotar (começar por contacts, ai, inbox, kanban, admin, webhooks).
- `NexusConfirmDialog` **ADOPTADO na Fase 3c** (`eafb9c071`): os 7 `window.confirm`
  + 13 dos 17 `AlertDialogContent` de domínio viraram `NexusConfirmDialog` (trigger)
  ou `useConfirmar()` (`ConfirmacaoProvider` em `app/app/layout.tsx`); restam 4
  `AlertDialogContent` no FORM — `SuspendDialog`/`ReactivateDialog` (fundir em
  `TenantReasonDialog`, Fase 3d), `ResolveIncidentDialog`, `ApproveButton`.
- **4 overlays manuais** (`fixed inset-0 z-50`): `prospeccao/_empresas`,
  `prospeccao/_importar-arquivo`, `auth/MfaEnrollModal`, `GradeNotas` → `ui/sheet/dialog`.
- Empty: **2 APIs ativas** (`components/empty` 20 importadores × `NexusEmptyState` 12)
  → declarar SoR única (alias).
- Toast: 3 APIs (`sonner` cru 155 linhas, `nexusToast` 9, `ApiErrorToast`) →
  `nexusToast` única porta.
- Skeletons locais (8+) → `NexusTableSkeleton`.
- `NexusLoading`/`NexusAiSources`/`NexusAiContextMeter`/`NexusGraphCanvas`:
  0 uso prod → usar ou apagar (decidir por categoria).

**Botões/inputs/tabs/filtros/KPI/charts:**
- `ui/gradient-button`, `orb-button`, `pill-button`, `typing-field`, `select-menu`
  + ~12 botões `uimaxxing` = só servem `uimaxxing` morto → remover junto.
- **Lacuna: `FormField`** (140 arquivos com `<Label>` solto, sem campo canônico) → CRIAR.
- Tabs: 6 `role="tab"` manuais + `_tab-nav` locais → `ui/tabs`.
- Filtros: **5 FilterBar distintos** (1.290 linhas) → consolidar em
  `components/filters/FilterBar`.
- Headers: **3** (`layout/PageHeader` 3, `NexusPageHeader` 9, `CrmPageHeader` 5 —
  este último é o que o **shell/NavHub** importa) → `NexusPageHeader` único; mover
  NavHub encerra a dependência shell→uimaxxing.
- KPI: 4 variantes (`KPICards`, `crm-kpi`, 3 `StatCard` locais) → `NexusKpi` sobre
  `crm-kpi` (único já em tela).
- Charts: 5 `uimaxxing` mortos + 2 irmãos (`ai/UsageChart` × `admin/usage/UsageCharts`)
  → fundir; criar `NexusChart` (wrapper recharts).
- **`uimaxxing/` = ~60 arquivos sem importador** (inclui `markets-table` 322,
  `collateral-table` 109, os 5 charts) → remover; sobrar `crm/*` (6, em uso) +
  loaders → mover para `nexus-ui/crm/`.

**Barril `nexus-ui/index.ts`:** 0 imports pelo barril (todos caminho fundo) — ou o
repo passa a importar `@/components/nexus-ui` ou o barril mente sobre a própria regra.

## 4. Shell §17 — status medido

| peça §17 | status | ação |
|---|---|---|
| Sidebar | ✅ (`shell/Sidebar` + `MobileSidebar`, §19 fechado) | — |
| Topbar | ✅ no tenant (`shell/TopBar`) e no admin (Fase 2e: `AdminShell` com busca/⌘K/sino/UserMenu) | — |
| Command Palette | ✅ (`CommandPalette` via `SearchTrigger`; Fase 2d: seções de entidade + ponte para `/app/busca`) | — |
| Global Search | ✅ Fase 2d: 6 entidades em `lib/busca/global.ts` (conversas, clientes, pedidos, leads, produtos, títulos) + rota `/app/busca?q=` | — |
| Notifications | ✅ `NotificationCenter` (Fase 2c) | — |
| Contextual Drawer | ✅ `shell/ContextualDrawer` no `AppShell` (Fase 2b) | — |
| Breadcrumb | ✅ `shell/Breadcrumb` sobre `lib/navigation/registry.ts` (Fase 2a) | — |
| User Menu | ✅ (`UserMenu`, `TenantSwitcher`) | — |

Docs a corrigir: `design.md:8`/`architecture.md:18` citam `AnimatedAppSidebar`
(inexistente); `routes.md` cita `/design/premium` (inexistente).

## 5. Ordem de execução do passo 6 (fuses com prioridade das auditorias)

1. **Fase 0 — corrigir docs**: este arquivo + `architecture.md`/`inventory.md`
   (alvo fantasma `DataTable*`, contagens `motion/shell/nexus-ui`).
2. **Fase 1 — morte primeiro** (0 risco, valida com typecheck/lint):
   apagar `uimaxxing` sem importador (~60), primitivos `ui/` órfãos
   (`gradient-button`, `orb-button`, `pill-button`, `typing-field`,
   `select-menu`, `scroll-area`, `sonner`?), layouts mortos (`app/ai/layout`,
   `admin/layout`, `app/(admin)/`), `motion` fantasma se existir.
3. **Fase 2 — shell §17**: `Breadcrumb` (registry) + `ContextualDrawer` no
   `AppShell` + `NotificationCenter` (AlertsBell→painel) + Global Search estendida.
4. **Fase 3 — consolidações de alto alavanco**: `StatusPage` 6→1 ✅ (`37b35a029`);
   `AdminDataTable` 7→1 + badges de status ✅ (`ab0545095`); `NexusConfirmDialog`
   ✅ 7 `window.confirm` + 13 AlertDialog (`eafb9c071`); resta: `SuspendDialog`+
   `ReactivateDialog`→1; overlays manuais→`ui/sheet`; toasts→`nexusToast`.
5. **Fase 4 — refatoração por módulo (prioridade A)**: `/contacts` → `/pedidos`
   (hex Mercos→tokens) → `360` → `/inbox` → `/financeiro` (8 tabelas + fusão com
   `/titulos`) → `/radar` (+fusão `/recuperacao`) → `/indicadores` (+fusão
   `/metrics`) → `/prospeccao` → funis (`/kanban`+`settings/tenant/pipelines`) →
   `/agenda` → `pedidos/[id]`/`pedidos/novo` → `/webhooks` → admin.
6. **Fase 5 — superfície compartilhada**: `NexusPageHeader` único (matar
   `layout/PageHeader`+`CrmPageHeader`), FilterBar único, tabs manuais→`ui/tabs`,
   `NexusKpi`/`NexusChart`, `FormField`.
7. **Fase 6 — responsividade §60** (24 rotas sem breakpoint; `renderCard` em 6)
   e **auditoria visual de aceite §100** (checklist dos 11 itens) com evidência.

Guardas por fase: `pnpm typecheck` + `pnpm lint` + `pnpm test:unit` (nexus-ui,
command-palette, sidebar-grupos, navegação) + e2e alvo; screenshots em
`evidence/` quando a tela mudar de visual.
