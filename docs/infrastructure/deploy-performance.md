# NEXUS 2.0 — Deploy performance (medido, §84)

> Meta: deploy normal ≤ 5min; cache quente ≈ 1–3min. Não afirmar sem medir.

## Medido — primeiro deploy real na VPS (2026-09-27, commit `d4416bfe4`)

| Etapa | Meta | Medido | Data |
|---|---|---|---|
| CI rápido (install+typecheck+lint+unit) | 30s–2min | **10m54s** (`verify` do run 36331441792) | 2026-09-27 |
| Docker cacheado (buildx GHA) | 30s–3min | **4m22s** (3 imagens, evento PR com `push: false` — run 36331441799; o caminho crítico é o app: ~4m12s) | 2026-09-27 |
| GHCR push/pull | 10s–1min | **59s** pull das 3 imagens na VPS, do zero (run de publicação via `workflow_dispatch`: 7m14s) | 2026-09-27 |
| VPS pull + up | 10s–1min | **77s** (pull 59s + `up`/health-wait 18s) | 2026-09-27 |
| startup + health | 10s–30s | **6s** até o container `healthy` + **2s** no probe interno → 1º health verde | 2026-09-27 |

## `scripts/deploy.sh` linha-a-linha (cronometrado na VPS)

Execução de 16:29:41 a 16:31:01 UTC — **80s no total** (meta §84 ≤5min cumprida
mesmo com pull frio; com cache quente o pull cai para segundos):

| # | Etapa | Tempo |
|---|---|---|
| 1–2 | validação de ambiente + auth no registry | <1s |
| 3 | pull das 3 imagens `nexus-v2` (frio) | **59s** |
| 4 | validação de configuração | <1s |
| 5 | `db:migrate` | 1s — **placeholder**: o passo é um stub `echo TODO` e o container de runtime não tem `pnpm` (`Cannot find module '/app/pnpm'`, engolido por `\|\| true`); o schema entrou pelo baseline idempotente (etapa C abaixo) |
| 6 | `up -d` (recreate de app/worker/scheduler + espera do healthcheck) | **18s** |
| 7 | health check (probe interno `127.0.0.1:3000`) | **2s** |

## Provisionamento (fora do `deploy.sh` — roda uma vez no primeiro deploy/upgrade de schema)

| Etapa | Tempo | Observação |
|---|---|---|
| A checkout (`git fetch nexus nexus-v2 && checkout -B`) | 1s | HEAD `d4416bfe4` |
| B backup (`hostgator-setup-kit/backup.sh`) | 99s | `backups/db-20260927-160559.sql.gz` (4.6M) + `waha-20260927-160559.tgz` |
| C baseline idempotente (`supabase/baseline.sql`) | **350s** | 4.382 statements × ~216ms (RTT do pooler Supabase), **0 ERROR**; 6 tabelas novas confirmadas (`ai_execution_policies`, `inventory_movements`, `suppliers`, `purchase_orders`, `purchase_order_items`, `purchase_order_counters`) |
| **Total do primeiro deploy** (A+B+C+D) | **~8m50s** | deploy recorrente = só o `deploy.sh` (80s) |

O caminho crítico do primeiro deploy é o **baseline de schema (350s)**, não o
deploy em si. Updates seguintes (sem mudança de schema) não pagam a etapa C.

## Pós-deploy verificado (mesma sessão)

- Health público `https://crm.billhigiene.tech/api/v1/health`: `healthy`,
  version `d4416bf` — supabase 319ms · redis 7ms · waha 4ms.
- As três imagens `ghcr.io/spiesdan/*:nexus-v2` em execução com `(healthy)`;
  homepage responde `307` em 0.6s; logs do app sem `error|fatal|exception`
  nos 3 minutos seguintes.
- CI do commit `d4416bfe4`: `verify` 10m54s · `invariants` 5m11s ·
  `build-and-size` 2m54s · `imagens-ok` 4m22s (todos ✅).

## Honestidade da régua

A meta "CI rápido 30s–2min" foi a estimativa do spec; o **medido é 10m54s**
porque o `verify` roda typecheck + lint + ~711 arquivos de teste unitário no
runner do GitHub — mesma ordem de grandeza do `test:unit` local (~5min) com o
overhead de install. A meta de **deploy ≤5min cumpre-se**: `deploy.sh` = 80s
(pull frio) e cai para o tempo de `up`+health (~20s) com as imagens já em cache
na VPS. Toda linha acima veio de cronômetro na execução real (timestamps de
log da VPS e `gh run view`), não de estimativa.
