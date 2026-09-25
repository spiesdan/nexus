# NEXUS 2.0 — PROGRESSO / HANDOFF (leia isto primeiro)

> **Propósito:** este arquivo é a memória entre sessões. Atualize-o SEMPRE no fim de
> cada torno (última ação + próximas passos) antes de os tokens acabarem.
> Quem chegar novo: NÃO alucine estado — tudo abaixo foi medido neste repo.
> Espelho do spec: `# NEXUS 2.0 — ERP + CRM + SALES OS .txt` (fora do repo, em
> `C:\Users\Daniel\Documents\wppcrm2\`).

## Estado do repositório (última medição)

- Repo: `C:\Users\Daniel\Documents\wppcrm2\DeskcommCRM` · branch **`nexus-v2`**
- HEAD: `6f12049c0 fix(e2e): offset de relogio host<->GoTrue medido no globalSetup + execNpx nos specs de MFA restantes`
  (anteriores: `d949973d5` TopBar admin · `40e049aab` ContextualDrawer ·
  `cd0caeccc` NotificationCenter · `359c03e3f` Breadcrumb · `0353cd57b` Fase 1
  mata uimaxxing · `9c26fd26e` inventário §100 · `4126a9681` Sidebar §19 ·
  `31e1b6655` helper Windows · `7225f5c80` docs · passos 1-4: `b5ae07bed`/
  `259023c91`/`31d9411a9`/`3c5126932`)
- Remotes: `nexus` = escrita canônica (`https://github.com/spiesdan/nexus`) —
  **todo push vai para `nexus`**; `origin`/`fork` = somente leitura (AGENTS.md);
  o spec §101 quer SÓ o nexus — **decisão pendente do usuário** (ver abaixo).
- Não existe PR `nexus-v2 → main` ainda (abrir só com ordem explícita).
- Árvore limpa (nada de WIP). Todos os commits acima já estão em `nexus`.

## Última ação

**Passo 6 (redesign §100) — Fases 0, 1 e 2 executadas; Fase 2 com UM item
pendente (2d Global Search).** Inventário: `docs/nexus-v2/redesign-inventory.md`
(142 itens + plano de 7 fases; alvos fantasma corrigidos em `9c26fd26e`).
Decisão INFIDO travada: **tema dark-first mantido** (§100/§14 não mandam claro).

- **Fase 1 `0353cd57b`**: −9.442 linhas — 64/67 `components/uimaxxing/*` apagados
  (3 crm movidos p/ `components/nexus-ui/crm/` + barril), 8 primitivos `ui/`
  órfãos apagados, `app/(admin)/` apagado. `uimaxxing.css` (66KB) continua
  `@import` em `globals.css:2` — **CSS adiado** (risco visual). Mantidos por
  decisão: `app/ai/layout.tsx` e `app/admin/layout.tsx` (semântica intencional).
- **Fase 2a Breadcrumb `359c03e3f`**: `shell/Breadcrumb.tsx` sobre o registry
  (destino/hub com rótulo do GRUPO, `canSee`, id→"Detalhe", some <2 níveis);
  `AppShell.main` virou coluna flex com wrapper `flex-1 min-h-0` (h-full das
  páginas intacto). Teste `breadcrumb.test.tsx` 7/7; e2e navegacao 11/11,
  inbox+kanban 3/3 (layouts h-full).
- **Fase 2c NotificationCenter `cd0caeccc`**: sino virou popover com prévia dos
  itens de `useAgentInbox("open")` (SoR = `AgentInboxList`: severity badge,
  `kindLabel`, `formatDistanceToNowStrict`), testids `alerts-bell/-count`
  preservados, `AlertsBell.tsx` apagado. Painel sem ação (resolver é da
  central). e2e novo no fim de `navegacao.spec.ts` (12/12).
- **Fase 2b ContextualDrawer `40e049aab`**: `shell/ContextualDrawer` = casa do
  `ui/sheet` (overlay/esc/foco/anim SoR); primeiro migrante = painel de detalhe
  manual da prospecção (`_empresas.tsx:767`, era `fixed inset-y-0` sem backdrop
  nem teclado). e2e `prospeccao-mapa` 1/1 (usa `getByRole("dialog")`).
- **Fase 2e TopBar admin `d949973d5`**: `AdminShell` ganhou header completo
  (hambúrguer lg:hidden + título + `SearchTrigger` + `NotificationCenter` +
  `UserMenu`); **`AuthProvider` passou a existir no admin** — ele SÓ existia em
  `app/app/layout.tsx`, e sem ele a barra nova derrubava `/admin/*` no SSR com
  "useAuth must be used inside `<AuthProvider>`" (medido em e2e `/admin/marca`).
  `(protected)/layout.tsx` agora faz `requirePlatformAdmin()` (guarda) +
  `loadAuthUser()` (AuthUser rico) + `<AuthProvider activeOrg={null}>`.
  Testes: `admin-topbar.test.tsx` 2/2, `admin-shell-tooltip` 2/2; e2e
  `marca-logo` 6/6 + evidências em `evidence/marca-logo/` (commitadas —
  `evidence/` É tracked).
- **Infra e2e `6f12049c0`**: offset host↔GoTrue agora é medida UMA vez no
  `globalSetup` (`tests/e2e/global-setup.ts` → `E2E_CLOCK_OFFSET_MS` herdado
  pelos workers); `generateTotp`/`msUntilNextTotpWindow` DEFAULT ao relógio do
  servidor em `tests/e2e/utils/totp.ts` — os 12 specs que digitam TOTP
  (marca-logo, rbac-roles, system-update, qa-agente, followup*, gatilho*,
  invite-lifecycle, reset-password-mfa, olhar-telas, vps-fresh) compensam sem
  editar; `login-admin.ts` importa o mecanismo (não duplica mais); `execNpx`
  aplicado também em `marca-logo`/`prospeccao-mapa`/`inbox-quem-manda`/`kanban`
  (~71 call sites `execFileSync("npx")` continuam quebrando no Windows; CI ok).

## Próximos passos (ordem aprovada — continue por aqui)

1. **Redesign §100 (passo 6) — falta**:
   a. **Fase 2d: Global Search estendida** (inventário §4): hoje só
      navegação+pedidos+contatos no `CommandPalette`; falta leads/conversas/
      produtos/títulos + rota `/busca`. É o ÚLTIMO item da Fase 2 (shell §17
      fica 100%: Sidebar ✅ Topbar ✅(admin+tenant) CommandPalette ✅
      Notifications ✅ ContextualDrawer ✅ Breadcrumb ✅ UserMenu ✅).
   b. **Fase 3 — consolidações**: `StatusPage` 6→1 (403/404/500/503/
      account-suspended + `forbidden`); `AdminDataTable` 7 tabelas→1 +
      `STATUS_VARIANTS`→`ui/badge`; `NexusConfirmDialog` (18 AlertDialog + 7
      `window.confirm`); `SuspendDialog`+`ReactivateDialog`→1; overlays
      manuais restantes→`ui/sheet` (2 de 4 já migrados via ContextualDrawer);
      toasts→`nexusToast`.
   c. **Fase 4 — refatoração por módulo** (inventário §2.1): `/contacts` →
      `/pedidos` (hex Mercos→tokens) → `360` → `/inbox` → `/financeiro` (8
      tabelas + fusão com `/titulos`) → `/radar` (+`/recuperacao`) →
      `/indicadores` (+`/metrics`) → `/prospeccao` → funis → `/agenda` →
      `pedidos/[id]`/`novo` → `/webhooks` → admin.
   d. **Fase 5 — superfície compartilhada**: `NexusPageHeader` único (matar
      `layout/PageHeader`+`CrmPageHeader`), FilterBar único, tabs manuais→
      `ui/tabs`, `NexusKpi`/`NexusChart`, `FormField`.
   e. **Fase 6 — responsividade §60** (24 rotas sem breakpoint) + auditoria
      visual de aceite §100 (checklist dos 11 itens) com evidência.
   Guarda por fase: `pnpm typecheck` + `pnpm lint` + `test:unit` (breadcrumb,
   notification-center, contextual-drawer, admin-topbar, sidebar-grupos,
   command-palette, navegacao-*) + e2e alvo + evidence/ quando a tela mudar.
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
- `AuthProvider` só nasce em `app/app/layout.tsx`; `/admin` ganhou o seu em
  `(protected)/layout.tsx` (Fase 2e). Qualquer componente novo em `/admin` que
  use `useUser`/`useAuth` depende dessa junção — sem ela, SSR derruba a rota.
- `evidence/` é TRACKED (commitar screenshots de e2e como prova visual);
  `.superpowers/` não.

## Arquivos de contexto do projeto

- Spec (fora do repo): `C:\Users\Daniel\Documents\wppcrm2\# NEXUS 2.0 — ERP + CRM + SALES OS .txt`
- Auditoria: `docs/nexus-v2/*.md` (11 arquivos) · deploy: `docs/infrastructure/deploy-performance.md`
- Doutrina: `AGENTS.md` + `CLAUDE.md` (ler antes de mexer em schema/CI/packaging)
