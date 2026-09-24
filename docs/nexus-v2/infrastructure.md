# NEXUS 2.0 — Infrastructure (deploy, CI, Docker, GHCR)

> Alvo §69–§84: VPS **nunca** builda; `git push → Actions → GHCR → pull → migrate → up → health`; deploy normal ≤5min (1–3min cache quente, medido em `docs/infrastructure/deploy-performance.md`).

## 1. Docker (atual — manter + lapidar)

| Artefato | Estado |
|---|---|
| `Dockerfile` | multi-stage `deps/build/runner`, `node:22-alpine`, `output:standalone`, `server.js`, `USER nextjs`, `ffmpeg`, `ARG APP_VERSION` ✅ |
| `Dockerfile.worker` | single-stage + `COPY .` + `tsx workers/agent-worker/main.ts` `:8787` → **REFACTOR p/ multi-stage+prune (Fase 4)** |
| `Dockerfile.scheduler` | `alpine:3.20`+curl+tzdata, `entrypoint.sh`, `HEALTHCHECK pgrep crond` ✅ |
| `.dockerignore` | bloqueia `node_modules,.next,.git,.env*,tests,*.log,docs` ✅ |
| `Caddyfile` | ACME, gzip, `waha→403`, `agentrun→timeout 320s`, resto `app:3000` ✅ |
| `docker-compose.prod.yml` | `image:${APP_IMAGE:-ghcr.io/spiesdan/deskcommcrm:stable}` `pull:always`, rede `internal`, só `caddy:80/443`, `mem_limit`, `max-size 10m` ✅ |
| `build.yml` / `oracle.yml` / `traefik.yml` | override build local / ARM sem waha / proxy externo ✅ |

Cache: `cache-from/type=gha` + `cache-to/type=gha,mode=max` no `publish-image.yml`. BuildKit multi-stage. Runtime enxuto.

## 2. CI (atual → alvo)

| Workflow | Hoje | Alvo NEXUS |
|---|---|---|
| `ci.yml` (verify+invariants) | typecheck+lint+`lint:channels`+unit+shell+db; cache pnpm ✅; **sem concurrency/paths** | + `concurrency: nexus-ci-${{ref}} cancel:true` + `paths` por domínio |
| `perf.yml` | build+size ✅ | manter |
| `e2e.yml` | concurrency ✅; sem paths; 74/76 specs (2 fora: `vps-fresh-onboarding`, `inbox-tempo-real`) | + path filtering (pedidos→pedidos, inbox→whatsapp…) |
| `publish-image.yml` | GHCR 3 imagens amd64, metadata, cache GHA, smoke-boot, stable via imagetools ✅; push via PAT (pacotes presos ao fork) | revincular pacotes a `nexus`, voltar a `GITHUB_TOKEN` |
| `release.yml` | tag+digest check ✅ | manter |
| `relogio.yml` | tick 5min, desligado default ✅ | manter |

CI rápido: `pnpm install --frozen-lockfile` + `typecheck` + `lint` + `test:unit` (30s–2min).

## 3. Health / rollback / segredos

- `GET /api/v1/health` existe (supabase+redis+waha 3s, `version`, `200/503`). Compose usa TCP probe no app **de propósito** (evita Caddy nunca subir se WAHA/Redis caem) + `worker :8787/healthz` + `redis ping` + `pgrep crond`.
- Rollback = trocar imagem (`v1.4.3→v1.4.2`, sem rebuild). Hoje: `agent.sh PREV_IMAGE` + `trio_publicado stable` + pin por número + `backup/restore.sh`. Falta `scripts/deploy.sh` canônico (`set -euo pipefail`: valida env → auth registry → pull → valida config → migrate segura → up → health → versão → rollback).
- Segredos só runtime (ver `security.md`).

## 4. Ações FASE 1 (infra)

1. Criar `scripts/deploy.sh` canônico sobre `hostgator-setup-kit/`.
2. `ci.yml`: +concurrency +paths. `e2e.yml`: +paths por domínio.
3. `Dockerfile.worker`: multi-stage.
4. Medir e registrar `docs/infrastructure/deploy-performance.md`.
5. `docker-compose.prod.yml`: remover `build:` fallback do worker/scheduler (só `image:`).
