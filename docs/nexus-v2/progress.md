# NEXUS 2.0 — PROGRESSO / HANDOFF (leia isto primeiro)

> **Propósito:** este arquivo é a memória entre sessões. Atualize-o SEMPRE no fim de
> cada torno (última ação + próximas passos) antes de os tokens acabarem.
> Quem chegar novo: NÃO alucine estado — tudo abaixo foi medido neste repo.
> Espelho do spec: `# NEXUS 2.0 — ERP + CRM + SALES OS .txt` (fora do repo, em
> `C:\Users\Daniel\Documents\wppcrm2\`).

## Estado do repositório (última medição)

- Repo: `C:\Users\Daniel\Documents\wppcrm2\DeskcommCRM` · branch **`nexus-v2`**
- HEAD: `3c5126932 feat(nexus-v2): UI Compras - pedidos, fornecedores e detalhe (Etapa 3)`
- Remotes: `nexus` = escrita canônica (`https://github.com/spiesdan/nexus`) —
  **todo push vai para `nexus`**; `origin`/`fork` = somente leitura (AGENTS.md);
  o spec §101 quer SÓ o nexus — **decisão pendente do usuário** (ver abaixo).
- Não existe PR `nexus-v2 → main` ainda (abrir só com ordem explícita).
- Árvore limpa (nada de WIP).

## Última ação

Passo 1 da ordem aprovada (Compras) FECHADO: `app/app/compras/` (lista com abas
Pedidos/Fornecedores + detalhe `[id]` com transições), entrada `/app/compras`
em `lib/navigation/registry.ts` (grupo `crm`, sem `sidebar` — dobra), ícones
`ShoppingCart`/`Package`. Verificado antes do commit: `tsc` 0, `eslint` 0,
59 testes verdes (navegacao-completude/registry, branding, i18n, rótulos).
Suíte unit completa: 7359 passam; falharam só os flakes Windows conhecidos
(`guarda-da-release`, `namespace-das-imagens`, `performed-at`, `rate-limit`) —
um defeito NOSSO apareceu e foi corrigido no mesmo turno: datas com
`toLocaleDateString("pt-BR")` fixo (guard `i18n-a-data-segue-o-idioma`); o
padrão certo é `useTagDeIdioma()` de `@/hooks/i18n/useLocaleDeData`. Para o
padrão `carregar()` chamado de `useEffect`, o repo aceita
`// eslint-disable-next-line react-hooks/set-state-in-effect` (precedente em
`app/app/financeiro/_client.tsx:142`).

## Próximos passos (ordem aprovada — continue por aqui)

1. **Estoque UI (passo 2)** — criar `app/app/estoque/`: aba Sugestões consome
   `GET /api/v1/inventory/sugestoes` (hoje órfã) com botão "Criar compra" →
   `/app/compras?novo=1&produto=<id>&qtd=<n>` (o diálogo de Nova compra do
   Compras já lê esse prefill); aba Movimentos consome
   `GET /api/v1/inventory/movements` + diálogo de novo movimento →
   `POST .../movements`. Entrada `/app/estoque` no registry (grupo `crm`,
   sem sidebar), `tsc + lint + testes de navegação/i18n/branding`, commit+push
   `nexus`. Lembrete de gate: se criar função/tabela nova, TABLES do
   `rls-isolation` + definer em `AUTHENTICATED_PERMITIDO`.
2. **Financeiro §51** — abas faltantes em `app/app/financeiro/_client.tsx`:
   Contas a Pagar, Cobranças, **Fluxo de Caixa** (API
   `/api/v1/financeiro/fluxo` existe e está órfã, 0 telas).
3. **Roadmap + Dashboard §20/§91** — consumir `/api/v1/roadmap` (órfã) no
   Dashboard; adicionar "Clientes para Agir" (usa sales-brain/radar já
   existentes), Sales Radar e ações da IA; o Dashboard hoje só tem
   vendas/meta/projeção + acesso rápido + atividade (`app/app/_home.tsx`).
4. **Sidebar §19** — taxonomia nova (9 grupos do spec vs 6 atuais em
   `lib/navigation/registry.ts`); destinos faltantes: Estoque, Compras,
   Campanhas (hoje embutida em Prospecção), Metas, Notas, Cobranças.
   Cuidado com o gate da dobra (sidebar `sidebar: true` = 27 hoje).
5. **Redesign §100 (o monstro, ~70% do esforço)** — só **15 de 291** arquivos
   usam `nexus-ui`; ordem: inventário classificado (NOVO/REFATORAR/CONSOLIDAR/
   REMOVER) → tokens/shell → módulos por prioridade (Dashboard → Clientes →
   360 → Pedidos → Inbox → Radar → resto) → mobile.
6. **E2E §86** — 6 jornadas nomeadas (hoje só `recompra-radar`) + specs das
   telas novas (Compras/Estoque) em `SPECS_PARTE_*` (gate e2e-cobertura).
7. **Fechamento** — docs (`parity-matrix`/`migration-plan` desatualizados desde
   a Etapa 1-3), checklist §94 recontado, **abrir PR** (ordem do usuário),
   CI Linux, deploy medido na VPS (§84).

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
- Endpoints órfãos (0 telas) neste momento: `/api/v1/financeiro/fluxo`,
  `/api/v1/roadmap`, `/api/v1/inventory/sugestoes` (a tela 2 vai consumi-lo).

## Arquivos de contexto do projeto

- Spec (fora do repo): `C:\Users\Daniel\Documents\wppcrm2\# NEXUS 2.0 — ERP + CRM + SALES OS .txt`
- Auditoria: `docs/nexus-v2/*.md` (11 arquivos) · deploy: `docs/infrastructure/deploy-performance.md`
- Doutrina: `AGENTS.md` + `CLAUDE.md` (ler antes de mexer em schema/CI/packaging)
