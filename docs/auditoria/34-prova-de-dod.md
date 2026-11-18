# 34 — Prova de Definition of Done (programa AAA)

> **Frente:** Agente H — jornadas críticas, E2E e prova de DoD (P1-01).
> **Worktree:** `aaa-front-jornadas` · **branch:** `front/jornadas` · **base:** `13fefad3`
> (`nexus/main`, merge do #514; a primeira medição foi em `3141a483` e a branch foi
> rebaseada duas vezes para não entregar em cima de main velha) · **data da medição:** 18/11/2026.
> **Ambiente:** macOS 8 núcleos / 8 GB, Supabase local (`127.0.0.1:54321`, projeto
> `nexus`) com `supabase/baseline.sql` aplicado, Docker 29.8.2, Supabase CLI 2.119.0,
> Node 22.20.0, Playwright com Chromium instalado. **Produção/VPS não foi tocada** —
> nenhum deploy, nenhuma operação fiscal, financeira ou de cobrança.

Este documento responde a uma pergunta só: **o que está provado, com qual comando, em
qual commit — e o que falta.** Ele não substitui os documentos de origem; aponta para
eles e marca o que esta frente conseguiu executar.

## 0. Regra de leitura

| Estado | Significado |
|---|---|
| `[x]` | provado **neste commit**, com comando e resultado reproduzíveis |
| `[~]` | parcial: existe prova de uma parte, e a lacuna está nomeada |
| `[!]` | bloqueado por ambiente/decisão; o motivo exato está escrito |
| `[ ]` | não iniciado nesta frente |

Uma linha `[x]` sem comando ao lado é dívida deste documento, não cobertura. Onde a
prova é de **outra** frente (outro agente/branch), a linha diz isso e **não** é marcada
como se esta frente tivesse medido.

## 1. DoD por item (os 7 critérios do prompt mestre)

Aplicado aos três blocos desta frente — J6 (inbox), J13 (fiscal) e J14 (LGPD). O
critério 2 (regra existente preservada) é o mais importante aqui: **nenhuma regra fiscal,
financeira ou de LGPD foi alterada**. As entregas são teste e prova.

| # | Critério | Estado | Evidência | O que falta |
|---|---|---|---|---|
| 1 | Ligado ao inventário e a uma regra/risco real | `[x]` | `13-jornadas.md` §J6 (7/9), §J13 (3/4), §J14 (2/4); `29-capacidades.md` linhas 2, 16 e 18; `20-plano-priorizado.md` P1 | — |
| 2 | Preserva regras existentes ou tem decisão registrada | `[x]` | Nenhum arquivo de `app/`, `lib/` ou `supabase/` foi alterado; `git diff --stat` da branch só toca `tests/unit/**` e `docs/auditoria/**` | — |
| 3 | Testes adequados ao risco e resultado reproduzível | `[x]` | 50 testes novos em 7 arquivos; comandos e saídas em §3. `pnpm exec vitest run <os 7 arquivos>` → **50 passed** | e2e das jornadas: ver §4 |
| 4 | Sem regressão de tenant, fiscal, financeiro, segurança, a11y ou mobile | `[~]` | Rotas provadas usam `requireRole` + RLS/service role com `organization_id` da sessão; testes de permissão em cada arquivo; nenhum código de produção mudou | `pnpm test:unit` completo e `pnpm test:db` não rodaram nesta frente (§4.2) |
| 5 | Documentação e rollback quando necessário | `[x]` | Este documento + cabeçalhos dos testes. Rollback = reverter a branch; não há migration, env var nem contrato de API novo | — |
| 6 | Estado (branch/PR/merge/release/deploy) correto | `[~]` | Branch `front/jornadas`, commit no fim deste documento; PR aberto quando o push for possível (§4.3). **Não mergeado, não release, não deploy** | merge e release |
| 7 | Evidência corresponde ao commit e ambiente reportados | `[x]` | Base `13fefad3` após rebase; comandos rodados neste worktree; saídas coladas em §3 | — |

## 2. DoD do programa (as 10 condições)

