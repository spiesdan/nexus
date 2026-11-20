# 53 — Regressão `critical` da 1.61.1

> **Data:** 20/11/2026 · **Tag:** `v1.61.1` (`476c07f8`) · **Build:** produção
> local (`node .next/standalone`) · **Banco:** Supabase local `127.0.0.1:54321`.
> **Nada em produção foi tocado.**

## 1. Contagem

| Execução | Resultado |
|---|---|
| Invocação única da suíte (a do coordenador) | **70 passed · 6 failed · 2 skipped · 4 não rodaram** (exit 1) |
| Mesma suíte em **3 partes**, seed antes de cada e saída fora de `test-results` | **30 + 28 + 22 = 80 passed · 0 failed · 2 skipped** |

As 6 falhas da invocação única **não se reproduzem** com o mesmo build quando o
estado de MFA/artefatos é isolado. Nenhuma é `produto`; nenhuma é `ambiente`
(no sentido de provider externo). São **`teste`**: harness/seed/artefato. A
tabela abaixo usa o log da invocação única e a prova da reexecução.

## 2. Triagem — uma linha por falha

| Spec | Erro exato (1 linha) | Classificação | Prova |
|---|---|---|---|
| `compras-do-rascunho-ao-estoque` | `browserContext.close: ENOENT ... test-results/.playwright-artifacts-0/traces/...recording19.trace` | **teste** — o diretório de artefatos foi apagado durante a suíte | isolado: **1 passed (16,2 s)** |
| `conversa-vira-lead` (timeline) | `browserContext.close: ENOENT ... recording8.network` | **teste** — mesmo artefato apagado | isolado: **3 passed (15,9 s)** |
| `credenciais-de-ia` | `locator input[aria-label="Dígito 1"]` resolvido `disabled`; clique esperou 5 min | **teste** — seed no meio da suíte rotaciona o fator TOTP e o campo fica desabilitado; não é provider (a chave é inválida de propósito) | seed + isolado: **1 passed (5,9 s)** |
| `jornada-expedicao` | mesmo `input[aria-label="Dígito 1"]` desabilitado | **teste** — MFA rotacionado pelo seed, não produto | isolado: **1 passed (10,9 s)** |
| `jornada-fiscal` | mesmo `Dígito 1` desabilitado; `Test timeout of 300000ms` no clique | **teste** — MFA rotacionado; a jornada em si passou | isolado: **1 passed (1,4 min)** |
| `navegacao` (2 casos: Conhecimento e canal oficial) | mesmo `Dígito 1` desabilitado; `Test timeout 120000ms` | **teste** — MFA rotacionado; os 15 casos da spec passam com seed | parte 2: **15/15, 0 failed** |
| `risk-radar` (assumir demanda) | `[data-testid="radar-item"]` com "Demanda E2E em risco" não encontrado (5 s) | **teste** — fixture da demanda não estava no estado esperado (seed/ordem), não a tela | parte 3: **2/2, 0 failed** |

**Nenhum `produto`.** Nenhum bug de tela/rota foi aberto porque as mesmas
asserções passam no mesmo build com o estado isolado.

## 3. Os 4 que não rodaram

A invocação única parou depois de `risk-radar`; os quatro últimos da
`critical.txt` não chegaram a rodar:

| # | Spec | Motivo | Prova |
|---|---|---|---|
| 1 | `sentinel-painel` | a execução foi encerrada antes (exit 1 após risk-radar) | parte 3: passou |
| 2 | `smoke` | idem | parte 3: passou |
| 3 | `vps-webhook-outbound-ssrf` | idem | parte 3: passou |
| 4 | `webhooks` | idem | parte 3: passou |

Parte 3 fechou **22 passed · 0 failed**. Não houve timeout de worker: a suíte
foi interrompida no ponto das falhas de MFA/artefato.

## 4. O que corrigir no harness (não é produto)

1. `tests/e2e/helpers/login-admin.ts`: quando `input[aria-label="Dígito 1"]`
   continua `disabled` depois da espera, **retornar `false`** (re-semear) em vez
   de tentar clicar por 5 min. É a diferença entre “falhou em 5 s e re-semeou” e
   “a suíte inteira parou num timeout”.
2. Rodar o `critical` com `--output` fora de `test-results` (ou não apagar esse
   diretório durante a execução): os dois `ENOENT` de trace não são teste.
3. Seed **antes de cada parte** (12/11/12 specs) no run local; é o que mantém o
   fator TOTP estável e foi como a suíte fechou 80/0/2.

**A regressão da 1.61.1, medida com o estado isolado, é 80 passed · 0 failed ·
2 skipped.** A invocação única não é verde por defeito de harness — e isso está
acima, não escondido.


## 5. Depois do conserto do harness (#701)

- **Suíte inteira, uma invocação:** **80 passed · 0 failed · 2 skipped em
  14,7 min** (antes: 26,4 min e 8 falhas de infraestrutura).
- `login-admin` agora detecta `Dígito 1` **disabled** em 6 s, avisa e re-semeia;
  a segunda falha diz “continuou disabled mesmo depois de re-semear”.
- `test-e2e-suite.ts` grava trace/network em diretório único de `tmpdir()`
  (`--output`), fora de `test-results`; o `browserContext.close` não recebe mais
  `ENOENT`.
- Os 5 min do `jornada-fiscal` e os timeouts de `navegacao` eram o clique no
  campo disabled; o ganho de **11,7 min** aparece no relógio.

A invocação única **passou a ser verde** com o harness corrigido; a tabela da
seção 2 permanece como o registro do que aconteceu antes.
