# 31 — Relatório de progresso do programa NEXUS AAA

> Atualizado a cada marco. A fila é [`30-fila-nexus-aaa.md`](30-fila-nexus-aaa.md);
> aqui fica o que mudou, com commit, PR e evidência. **Código ≠ PR ≠ merge ≠ release ≠ deploy.**

## Rodada 1 — 18/11/2026

### Baseline

| Campo | Valor |
|---|---|
| Repositório | `spiesdan/nexus` |
| Branch do programa | `programa/nexus-aaa` |
| Base | `nexus/main` @ `126f4bb3` (prompt mestre novo, PR #478) |
| Versão publicada | `v1.55.0` |
| Working tree | limpo antes das frentes; cada frente em worktree próprio |
| Ambiente | macOS, Node 22.20.0, pnpm 9.15.9, Docker 29.8.2 |

### O que entrou na `main`

| PR | Commit | O que resolve | Evidência |
|---|---|---|---|
| #478 | `126f4bb3` | Prompt mestre NEXUS AAA (18/11) na `main`; programa parte dele | CI 5/5 verde; branch rebaseada sem conflito |
| #451 | `7385b9ad` | F-09-B com catraca: cadeia de migrations é histórico, `db push` proibido | CI 5/5 verde antes do merge |

### O que está em PR (código, não merge)

| PR | Branch | O que resolve | Estado |
|---|---|---|---|
| #480 | `fix/aaa-p0-financeiro` | P0-04: teto do recebível sob concorrência (trigger 0314) + MANIFEST sem `db push` | CI rodando; `test:db` local 160 arquivos/1497 testes verdes |
| #453 | `fix/aaa-f17-39-tabelas` | P0-02: prova comportamental de isolamento em 39 tabelas (dívida 73→34) | Rebaseado em `126f4bb3`; CI rodando |
| #464 | `p1-indices-mensagens` | P1-06: índice 0313 da janela de mensagens | Rebaseado; baseline corrigido (o rebase anterior o mutilou); CI rodando |

### Achados novos desta rodada

1. **P0-04 — teto do recebível furado sob concorrência.** `registrarPagamento`
   lia a soma antes do INSERT; o unique parcial só cobre a mesma
   `Idempotency-Key`. Dois recebimentos simultâneos com chaves diferentes
   somavam acima do valor original. Correção em #480: trigger `BEFORE` com
   `for update` + `AFTER` recalculando status na mesma transação. Teste de
   corrida com duas conexões reais.
2. **P0-05 — duas notas vivas para o mesmo pedido.** A trava "um pedido, uma
   nota viva" em `lib/fiscal/emitir-nota.ts` é SELECT seguido de INSERT. Dois
   cliques/retry concorrentes podem criar duas notas com dois jobs — duas
   transmissões à SEFAZ. Correção em `fix/aaa-p0-nota-viva` (0315): advisory
   lock por organização+pedido no INSERT de `invoices` e `invoice_orders`.
   Sem índice único global para não derrubar update de instalação com duplicata
   histórica; o Sentinel detectará as antigas.
3. **MANIFEST mandava `db push`.** O README da pasta já proibia, mas a seção
   "Reproducibility" do `MANIFEST.md` instruía reaplicar a cadeia via
   `supabase db push`, contra F-09=B. Corrigido em #480 e coberto pelo gate
   `cadeia-de-migrations-nao-e-instalacao.test.ts`.
4. **AGENTS.md com contagem envelhecida.** Diz "89 de 169 handlers" usam service
   role; medido: **244** handlers citam admin client em **418** handlers de
   `app/api`. A fila registra a correção (P2-04) para não repetir número sem
   comando.

### Evidências por comando

```text
# P0-04 (worktree aaa-financeiro, branch fix/aaa-p0-financeiro)
pnpm test:db          -> 160 arquivos, 1497 testes verdes, 1 expected fail, 1 skipped
pnpm typecheck        -> 0 erros (NODE_OPTIONS=--max-old-space-size=8192)
eslint (arquivos)     -> 0 erros
deploy-aplica-schema  -> 10/10 casos

# Rebase do #464 (worktree aaa-pr464)
git diff nexus/main...HEAD -> 4 arquivos, +48/-0 (sem remoção de 0312)
```

### Limitações e bloqueios

- **Produção não foi tocada**: nenhum deploy, migration remota, NF-e, pagamento
  ou escrita em serviço externo.
- **`e2e` e `test:db` em CI** são a prova de integração; os testes locais desta
  rodada rodaram no worktree, não no commit mergeado.
- **F-17** segue com 34 tabelas sem prova até o #453 mergear.
- **Sentinel** e **banco/segurança** seguem nas frentes `front/sentinel` e
  `front/db-seguranca`; esta rodada não editou os arquivos delas.
- **Sentinel usa 0313** no worktree dele; a `main` passará a ter 0313 (#464).
  A frente precisa renumerar para 0316+ ao rebasear — registrado aqui para não
  haver duas migrations com a mesma versão.

## Rodada 2 — 18/11/2026 (integração e P0 fiscal)

### Mergeado na `main`

| PR | Commit | O que resolve |
|---|---|---|
| #453 | `e29ecf51` | F-17: prova comportamental em 39 tabelas do débito |
| #464 | `f3ea10d6` | Índice 0313 da janela de mensagens (rebase corrigiu o baseline mutilado; sem perda de 0312) |
| #466 | `f56c0228` | Rate limit em MFA e código de recuperação |
| #475 | `470aac4e` | `29-capacidades.md`, runbook de operação e gate D3 |

### Em PR

| PR | Commit | O que resolve | Evidência local |
|---|---|---|---|
| #480 | `ffca9711` | P0-04: teto do recebível sob concorrência (0314) + MANIFEST sem `db push` | `test:db` 160/1497 verde; update do baseline exit 0 |
| #482 | `cbfe15f2` | P0-02: 34 tabelas restantes de F-17; débito 34→**0** | 67 testes novos; completude 152 verdes |
| #484 | `5f460276` | P0-05: uma nota viva por pedido (0315) | `test:db` 160/1497 verde |

### Números de migration — estado e reserva

| Versão | Arquivo | Estado |
|---|---|---|
| 0313 | `indice_janela_de_mensagens` | **na main** (#464) |
| 0314 | `saldo_do_recebivel` | PR #480 |
| 0315 | `nota_viva_por_pedido` | PR #484 |
| 0316+ | livres | **Sentinel deve renumerar 0313→0316** ao rebasear; a 0313 já é da main |

### O que essa rodada não prova

- **Nada foi deployado.** PR mergeado ≠ release ≠ produção.
- O `test:db` local do #484 rodou antes do rebase em `470aac4e`; o job `invariants` do CI prova o commit rebaseado.
- A duplicata fiscal histórica (se existir) **não** é apagada por #484 — a trava fecha as novas; o Sentinel é quem detecta as antigas.
- F-17 prova **leitura** cross-tenant; escrita continua coberta pelos testes de policy/rota de cada módulo.

## Rodada 3 — 18/11/2026 (decisões + frentes)

### Decisões do dono executadas

| Decisão | Entrega | Estado |
|---|---|---|
| **D-01/D-02** nome de campanha | #498: gerador puro (1/2–4/5+, dedupe case-insensitive, pt-BR, teto 80 em palavra), `nome_manual` (0318), wizard com "Voltar ao nome automático", API/persistência | PR |
| **D-03** idempotência fiscal | #499: reivindicação forte, replay com `Idempotency-Replayed`, 409 de payload, 0317 (`request_hash` text) | PR |

### Frentes novas (worktrees isolados)

| Frente | Branch | Escopo | Não toca |
|---|---|---|---|
| E — módulos/jornadas | `front/modulos` | 5.4, 5.6, 5.8 (UI), 5.10/5.11 | tokens/design, schema/migrations |
| F — mobile/offline | `front/mobile` | PWA/Capacitor, fila/retry/conflito | regra de negócio do servidor; promessa de dispositivo |
| D — design | `front/design-tinta` | tokens, contraste, a11y, shell | lógica fiscal/financeira/autorização |
| C — fiscal | `front/fiscal` | cancelamento×drain, importação, recuperação, conciliação | idempotência (helper do Coordenador) |
| A — MCP/backup | `f17/papel-e-volume` | guarda no handler, backup/restore | schema sem coordenação |
| G — Sentinel | `front/sentinel` | v1.1 recomendações | escrita fiscal/financeira |

**Dono de schema:** Coordenador. Reservas: 0317 (D-03) e 0318 (D-01/D-02). D/E/F não criam migration; pedem com requisito e aceite.

### #490

O `verify` vermelho era instrumento: o teste `contato-audit-from-to` usava um fake de Supabase com `.eq` não encadeável, e o handler passou a filtrar `id` + `organization_id`. Fake corrigido, CI verde, **mergeado** (`ac0d5e12`).

## Rodada 4 — 18/11/2026 (merge das decisões)

| Item | Commit | Evidência |
|---|---|---|
| **D-03** idempotência fiscal (#499) | `3141a483` | 9 testes de helper/rota; 434 invariantes; CI 14/14 |
| **D-01/D-02** nome de campanha (#498) | `5a499313` | 11 testes do gerador/decisão + 2 de schema; install+update combinados (0317+0318) exit 0 |
| **P2-04** AGENTS.md | #506 | número trocado pelo instrumento `inventario-service-role.mjs`; gates nomeados |
| **P3-03** planos | #506 | 7 planos sem `db push`; gate reprova plano ativo; histórico preservado |

Conflito previsto e resolvido no #498: o baseline e o MANIFEST receberam **os dois** apêndices (0317 e 0318), sem renumerar — a numeração não colidiu. O update sobre banco com 0317 já aplicado rodou com `ON_ERROR_STOP=1` e exit 0.

A fila P0 está **fechada em código**. O que resta são P1/P2/P3 nas frentes C/D/E/F/G/A ou dependentes de dispositivo.


## Rodada 5 — 18/11/2026 (fim da decisão D-03)

- **#511** (`97132fb8`): as retransmissões de inutilização e de carta de correção também honram `Idempotency-Key`. Replay devolve a resposta original; outro evento com a mesma chave é 409; falha aborta a chave. Sem schema novo.
- **P0-08 fechado** em todas as rotas fiscais com efeito externo: emissão, inutilização e as duas retransmissões.
- **#503** (E, inbox) mergeado: reenvio de mensagem falha. P1-01 avança em J6.
- P2-04/P3-03 na `main` (`9107b42b`); AGENTS.md mede, planos não ensinam `db push`.

## Rodada 6 — 18/11/2026 (main `13fefad3`)

| Merge | O que entrou |
|---|---|
| #503 | E: reenvio de mensagem falha no inbox (J6) |
| #507 | E: módulos restantes — estado vazio/erro honesto |
| #508 | C: recebíveis da NF-e |
| #509 | C: claims fiscais de manifestação/cancelamento (migration **0319**) |
| #510 | E: amostra de faturamento não parece o período inteiro |
| #511 | D-03 nas retransmissões (inutilização + CC-e) |
| #513 | C: relatório D1/D3/D4 |
| #514 | F: sincronizador offline montado, retomada/retry, anti-duplo-toque, backup APK sem PII |

**#498 (D-01/D-02) está mergeado** em `5a499313` — não sumiu; o conteúdo (`lib/prospeccao/nome-da-campanha.ts` e a migration 0318) está na `main`.

**P0 em código: fechado.** P1 avança em J6 (E), fiscal (C) e mobile (F); P2-04/P3-03 na main. Próxima migration livre: **0320**.


## Rodada 7 — 18/11/2026 (main `014ccef3`)

- **#512** (E, `fcac5757`): a grade de notas declara o teto de 200 em vez de esconder nota antiga.
- **#471** (P1-9, `014ccef3`): flywheel não paga duas vezes pelo mesmo turno — `not exists` no lote + advisory lock por turno, com unlock no `finally` (o `release` do pool não fecha a conexão; lock esquecido ficaria preso).
- **#498** segue mergeado (`5a499313`) e o conteúdo na main; não foi fechado.
- P0 de código fechado; P1 avança em J6/fiscal/mobile; PRs antigos `dirty` serão triados com os donos.

## Rodada 8 — 18/11/2026 (integração, triagem e pacote de release)

### Regra de operação nova

O dono fixou **2 workers + 1 coordenador** simultâneos (a máquina chegou a load
153). Ativos: **D (design)** e **G (Sentinel)**. A, E, F e H ficam **pausados**
com ponto de retomada escrito na fila (§0). O coordenador não abre trabalho novo
nessas frentes — só integra o que já estava em PR.

### Mergeado na `main`

| PR | Commit | O que resolve |
|---|---|---|
| #515 | `099df0a7` | catálogo do estoque/compras deixa de esconder produto (P1-06) |
| #519 | `850996a7` | admin: falha de leitura não vira "Nenhum…" nas 5 listas |
| #517 | `22450d60` | J6/J13/J14 provadas em Vitest, sem navegador (P1-01) |
| #522 | `232c5fbf` | ficha do Agente E fechada |
| #455 | `532f3bc3` | dependabot: 48 updates minor/patch |
| #163/#164/#166 | `94f575f3` | actions do `apk.yml` na versão atual |

### Rebase + renumeração (não é merge ainda)

- **#439** — telefone fixo → E.164. O PR criava a migration **0312**, que a main
  já usa para a trilha de IA; renumerada para **0320** (`20261122150000`), com o
  apêndice do baseline concatenado depois de 0319 (antes da varredura anon, porque
  a migration **cria função**). Invariante próprio preservado.
- **#476** (fontes locais), **#477** (MIT), **#457/#465/#472** (docs), **#468**
  (baselines visuais): rebase sobre `014ccef3`+, descartando só o hunk do prompt
  mestre antigo — o #478 substituiu aquele arquivo, então atualizar as tabelas
  dele não tem alvo.

### Triagem

24 PRs avaliados; 3 fechados com motivo (#7, #168, #169), #307 bloqueado por
decisão de marca, #518/#520/#521 esperam a retomada de A. Detalhe por PR em
[`30-fila-nexus-aaa.md`](30-fila-nexus-aaa.md) §11.

### Pacote de release

[`35-pacote-de-release.md`](35-pacote-de-release.md): **1.56.0** derivada por
`pnpm release:conferir` (19 fragmentos, nenhum `exige_acao`), inventário de
schema 0313–0320, checklist de corte e plano de deploy assinado. **Nenhuma tag,
nenhuma imagem publicada por este programa, nenhum deploy.**

### O que esta rodada não prova

- O `test:db` não rodou nesta máquina nesta rodada (limite de recurso); a prova
  de instalação/update do baseline com a **0320** é o job `invariants` do CI do
  #439.
- `e2e` continua cobrindo smoke em PR — os baselines visuais (#468) rodam local.
- Nenhuma frente pausada avançou; pausa não é conclusão.


## Rodada 10 — 18/11/2026 (integração final, release empacotada e delegação)

### Regra de operação

**3 workers + 1 coordenador.** Slots: **D** (design), **F** (mobile, credencial de
dispositivo) e **G** (Sentinel v1.1 e provas). O coordenador não executa trabalho
de worker: mantém a fila, diz quem pega o quê, integra e roda os gates.

### Mergeado na `main`

| PR | O que entrou |
|---|---|
| #523/#524/#525/#529/#531 | design/a11y: shell sem link morto, foco visível, densidade, borda de campo ≥3:1 |
| #534 | mobile: a segunda página reabre o banco local (fix do dono) |
| #518 | **0320**: 42 definers ganham `pg_temp` no `search_path` |
| #520 | rate limit: fallback declarado e saúde 503 em produção |
| #521 | listas com tie-breaker e teto (P1-06) |
| #528 | **0321**: Sentinel v1.1 — plano revisável, estoque divergente, lead duplicado |
| #536 | invariante do flywheel deixa de medir o relógio (flake provado) |
| #472/#465/#468/#477/#476 | docs de auditoria, snapshots visuais, MIT, fontes locais |
| #13/#165 | dependabot: `actions/cache@v6`, `actions/checkout@v7` |
| #530 | docs do programa, catraca de numeração, teto do `verify` 15→25 min |

### Release

**PR #537** corta a **1.56.0** (28 fragmentos, nenhum `exige_acao`, recorte final sobre `139a1be5`). **Não
mergeado**: o merge é a aprovação humana e é ele que faz o CI criar a tag.
`#439` (0323) entrou antes do corte; **`#526` (0322)** fica para a próxima.

### O que restou aberto

`#439` (CI), `#457` (CI pós-rebase), `#533`/`#535` (D), `#526` (F, 0322),
`#538` (G), `#307` (`[!]` marca) e `#537` (release, aguardando o dono).

## Marco — fila de PRs zerada (18/11/2026, `8e65b527`)

Pela primeira vez no programa, **nenhum PR aberto** de rodada anterior: os 24 PRs
que estavam na triagem foram mergeados, fechados com motivo ou separados em PR
novo. Os três últimos a sair foram #307 (decisão de marca — `"By nexus"` no
DANFE não entra; a parte configurável virou #545), #165 (`actions/checkout@v7`)
e #13 (`actions/cache@v6`).

**Quantos entraram desde o início do programa** — contado pelos merges, não
estimado:

```bash
git log --merges 126f4bb3..nexus/main --format='%s' | grep -c 'Merge pull request #'
# 93
git log --merges 126f4bb3..nexus/main | wc -l
# 114   (93 PRs + 21 merges de sincronização sem PR)
```

Ou seja: **93 PRs** mergeados em **114 merge commits** desde `126f4bb3`
(baseline do prompt mestre, #478). O tag `v1.56.0` saiu dentro dessa janela, pelo
workflow `release` (#548).

O que ainda está aberto é só trabalho novo: o PR desta fila (#556) e o que os
três workers abrirem. Fila zerada não é programa concluído — é a primeira vez que
a dívida de triagem não tem item.

## Rodada 13 — quadro do DoD vivo (18/11/2026, `4c7cd633`)

O quadro completo fica em [`33-relatorio-rodada.md`](33-relatorio-rodada.md) §7 e
passa a ser **relido a cada rodada**. Resumo do estado:

| Fechado | Parcial | Decisão |
|---|---|---|
| fichas 5.4/5.6/5.8/5.10-5.11 · B-7 (dreno + 401) · `update.sh` fail-loud · Sentinel v1.4 · `endereco_com_lixo` · **1.58.0 com tag `v1.58.0`** | outbox do inbox web (D) · J6/J13/J14 no navegador (F) · painel de rejeição por fornecedor (G) · matriz das 3 specs fora do CI (F) · a11y além das 10 telas (D) | **iOS encerrado por decisão do dono** (conta Apple, aparelho, assinatura de 7 dias, distribuição por instalação, PWA) |

**Produção:** 1.57.0 saudável · 1.58.0 tagueada e **deploy aprovado**, em curso pelo
dono. O pareamento do catálogo só acontece depois desse deploy e de `--dry-run`
aprovado.


## Fila por worker (mantida a cada rodada)

A fila viva é [`39-fila-por-worker.md`](39-fila-por-worker.md):

```
D — agora: outbox do inbox web · próximo: pedidos com paginação declarada · depois: subtelas de expedição
F — agora: J6/J13/J14 no navegador · próximo: matriz das 3 specs fora do CI · depois: regressão local da 1.58.0
G — agora: painel de rejeição por fornecedor · próximo: proposta do 2º caso reversível · depois: retenção/LGPD provada
```
