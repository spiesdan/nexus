# NEXUS 2.0 — PROGRESSO / HANDOFF (leia isto primeiro)

> **Propósito:** este arquivo é a memória entre sessões. Atualize-o SEMPRE no fim de
> cada torno (última ação + próximas passos) antes de os tokens acabarem.
> Quem chegar novo: NÃO alucine estado — tudo abaixo foi medido neste repo.
> Espelho do spec: `# NEXUS 2.0 — ERP + CRM + SALES OS .txt` (fora do repo, em
> `C:\Users\Daniel\Documents\wppcrm2\`).

## Estado do repositório (última medição)

- Repo: `C:\Users\Daniel\Documents\wppcrm2\DeskcommCRM` · branch **`nexus-v2`**
- HEAD: `b5ae07bed feat(nexus-v2): Dashboard centro de comando - clientes para agir, roadmap, radar e IA (52)`
  (anteriores: `259023c91` Financeiro 51 · `31d9411a9` Estoque · `28d9f4fbd` docs ·
  `3c5126932` Compras)
- Remotes: `nexus` = escrita canônica (`https://github.com/spiesdan/nexus`) —
  **todo push vai para `nexus`**; `origin`/`fork` = somente leitura (AGENTS.md);
  o spec §101 quer SÓ o nexus — **decisão pendente do usuário** (ver abaixo).
- Não existe PR `nexus-v2 → main` ainda (abrir só com ordem explícita).
- Árvore limpa (nada de WIP).

## Última ação

Passo 4 da ordem aprovada (Dashboard §20/§91) FECHADO em `b5ae07bed`: novas
seções em `app/app/_home.tsx` via `app/app/_home-secoes.tsx` —
**Clientes para agir** (chips Recompra/Risco/Oportunidades/Follow-up +
lista top-5 do radar com `ROTULO_RECOMPRA` + follow-ups vencidos via
`GET /api/v1/ai/followups/queue?limit=100`), **Sales roadmap**
(`GET /api/v1/roadmap`, ComposedChart 12 meses: realizado × meta × projeção,
nota de amostra parcial), **Sales radar** (contagens risco/oportunidade/recompra
com o MESMO agrupamento do `RadarCategorias`) e **IA** (`<BrainRecomendacoes />`
zero-props, já usava `useSalesBrain(6)`). Todos os fetches em react-query com
staleTime 5-10min (o radar agrega a base inteira — 60s de timeout). Gates:
`tsc` 0, `eslint` 0, i18n+branding 34 verdes, suíte completa = só os 4 flakes
Windows (`guarda-da-release`/`namespace-das-imagens`/`performed-at`/`rate-limit`),
7360 passam.

Passos 1-3 já fechados: Compras (`3c5126932`), Estoque (`31d9411a9`), Financeiro
com as 5 abas (`259023c91`). Padrões aprendidos (mantidos): `toLocaleDateString`
com tag de `useTagDeIdioma()`; `// eslint-disable-next-line
react-hooks/set-state-in-effect` antes de `void carregar()` (precedente
`financeiro/_client.tsx:142`); **o lint do react-compiler reprova `Date.now()`
dentro do render** ("Cannot call impure function during render") — o corte
"vencido" foi pro `queryFn`.

## Próximos passos (ordem aprovada — continue por aqui)

1. **Sidebar §19 (passo 5)** — taxonomia nova (9 grupos do spec vs 6 atuais em
   `lib/navigation/registry.ts`); destinos faltantes: Estoque, Compras,
   Campanhas (hoje embutida em Prospecção), Metas, Notas, Cobranças.
   Cuidado com o gate da dobra (sidebar `sidebar: true` = 27 hoje).
2. **Redesign §100 (passo 6, o monstro, ~70% do esforço)** — só **15 de 291**
   arquivos usam `nexus-ui`; ordem: inventário classificado
   (NOVO/REFATORAR/CONSOLIDAR/REMOVER) → tokens/shell → módulos por prioridade
   (Dashboard → Clientes → 360 → Pedidos → Inbox → Radar → resto) → mobile.
3. **E2E §86 (passo 7)** — 6 jornadas nomeadas (hoje só `recompra-radar`) +
   specs das telas novas (Compras/Estoque) em `SPECS_PARTE_*` (gate
   e2e-cobertura).
4. **Fechamento (passo 8)** — docs (`parity-matrix`/`migration-plan`
   desatualizados desde a Etapa 1-3), checklist §94 recontado, **abrir PR**
   (ordem do usuário), CI Linux, deploy medido na VPS (§84).
   Antes de fechar: checar o spec linha a linha (§20/§91 já cumpridos no
   Dashboard; confirmar §51-§53, §14, §19 contra o spec).

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

## Arquivos de contexto do projeto

- Spec (fora do repo): `C:\Users\Daniel\Documents\wppcrm2\# NEXUS 2.0 — ERP + CRM + SALES OS .txt`
- Auditoria: `docs/nexus-v2/*.md` (11 arquivos) · deploy: `docs/infrastructure/deploy-performance.md`
- Doutrina: `AGENTS.md` + `CLAUDE.md` (ler antes de mexer em schema/CI/packaging)
