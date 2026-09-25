# NEXUS 2.0 — PROGRESSO / HANDOFF (leia isto primeiro)

> **Propósito:** este arquivo é a memória entre sessões. Atualize-o SEMPRE no fim de
> cada torno (última ação + próximas passos) antes de os tokens acabarem.
> Quem chegar novo: NÃO alucine estado — tudo abaixo foi medido neste repo.
> Espelho do spec: `# NEXUS 2.0 — ERP + CRM + SALES OS .txt` (fora do repo, em
> `C:\Users\Daniel\Documents\wppcrm2\`).

## Estado do repositório (última medição)

- Repo: `C:\Users\Daniel\Documents\wppcrm2\DeskcommCRM` · branch **`nexus-v2`**
- HEAD: `4126a9681 feat(nexus-v2): Sidebar §19 - taxonomia de 9 grupos, 18 portas, dobra fechada (53)`
  (anteriores: `31e1b6655` login helper Windows · `7225f5c80` docs ·
  `b5ae07bed` Dashboard 52 · `259023c91` Financeiro 51 · `3c5126932` Compras)
- Remotes: `nexus` = escrita canônica (`https://github.com/spiesdan/nexus`) —
  **todo push vai para `nexus`**; `origin`/`fork` = somente leitura (AGENTS.md);
  o spec §101 quer SÓ o nexus — **decisão pendente do usuário** (ver abaixo).
- Não existe PR `nexus-v2 → main` ainda (abrir só com ordem explícita).
- Árvore limpa (nada de WIP).

## Última ação

Passo 5 (Sidebar §19) FECHADO em `4126a9681` (helper de e2e em `31e1b6655`):
`lib/navigation/registry.ts` reescrito para os **9 grupos da §19** (ids `visao`,
`vendas`, `atendimento`, `ia`/Inteligência, `operacao`, `financeiro`, `fiscal`,
`equipe`, `organizacao`/Configurações — `crm`/`canais`/`analise` deletados).
**Medição real da dobra** (script temporário `medir-dobra.spec.ts`, já apagado):
`nav763 · conteudo744 · folga+19 · rola=false · links18 · títulos8` com a ordem
EXATA da §19 (Dashboard, Meu Dia | Pedidos, Clientes, Produtos, Funis, Prospecção |
Inbox, Radar, Follow-ups, Agenda | Ver tudo em IA | Estoque, Compras, Expedição |
Contas a Receber | Notas fiscais | Comissões). Orçamento validado:
`conteudo = 4 + 30·L + 25·H ≤ 763` → H=8 ⇒ L≤18 (mediu exato).
Decisões INFIDO travadas na implementação (ver conversa/proxy): Agenda é o único
link não-listado da §19 (porta do dia); Etapas do funil e `/app/team` moram no
hub Configurações (porta = ⌘K); INTELIGÊNCIA hub-only (só o link "Ver tudo em IA"
entra — única aritmética que cabe); EQUIPE no sidebar = só Comissões; hub de
Canais é a última seção do hub; `/app` (Dashboard) virou destino+sidebar com
exceção de `isActive` em `components/shell/Sidebar.tsx` (senão `aria-current`
em toda tela); `sidebarGroups()` mantém grupo hub-only vivo com 0 itens.
Gates: `tsc` 0 · `eslint` 0 errors · unit 42/42 novos verdes (budget 18/8,
portas, hub-only) · suíte completa = só os 4 flakes Windows + 1 timeout de
carga (`telas-sem-dado-de-mentira` passa solto) · e2e local verdes:
`navegacao` 11 · `webhooks`+`vps-ssrf`+`agenda-tela-do-produto` 9 ·
medição 1. `next.config.ts` já está **revertido** (sem `ignoreBuildErrors`);
temporários `next.config.ts.bak`/`medir-dobra.spec.ts` apagados.

Helper de e2e (`31e1b6655`): `login-admin.ts` mede o skew relógio local×servidor
(header `Date` do `/auth/v1/health`) e compensa no TOTP — este PC está +46~47s
adiantado (CMOS sem NTP; corrigir de vez com `w32tm /resync` **como admin**);
e `tests/e2e/utils/npx.ts` (`execNpx`) — `execFileSync("npx")` sem shell dá
`ENOENT` no Windows (o `.cmd` só resolve em shell), quebrando os beforeAll de
seed de ~75 specs no Windows (CI Linux não afeta).

Passo 4 (Dashboard `b5ae07bed`) e passos 1-3 (Compras `3c5126932`, Estoque
`31d9411a9`, Financeiro `259023c91`) já fechados.

## Próximos passos (ordem aprovada — continue por aqui)

1. **Redesign §100 (passo 6, o monstro, ~70% do esforço)** — só **15 de 291**
   arquivos usam `nexus-ui`; ordem: inventário classificado
   (NOVO/REFATORAR/CONSOLIDAR/REMOVER) → tokens/shell → módulos por prioridade
   (Dashboard → Clientes → 360 → Pedidos → Inbox → Radar → resto) → mobile.
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
- Relógio desta máquina +46~47s adiantado: sem compensação todo TOTP dá 422.
  O helper compensa (31e1b6655); a correção de fundo é `w32tm /resync` como
  admin. MFA lockout = cookie 3 falhas/60s. Seed: `npx tsx
  scripts/seed-e2e-credentials.ts` + `seed-e2e-followup-agent.ts`.

## Arquivos de contexto do projeto

- Spec (fora do repo): `C:\Users\Daniel\Documents\wppcrm2\# NEXUS 2.0 — ERP + CRM + SALES OS .txt`
- Auditoria: `docs/nexus-v2/*.md` (11 arquivos) · deploy: `docs/infrastructure/deploy-performance.md`
- Doutrina: `AGENTS.md` + `CLAUDE.md` (ler antes de mexer em schema/CI/packaging)
