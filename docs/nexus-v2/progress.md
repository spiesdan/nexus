# NEXUS 2.0 — PROGRESSO / HANDOFF (leia isto primeiro)

> **Propósito:** este arquivo é a memória entre sessões. Atualize-o SEMPRE no fim de
> cada torno (última ação + próximas passos) antes de os tokens acabarem.
> Quem chegar novo: NÃO alucine estado — tudo abaixo foi medido neste repo.
> Espelho do spec: `# NEXUS 2.0 — ERP + CRM + SALES OS .txt` (fora do repo, em
> `C:\Users\Daniel\Documents\wppcrm2\`).

## Estado do repositório (última medição)

- Repo: `C:\Users\Daniel\Documents\wppcrm2\DeskcommCRM` · branch **`nexus-v2`**
- HEAD: `eafb9c071 feat(nexus-v2): Fase 3c do redesign - NexusConfirmDialog adotado: 7 window.confirm + 13 AlertDialog (§100)`
  — e o commit que entrega este arquivo **fecha o handoff da Fase 3 (3a/3b/3c)**.
  (anteriores: `ab0545095` Fase 3b AdminDataTable · `37b35a029` Fase 3a StatusPage ·
  `c343a9993` Fase 2d Global Search · `727faf650` handoff fases 0/1/2 ·
  `6f12049c0` infra e2e · `d949973d5` TopBar admin · `40e049aab` ContextualDrawer ·
  `cd0caeccc` NotificationCenter · `359c03e3f` Breadcrumb · `0353cd57b` Fase 1 mata uimaxxing ·
  `9c26fd26e` inventário §100 · `4126a9681` Sidebar §19 ·
  `31e1b6655` helper Windows · `7225f5c80` docs · passos 1-4: `b5ae07bed`/
  `259023c91`/`31d9411a9`/`3c5126932`)
- Remotes: `nexus` = escrita canônica (`https://github.com/spiesdan/nexus`) —
  **todo push vai para `nexus`**; `origin`/`fork` = somente leitura (AGENTS.md);
  o spec §101 quer SÓ o nexus — **decisão pendente do usuário** (ver abaixo).
- Não existe PR `nexus-v2 → main` ainda (abrir só com ordem explícita).
- Árvore limpa (nada de WIP). Todos os commits acima já estão em `nexus`.

## Última ação

**Passo 6 (redesign §100) — Fase 3 (consolidações) 3a/3b/3c EXECUTADAS nesta
torno; fases 0/1/2 + shell §17 fechados no handoff `727faf650`.** Inventário:
`docs/nexus-v2/redesign-inventory.md` (tabela §5 atualizada com os hashes).
Decisão INFIDO travada: **tema dark-first mantido** (§100/§14 não mandam claro).

- **Fase 3a `37b35a029` — `StatusPage` 6→1**: uma tela de erro em
  `components/nexus-ui/feedback/StatusPage.tsx` serve 403/404/500/503/
  account-suspended/admin.forbidden; `lib/i18n/idioma-da-pagina.ts` resolve o
  idioma do documento fora do provider React (as páginas de erro não têm
  `useT`). Teste `status-page.test.tsx`.
- **Fase 3b `ab0545095` — `AdminDataTable` 7→1 + badges**: as 7 tabelas admin
  (audit, incidents, lgpd, platform-admins, tenants, usage, users) montam
  skeleton/empty/badge/load-more sobre `components/admin/AdminDataTable.tsx`;
  variantes de status agrupadas em `admin/incidents/badges.tsx` +
  `admin/tenants/status-badge.tsx` (consumidos por `incidents/[id]/_client` e
  `tenants/[id]/layout`, que deixaram de ter cópias locais).
- **Fase 3c `eafb9c071` — confirmações unificadas**: `NexusConfirmDialog`
  estendeu o contrato (title `ReactNode`, description opcional, `busyLabel`,
  slot `children`, modo trigger `triggerLabel` OU controlado `aberto`/`aoFechar`,
  `try/catch` no `onConfirm` — erro mantém a dialog aberta para retry) e ganhou
  `forms/ConfirmacaoProvider.tsx` (`useConfirmar()` promise-based; montado em
  `app/app/layout.tsx` dentro do `IdiomaProvider`; exportado no barril
  `nexus-ui`). Migraram **7 `window.confirm`** (financeiro estornar; expedição
  reotimizar×2, excluirCarga; categorias apagar; pedidos excluirEmMassa e
  excluir; prospecção excluir) e **13 `AlertDialogContent`** (RulesTab,
  Templates, DeleteFollowupFlow, Impersonate, ContactsTable, CredentialCard,
  AgentRowMenu, VersionHistory, PublishConfirm, SourceDetail, QueueTab,
  routers, DossieDoFollowup). Restam 4 `AlertDialogContent` = FORM:
  `SuspendDialog`+`ReactivateDialog` (fundir → Fase 3d),
  `ResolveIncidentDialog`, `ApproveButton`. Teste novo
  `tests/unit/confirmacao-provider.test.tsx` (8 casos); e2e `followup-queue` e
  `retorno-anti-morte` migraram `execFileSync("npx")` → `execNpx` (Windows).
- **Gates da torno**: typecheck ✓ · lint 0 erros/338 warnings (baseline) ·
  `test:unit` = flakes de baseline (4 arquivos conhecidos: guarda-da-release,
  namespace-das-imagens, performed-at, rate-limit) · `pnpm build` ✓ ·
  e2e `webhooks`+`followup-queue`+`retorno-anti-morte` 6/6 ✓ ·
  `navegacao` 13/13 ✓ · `pnpm format:check` reprova pré-existente no repo
  inteiro (não é gate).

## Próximos passos (ordem aprovada — continue por aqui)

1. **Redesign §100 (passo 6) — shell §17 FECHADO (2a-2e ✅); Fase 3a/3b/3c ✅; resta 3d-3f + Fases 4-6**:
   a. **Fase 3 — consolidações**: ✅ `StatusPage` 6→1 (`37b35a029`); ✅
      `AdminDataTable` 7 tabelas→1 + badges (`ab0545095`); ✅
      `NexusConfirmDialog` (`eafb9c071`: 7 `window.confirm` + 13 AlertDialog +
      `ConfirmacaoProvider`); resta: **3d** `SuspendDialog`+`ReactivateDialog`→1
      (`TenantReasonDialog`; `ResolveIncidentDialog`/`ApproveButton` opcional
      na mesma leva); **3e** overlays manuais restantes→`ui/sheet` (2 de 4 já
      migrados via ContextualDrawer); **3f** toasts→`nexusToast`.
   b. **Fase 4 — refatoração por módulo** (inventário §2.1): `/contacts` →
      `/pedidos` (hex Mercos→tokens) → `360` → `/inbox` → `/financeiro` (8
      tabelas + fusão com `/titulos`) → `/radar` (+`/recuperacao`) →
      `/indicadores` (+`/metrics`) → `/prospeccao` → funis → `/agenda` →
      `pedidos/[id]`/`novo` → `/webhooks` → admin.
   c. **Fase 5 — superfície compartilhada**: `NexusPageHeader` único (matar
      `layout/PageHeader`+`CrmPageHeader`), FilterBar único, tabs manuais→
      `ui/tabs`, `NexusKpi`/`NexusChart`, `FormField`.
   d. **Fase 6 — responsividade §60** (24 rotas sem breakpoint) + auditoria
      visual de aceite §100 (checklist dos 11 itens) com evidência.
   Guarda por fase: `pnpm typecheck` + `pnpm lint` + `test:unit` (breadcrumb,
   notification-center, contextual-drawer, admin-topbar, sidebar-grupos,
   command-palette, busca-global, leads/titulos route, status-page,
   confirmacao-provider, navegacao-*) + e2e alvo + evidence/ quando a tela
   mudar.
2. **E2E §86 (passo 7)** — 6 jornadas nomeadas (hoje só `recompra-radar`) +
   specs das telas novas (Compras/Estoque) em `SPECS_PARTE_*` (gate
   e2e-cobertura).
3. **Fechamento (passo 8)** — docs (`parity-matrix`/`migration-plan`
   desatualizados desde a Etapa 1-3), checklist §94 recontado, **abrir PR**
   (ordem do usuário), CI Linux, deploy medido na VPS (§84).
   Antes de fechar: checar o spec linha a linha (§19/§20/§91 já cumpridos;
   confirmar §51-§53, §14 contra o spec).

## Decisões pendentes do usuário (NÃO decidir sozinho)

- **§101**: posso remover os remotes `origin`/`fork` (critério de aceite do
  spec diz `git remote -v` só com NEXUS, mas AGENTS.md os declara permanentes)?
- **PR**: abrir `nexus-v2 → main` em qual ponto (antes ou depois do redesign)?

## Fatos para não alucinar (medidos)

- Testes: `pnpm test:unit` ~5min · `pnpm test:db` (Docker) ~16-18min ·
  `tsc --noEmit -p tsconfig.typecheck.json` ~40s. `pnpm gov:verify` NÃO cobre
  test:db nem e2e.
- Flakes pré-existentes (NÃO são nossos, provados na main limpa):
  `contato-consent-e-auditoria`, `triagem194-defeitos-alegados` (test:db);
  unit no Windows: `namespace-das-imagens`/`guarda-da-release` (falta `grep`),
  `rate-limit` (timeout 15s), `performed-at-um-relogio-so`, `lib/ui/icons`.
- Gates que travam entrega nova: navegação (rota nova → registry),
  `manifest-x-migrations` + apêndice no `baseline.sql` **ANTES** do bloco
  `VARREDURA anon` (~linha 19860), branding (nunca "Deskcomm" no código de
  usuário), `lib/audit/actions.ts` para ação nova, RLS: tabela nova em
  `tests/invariants/rls-isolation.test.ts` TABLES+seed, definer em
  `AUTHENTICATED_PERMITIDO` do `hardening-definer-varredura.test.ts`.
- Rotas com `[id]` NÃO precisam entrar no registry (gate as ignora); estáticas
  SIM.
- `NexusEmptyState` props são `icon/headline/subcopy/primary{label,onClick}` —
  NÃO `title/description/action`.
- API é `snake_case`, dinheiro `*_cents`, `apiClient.get/post/patch/delete`,
  erros via `showApiError`/`nexusToast`, wrappers `ok()/fail()`.
- Endpoints consumidos pelos passos 1-4: `/api/v1/financeiro/fluxo`,
  `/api/v1/roadmap`, `/api/v1/inventory/sugestoes`, `/api/v1/inventory/movements`,
  `/api/v1/financial-pagaveis`, `/api/v1/radar-compras`,
  `/api/v1/ai/followups/queue`, `/api/v1/sales-brain`. Refaça a varredura de
  órfãos antes de afirmar qual ainda sobra.
- `GET /api/v1/pipelines` exige **manager** — o Dashboard (viewer) não pode
  usá-lo; use radar-compras/roadmap/fila/sales-brain (viewer OK).
- Agrupamento oficial do radar (não inventar): risco=`em_risco`;
  recompra=`recompra_atrasada`; oportunidade=`oportunidade_aberta`+
  `em_voo`+`primeira_compra`; perda=`cancelado_sem_nova`
  (`app/app/radar/_components/RadarCategorias.tsx`).
- `<BrainRecomendacoes />` não tem props (busca sozinho via `useSalesBrain(6)`);
  Badge aceita variant `error|warning|info`; filtros de fila vencida:
  `status ∈ {active, waiting_reply, agendada}` e `next_fire_at < agora`.
- Padrões de UI aprendidos nos passos 1-4 (mantidos): `toLocaleDateString`
  com tag de `useTagDeIdioma()`; `// eslint-disable-next-line
  react-hooks/set-state-in-effect` antes de `void carregar()` (precedente
  `financeiro/_client.tsx:142`); **o lint do react-compiler reprova `Date.now()`
  dentro do render** ("Cannot call impure function during render").
- **Orçamento da dobra (medido)**: `conteudo = 4 + 30·L + 25·H ≤ 763` no
  viewport 1280×900 do spec; H=8 títulos ⇒ L≤18 links. MEXER no sidebar exige
  re-medição (o script `medir-dobra.spec.ts` foi temporário e saiu do repo;
  recrie medindo `nav`/`conteudo` antes de adicionar qualquer `sidebar: true`).
- **`pnpm e2e:build` no Windows**: a cada `next build`, 4 junctions dentro de
  `.next/node_modules/` nascem vazios (Next#87737 — `require-in-the-middle`,
  `import-in-the-middle`, `pg`, `@react-pdf/renderer`). Reparo: `Remove-Item`
  + `cmd /c mklink /J <link> <absoluto em node_modules\.pnpm\…>`; se estiverem
  vazios o `next start` cai com MODULE_NOT_FOUND no runtime.
- Relógio desta máquina +46~47s adiantado: sem compensação todo TOTP dá 422 e
  o erro vira "MFA falhou". **A compensação é automática desde `6f12049c0`**:
  `globalSetup` do Playwright mede (header `Date` do `/auth/v1/health`) e
  publica `E2E_CLOCK_OFFSET_MS`; `generateTotp`/`msUntilNextTotpWindow` em
  `tests/e2e/utils/totp.ts` já default ao relógio do servidor. Correção de
  fundo segue sendo `w32tm /resync` como admin (sem permissão interativa).
  MFA lockout = cookie 3 falhas/60s. Seed: `npx tsx
  scripts/seed-e2e-credentials.ts` + `seed-e2e-followup-agent.ts`.
- `execNpx` (`tests/e2e/utils/npx.ts`, shell só no win32) é obrigatório para
  chamar `npx` de spec: `execFileSync("npx")` cru dá `ENOENT` no Windows (CI
  Linux ok). 2 specs migrados na Fase 3c (`followup-queue`,
  `retorno-anti-morte`); os call sites restantes só quebram quem roda e2e
  local no Windows — migrar ao tocar no spec.
- `AuthProvider` só nasce em `app/app/layout.tsx`; `/admin` ganhou o seu em
  `(protected)/layout.tsx` (Fase 2e). Qualquer componente novo em `/admin` que
  use `useUser`/`useAuth` depende dessa junção — sem ela, SSR derruba a rota.
- `evidence/` é TRACKED (commitar screenshots de e2e como prova visual);
  `.superpowers/` não. E o gate `evidencia-citada.test.ts` cobra o OUTRO
  lado: imagem versionada sem citação (`[x](…)`/crase) em `*.md` versionado
  reprova — e "versionado" lê `git ls-files`, então um `README` novo só
  conta depois do `git add` (aconteceu com as 6 fotos da marca-logo).
- Busca global: SoR única = `lib/busca/global.ts` (paleta e `/app/busca`
  compartilham); vocabulário de cada endpoint e hrefs estão em
  `tests/unit/busca-global.test.ts`. Produto/título não têm tela de
  detalhe → caem na LISTA filtrada (`?busca=` no preload). `limite=0` de
  `/api/v1/leads` cai no default 5 (mesmo `Number(x) || 5` do prospects).

## Arquivos de contexto do projeto

- Spec (fora do repo): `C:\Users\Daniel\Documents\wppcrm2\# NEXUS 2.0 — ERP + CRM + SALES OS .txt`
- Auditoria: `docs/nexus-v2/*.md` (11 arquivos) · deploy: `docs/infrastructure/deploy-performance.md`
- Doutrina: `AGENTS.md` + `CLAUDE.md` (ler antes de mexer em schema/CI/packaging)
