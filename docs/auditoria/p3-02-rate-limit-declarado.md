# P3-02 — o fallback do rate limit deixou de ser silencioso

> Medido em 18/11/2026. Evidência: `tests/unit/rate-limit-fallback-declarado.test.ts`
> (7 casos) e o código de `lib/ai/dispatcher/rate-limit.ts` /
> `app/api/v1/health/route.ts`.

## 1. O estado anterior

`lib/env.ts` já exige `UPSTASH_REDIS_REST_URL`/`_TOKEN` **em produção**: sem
elas o app não sobe (Zod lança no import). O buraco que sobrava era outro e mais
comum que a falta total:

- Redis **configurado e inalcançável** (contêiner parado, MISCONF, rede) → o
  contador cai para um `Map` do processo;
- o único sinal era **um `warn`**, uma vez por processo, no meio do log;
- com duas réplicas, o teto efetivo **dobra** — e o operador segue acreditando
  num limite compartilhado.

`docs/threat-model.md` T2 registrava exatamente isso ("degrada silenciosamente
para memória").

## 2. A escolha: declarar no log e na saúde — não derrubar no boot

Duas saídas eram possíveis:

**(a) falhar no boot** quando o Redis não responde. Rejeitada: uma queda
transitória do Redis viraria **indisponibilidade total do CRM** (login, inbox,
tudo), que é pior que o modo degradado. O app não tem como distinguir "Redis caiu
por 30 s" de "Redis nunca vai voltar" no boot.

**(b) declarar o modo e deixar a saúde falhar alto em produção.** Escolhida:

- a transição vira **estado consultável** (`rateLimitBackend()`): `backend`,
  `motivo`, `desde`;
- o log da transição é `error` em produção (não `warn`), com a consequência
  escrita, e sai **uma vez por transição** — voltar a compartilhar também é
  registrado;
- `/api/v1/health` ganha o check **`rate_limit`**, que sonda o **mesmo caminho do
  produto** (`checkRateLimit`) e não um `PING`: existe estado parcial conhecido
  (MISCONF recusa escrita e atende leitura) em que o PING passa e o contador já
  está na memória — foi o que derrubou o teto por conta na issue #185;
- **em produção**, memória = `down` → health responde **503** (o monitor/kit já
  olha essa rota). Em **dev/teste**, é `degraded` → **200**: `pnpm dev` sem Redis
  continua subindo, que é o requisito explícito.

## 3. O que foi tocado

| Arquivo | Mudança |
|---|---|
| `lib/ai/dispatcher/rate-limit.ts` | estado do fallback (`rateLimitBackend`), classificação por ambiente (`statusDeSaudeDoRateLimit`), log de transição (error em prod / warn em dev), retorno ao modo compartilhado |
| `app/api/v1/health/route.ts` | check `rate_limit` (sonda `checkRateLimit`), campo `backend`, motivo `fallback_em_memoria`, entra no veredito global (503) |
| `tests/unit/rate-limit-fallback-declarado.test.ts` | classificação por ambiente, contador em memória (conta/barra/não vaza entre buckets), `peek` sem incrementar, estado nomeado com data, fiação da rota |
| `docs/threat-model.md` | T2 atualizado: mitigado com superfície de saúde |

## 4. Comportamento por ambiente

| Situação | produção | dev/teste |
|---|---|---|
| Redis ok | `ok` / 200 | `ok` / 200 |
| Redis inalcançável | **`down` / 503** | `degraded` / 200 |
| `UPSTASH_*` ausente | não sobe (env) | memória, `degraded` / 200 |

## 5. Limites declarados

- O check de saúde **não** mede o dano por réplica; ele diz que o modo é
  memória. Quantas réplicas existem é topologia, não saúde.
- `rateLimitBackend()` reflete a **última** transição observada no processo; um
  processo recém-iniciado reporta `redis` até a primeira chamada que falhe. A
  sonda de saúde força uma chamada, então a rota sempre mede o estado atual.
- Um 503 de saúde **não derruba** o app; quem decide escalar é o monitor/operador.

## 6. Reproduzir

```bash
npx vitest run tests/unit/rate-limit-fallback-declarado.test.ts
```