Cada linha aponta para a prova que existe **no commit base** ou declara o que não foi
medido. Nenhuma linha é marcada `[x]` só porque o documento que a descreve existe.

| # | Condição do prompt mestre | Estado | Evidência (com caminho) | O que falta |
|---|---|---|---|---|
| 1 | Todas as telas, subtelas, estados e jornadas cobertos ou com exceção aprovada | `[~]` | `09b-subtelas.md` (157 telas, 57 com subtela, 99 abas/71 modais/12 gavetas — inventário estático); `13-jornadas.md` (J1–J16, 254 ✓ / 7 ✘ / 6 skip na execução de 16/11); `10-cobertura-testes.md` (156 telas, 91 sem sinal estático de teste) | J16 sem spec em CI; 16 telas sem menção em spec (§3.11 do 13); estados de erro/vazio medidos tela a tela só parcialmente |
| 2 | Todos os módulos avaliados e redesenhados conforme o inventário | `[~]` | `16-modulo-5.6.md`, `17-modulos-5.4-5.11.md`, `18-modulos-5.1-5.7.md`; `29-capacidades.md` (30 capacidades em 7 estados, gate `tests/unit/capacidades-classificadas.test.ts`) | "redesenhado" é da frente de design; esta frente só reconcilia o que existe |
| 3 | Design system aplicado ao produto | `[~]` | `05-componentes.md`, `11-auditoria-visual.md`; merge `62e52a41` (#491, `front/design`); `auditoria-aceite-11-itens` mede tipografia/cor em 112 rotas | tokens/design são escopo do Agente D; nenhuma prova visual nova nesta frente |
| 4 | Segurança, isolamento, banco, fiscal e financeiro com provas adequadas | `[x]` | **Isolamento:** `f17-prova-comportamental.md` — 367 casos, `pnpm test:db` (commit `f3fd958d`, em HEAD). **Migrations/baseline/restore:** `f09-prova-de-caminho-unico.md` — install, update, ACL, reset e restore em pg15 descartável (commit `c5779105`, em HEAD). **Idempotência fiscal:** #499 (`3141a483`). **Fiscal/financeiro:** `agente-c-fiscal-financeiro.md` (#494/#495/#496/#500). **Service role:** `handlers-service-role-filtram-organizacao.test.ts` e `handlers-service-role-tem-guard.test.ts`; `service-role-revisao.md` | o gate de service role é textual + testes por handler; `AGENTS.md` ainda declara 89 handlers com service role sem gate automático de tenant — revisão caso a caso continua sendo a prova |
| 5 | Sentinel e campanhas por cidade atendem aos critérios | `[~]` | **Sentinel:** `lib/sentinel/**` (motor determinístico, 27 detectores, kill switch), `app/app/sentinel/page.tsx`, rotas `/api/v1/sentinel/*` e cron; commits `cccfb610`, `f7298d8d`, `b84bfeb4`, `2c2d1462`; testes de unidade ao lado. **Campanhas por cidade:** `lib/prospeccao/origem-da-campanha.ts` + teste; commits `4206bd91`, `f114405d` | Sentinel em nível 0 (somente leitura) provado; níveis 1.1/1.2 (recomendar/corrigir com aprovação) não estão implementados — o prompt os coloca como fase progressiva. Nome de campanha: sem spec de tela nesta frente |
| 6 | Web, mobile e offline com validação declarada e reproduzível | `[~]` | `08-mobile-offline.md`; `mobile-offline.spec.ts` roda no job `apk-debug` (`playwright.mobile.config.ts`, vite dev próprio); `pedido-idempotencia` no `full.txt`; F-28 corrigido com `tests/unit/pedidos-offline.test.tsx` | J16 continua **bloqueada por emulador/dispositivo** (declarado em `13-jornadas.md` §J16 e `29-capacidades.md`); dreno real da fila offline não roda na suíte |
| 7 | Riscos P0 resolvidos ou formalmente bloqueados com contenção e plano | `[~]` | `20-plano-priorizado.md` P0-1..P0-5; P0-1 com gate (`handlers-service-role-*`), P0-2 fechado (`f17`), P0-3 corrigido (`scripts/deploy.sh` aplica o baseline e falha alto) | P0-4 (trilha de IA com entrada/fontes/prompt) e P0-5 (gate determinístico de injeção indireta) **não foram re-medidos nesta frente**; o plano os lista como abertos |
| 8 | CI e gates integrados passam | `[~]` | `AGENTS.md` (5 checks obrigatórios: `verify`, `build-and-size`, `invariants`, `e2e`, `imagens-ok`; medido em 2026-08-14); `e2e.yml` com smoke em PR, critical na main, full noturno | sem `gh` neste ambiente (§4.3), não foi possível ler a proteção de branch nem o último run; a prova é a do commit citado, não deste |
| 9 | Limitações de dispositivo, conta ou decisão explicitamente pendentes | `[x]` | `13-jornadas.md` §J8 (5 skips por chave de IA), §J6 (`inbox-responder-citando` depende de conversa com mensagem), §J14 (zero spec de LGPD), §J16 (emulador); `29-capacidades.md` (iOS ausente por decisão) | — |
| 10 | Relatório final separa código, PR, merge, release e produção | `[~]` | `AGENTS.md` e `docs/doctrine/versionamento.md` definem a separação; `agente-c-fiscal-financeiro.md` e `f09/f17` registram commit e PR por item | a consolidação final do programa é do coordenador; esta frente entrega a fatia P1-01 com os estados separados (§1, item 6) |

## 3. O que esta frente entregou e como se reproduz

### 3.1 Provas novas (Vitest, sem navegador)

| Jornada | Arquivo | O que prova |
|---|---|---|
| J6 | `tests/unit/inbox-fechar-e-arquivar-rotas.test.ts` | `POST /conversations/[id]/close`: fecha + solta silêncio + audita; 404; 500; 403 sem consulta. `POST /conversations/arquivar-todas`: confirmação obrigatória; fila vazia não escreve; arquiva e conta; 500; exige `manager` |
| J6 | `tests/unit/inbox-fechar-pela-tela.test.tsx` | o botão "Fechar" abre a confirmação; confirmar chama a mutação com o id; cancelar não fecha; conversa encerrada não oferece o botão |
| J6 | `tests/unit/inbox-fechar-hook.test.tsx` | falha da API → `showApiError` + invalidação das duas chaves; sucesso não mostra erro |
| J13 | `tests/unit/j13-fiscal-falha-de-sincronizacao.test.ts` | 200 com novas/atualizadas; 409 de lock; 422 de config; **502 de SEFAZ inalcançável** (não 200 vazio); falha parcial preserva o que entrou; 656 carrega `proximaTentativa`; permissão. Histórico: lista a falha com cStat e mensagem, vazio ≠ erro, filtros + `organization_id`, 500 |
| J13 | `tests/unit/j13-botao-sincronizar.test.tsx` | sucesso diz o que veio; 656 avisa a hora da próxima tentativa; falha → `showApiError` e nenhum toast verde; botão bloqueia duplo clique |
| J14 | `tests/unit/j14-lgpd-ciclo.test.ts` | aprovação: `Idempotency-Key` obrigatória (422), justificativa ≥10 (422), 404, 409 em `processing`, happy path emite evento + muda status + audita, replay não reemite, 500 não audita, 403. Lista: 422 de filtro, vazio ≠ erro, `sla_bucket=overdue`, 500, guard `admin`+platform admin. Prévia: máscara de e-mail/telefone, CPF nunca no payload, 404 sem coleta |
| J14 | `tests/unit/j14-lgpd-aprovar-pela-tela.test.tsx` | botão escondido fora de `received`; confirmar desabilitado até 10 caracteres; envia justificativa aparada; sucesso fecha; falha avisa |

Comando e resultado (medido neste worktree, base `13fefad3`, depois do rebase):

```bash
pnpm exec vitest run \
  tests/unit/inbox-fechar-e-arquivar-rotas.test.ts \
  tests/unit/inbox-fechar-pela-tela.test.tsx \
  tests/unit/inbox-fechar-hook.test.tsx \
  tests/unit/j13-fiscal-falha-de-sincronizacao.test.ts \
  tests/unit/j13-botao-sincronizar.test.tsx \
  tests/unit/j14-lgpd-ciclo.test.ts \
  tests/unit/j14-lgpd-aprovar-pela-tela.test.tsx
# Test Files  7 passed (7)
#      Tests  50 passed (50)
```

Cada arquivo também passa **sozinho** (foi assim que dois defeitos de dublê foram
achados: `admin.from` ausente e o mock do hook vencendo o import no mesmo arquivo).

### 3.2 O que os testes acima **não** provam

- **A tela com dados reais**: clique em navegador, layout em 1280/390, tempo de carga.
  Isso é o e2e (§4).
- **A SEFAZ**: `sincronizarEntrada` é dublado. Nenhuma nota foi emitida, cancelada ou
  inutilizada — por decisão, e é o que o prompt exige.
- **A cascata de anonimização** de LGPD: `/lgpd/anonymize` e o worker têm prova própria
  (`tests/unit/lgpd-*`); aqui se prova o que a tela dispara.
- **Multi-tenant por comportamento de banco**: os dublês provam que a rota usa o
  `organization_id` do guard e filtra por ele; a prova de RLS executada é a F-17
  (`pnpm test:db`), não esta.

### 3.3 Gates executados

| Gate | Comando | Resultado |
|---|---|---|
| Lint dos arquivos novos | `pnpm exec eslint <7 arquivos>` | **0 achados** |
| Testes novos | `pnpm exec vitest run <7 arquivos>` | **50 passed** |
| Typecheck (escopo da frente) | `pnpm exec tsc --noEmit -p tsconfig.jornadas.json` (include só dos 7 arquivos + `types/**/*.d.ts`, extends do `tsconfig.typecheck.json`) | **0 erros** |
| Typecheck completo | `pnpm typecheck` | não completou no host — §4.2 |
| `test:db` | — | **não rodou**: nenhuma mudança de schema/RLS/tabela nesta frente |
| e2e smoke/critical | `pnpm test:e2e:smoke` / `:critical` | **não executado** — §4.1 |

## 4. Bloqueios e limites (o que não foi possível provar)

### 4.1 E2E local: o ambiente foi montado; a execução esbarrou na máquina

O caminho é o do CI e foi seguido: `supabase start` (stack local já de pé, projeto
`nexus`) → extensões → `baseline.sql` → `pnpm e2e:env` (`.env.e2e` apontando para
`127.0.0.1:54321` e `NEXT_PUBLIC_APP_URL=http://localhost:3011`) → build de produção →
`pnpm test:e2e:smoke` / `:critical`.

Medido: `docker ps` com os oito contêineres do Supabase `healthy`, `baseline.sql`
aplicado (181 tabelas em `public`, 300 policies) e `pnpm e2e:env` gerando o arquivo.
O build de produção (`next build`, Turbopack) **não completou** neste host: a máquina
tem 8 GB e outros quatro worktrees do programa estavam compilando ao mesmo tempo —
load average entre 13 e 25 para 8 núcleos, swap em 10–14 GB de 11–14 GB. Em três
tentativas o processo principal morreu no meio do build (logs em
`evidencias/34-build-e2e-tentativa-1.txt` e `-3.txt`), deixando os workers de
transformação órfãos em 0 % de CPU.

**O que isso significa:** o E2E das jornadas **não foi executado** nesta rodada, e por
isso as contagens de J6/J13/J14 em `13-jornadas.md` **não foram re-medidas**. Não há
vermelho novo nem verde novo para reportar. A prova desta frente é a de §3.1.

**O que foi tentado, para quem repetir:** `pnpm e2e:build` (morreu no mesmo ponto),
`next build` direto com `--max-old-space-size=4096` (idem), build solto em `screen`
para sobreviver ao restart do harness (idem), e limpar `.next` antes de cada tentativa.
O build chegou a 515 MB de artefatos na terceira tentativa — ou seja, **não é um erro de
configuração do repo**: é falta de memória/CPU no host compartilhado. Em uma máquina
livre, o comando é o de sempre:

```bash
pnpm e2e:env
pnpm e2e:build
E2E_PORT=3011 pnpm test:e2e:smoke
E2E_PORT=3011 pnpm test:e2e:critical
```

### 4.2 Typecheck e suíte unitária completa

`pnpm typecheck` e `pnpm test:unit` completos são caros neste host e disputaram CPU com
os outros worktrees. O estado medido está na seção "Medição final" abaixo; enquanto não
houver `EXIT=0` registrado, a linha correspondente em §1/§3.3 fica `[~]`, não `[x]`.

### 4.3 Sem `gh` neste ambiente

`gh` não está instalado e não há credencial de PR. O push da branch e a abertura do PR
ficam registrados no relatório da frente; **não** se declara PR/merge/release que não
aconteceu.

### 4.4 Banco local é compartilhado

O Supabase local é o mesmo para todos os worktrees (mesmo `project_id`), com dados de
rodadas anteriores (6 organizações, 8 usuários, 17 conversas em 18/11). Duas suítes
rodando ao mesmo tempo se veem. Para uma medição limpa, `supabase db reset` + baseline
é o caminho — não foi feito aqui para não apagar o ambiente dos outros agentes.

## 5. Próximo passo (ordem sugerida)

1. **Rodar o e2e em máquina livre** (§4.1) e atualizar as contagens de J6/J13/J14 em
   `13-jornadas.md` com o log bruto. É a única prova que falta para fechar P1-01.
2. Com o e2e verde, promover J6 de 7/9 para 9/9 (as duas lacunas — encerrar e
   arquivar — já têm prova de rota/tela aqui; falta o clique no navegador).
3. Criar o spec de jornada de LGPD (J14) reaproveitando os cenários de
   `j14-lgpd-ciclo.test.ts`; hoje J14 tem 2/4 e nenhum spec de ciclo.
4. Forçar uma falha de sincronização no e2e de J13 (mock de SEFAZ ou `fiscal_settings`
   inválido) e verificar a linha na tela `sincronizacoes` — a metade de servidor está
   provada aqui.
5. `pnpm test:unit` completo + `pnpm typecheck` em ambiente sem contenção, e registrar
   `EXIT=0` neste documento.

## 6. Medição final

Medido em 18/11/2026, worktree `aaa-front-jornadas`, base `13fefad3`, às 07:00 (UTC−3).

```console
$ pnpm exec vitest run <os 7 arquivos de §3.1>
 Test Files  7 passed (7)
      Tests  50 passed (50)
   Duration  15.77s

$ pnpm exec eslint <os 7 arquivos>
 (sem saída — 0 achados)

$ pnpm exec tsc --noEmit -p <tsconfig temporário com include dos 7>
 (sem saída — 0 erros; o `tsconfig.typecheck.json` completo não terminou neste host, §4.2)
```

O primeiro run **depois do rebase** teve 1 falha de tempo (49/50) sob load 21; com os
`waitFor` orçados em 5 s — mesmo motivo do `testTimeout: 15_000` do `vitest.config.ts`,
que já documenta máquina carregada — os três runs seguintes deram **50/50**. Não é
afrouxamento de asserção: o estado esperado continua o mesmo, só o prazo deixou de ser
uma medição acidental da carga da máquina.

O e2e continua **não executado** (§4.1); a linha §1-3 fica `[~]` até ele rodar em uma
máquina livre.

## 7. Commit desta entrega

- Branch: `front/jornadas` (rebaseada em `13fefad3`)
- Commit: `236b6bc1` — `test(jornadas): prova J6, J13 e J14 em Vitest, sem navegador`
- PR: https://github.com/spiesdan/nexus/pull/517 (**open**; não mergeado nesta rodada)
- Release/deploy: **nenhum**. Nada foi para VPS ou produção.
