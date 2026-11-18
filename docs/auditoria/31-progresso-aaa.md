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
