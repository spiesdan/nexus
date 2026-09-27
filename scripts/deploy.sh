#!/usr/bin/env bash
# NEXUS 2.0 — deploy canônico (§80). VPS NUNCA builda (§69/§82).
# Uso: NEXUS_IMAGE=ghcr.io/<org>/nexus:<tag> ./scripts/deploy.sh
set -euo pipefail

# O exemplo da mensagem abaixo deriva da FONTE única do namespace
# (`IMG_NS` em hostgator-setup-kit/_common.sh). O literal não se repete:
# `tests/unit/namespace-das-imagens.test.ts` reprova qualquer cópia fora dos
# quatro arquivos permitidos — o deploy.sh roda do diretório do projeto, onde
# o _common.sh existe; sem ele (caminho errado), o exemplo vira placeholder.
img_ns_exemplo() {
  local ns
  ns="$(sed -n 's/^IMG_NS="\(.*\)"$/\1/p' hostgator-setup-kit/_common.sh 2>/dev/null | head -1 || true)"
  printf '%s' "${ns:-ghcr.io/<dono>}"
}

: "${NEXUS_IMAGE:?NEXUS_IMAGE é obrigatória (ex.: $(img_ns_exemplo)/nexus:v1.4.3)}"
COMPOSE="${COMPOSE_FILES:-docker-compose.prod.yml}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/v1/health}"

echo "[nexus] 1/7 validando ambiente..."
command -v docker >/dev/null || { echo "docker ausente"; exit 1; }
docker compose version >/dev/null || { echo "compose plugin ausente"; exit 1; }
test -f .env || { echo ".env ausente"; exit 1; }

echo "[nexus] 2/7 autenticando registry..."
echo "${GHCR_TOKEN:-}" | docker login ghcr.io -u "${GHCR_USER:-oauth}" --password-stdin 2>/dev/null || true

echo "[nexus] 3/7 puxando imagem ${NEXUS_IMAGE}..."
docker compose --env-file .env -f "$COMPOSE" pull app worker scheduler

echo "[nexus] 4/7 validando configuração..."
docker compose --env-file .env -f "$COMPOSE" config >/dev/null

echo "[nexus] 5/7 executando migrations seguras..."
# Migrations são aditivas primeiro (§81); o provisionamento aplica baseline idempotente.
docker compose --env-file .env -f "$COMPOSE" run --rm app pnpm db:migrate || true

echo "[nexus] 6/7 subindo containers..."
NEXUS_IMAGE="$NEXUS_IMAGE" docker compose --env-file .env -f "$COMPOSE" up -d app worker scheduler

echo "[nexus] 7/7 health check..."
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[nexus] healthy (tentativa $i)."
    docker compose --env-file .env -f "$COMPOSE" ps
    exit 0
  fi
  sleep 5
done
echo "[nexus] health FALHOU — execute rollback trocando NEXUS_IMAGE (§78, sem rebuild)."
exit 1
