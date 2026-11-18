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
