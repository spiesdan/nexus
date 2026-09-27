#!/usr/bin/env bash
# NEXUS 2.0 — deploy canônico (§80). VPS NUNCA builda (§69/§82).
# Uso: NEXUS_IMAGE=ghcr.io/<dono>/deskcommcrm:<tag> ./scripts/deploy.sh
set -euo pipefail

# Fonte única do kit (IMG_NS/IMG_APP/IMG_WORKER/IMG_SCHEDULER, dc() com o
# override do proxy). Roda do diretório do projeto — o mesmo do .env —, onde
# o kit existe; sem ele, parar com a frase, não seguir sem a fonte.
# shellcheck source=hostgator-setup-kit/_common.sh
. hostgator-setup-kit/_common.sh || {
  echo "não achei hostgator-setup-kit/_common.sh — rode a partir do diretório do projeto (o mesmo onde está o .env)"
  exit 1
}

: "${NEXUS_IMAGE:?NEXUS_IMAGE é obrigatória (ex.: ${IMG_APP}:nexus-v2)}"
COMPOSE="${COMPOSE_FILES:-$COMPOSE}"

# As três imagens saem da MESMA tag: o CI publica as três juntas
# (publish-image.yml, matrix de três) e o compose lê APP_IMAGE/WORKER_IMAGE/
# SCHEDULER_IMAGE. Exportadas AQUI, elas valem mais que o --env-file — é isso
# que faz a troca acontecer; NEXUS_IMAGE sozinho é ignorado pelo compose.
NEXUS_TAG="${NEXUS_IMAGE##*:}"
[ "$NEXUS_TAG" != "$NEXUS_IMAGE" ] || { echo "NEXUS_IMAGE precisa de tag (…:<tag>) — canal móvel não é deploy."; exit 1; }
export APP_IMAGE="$NEXUS_IMAGE"
export WORKER_IMAGE="${IMG_WORKER}:${NEXUS_TAG}"
export SCHEDULER_IMAGE="${IMG_SCHEDULER}:${NEXUS_TAG}"

echo "[nexus] 1/7 validando ambiente..."
command -v docker >/dev/null || { echo "docker ausente"; exit 1; }
docker compose version >/dev/null || { echo "compose plugin ausente"; exit 1; }
test -f .env || { echo ".env ausente"; exit 1; }

echo "[nexus] 2/7 autenticando registry..."
echo "${GHCR_TOKEN:-}" | docker login ghcr.io -u "${GHCR_USER:-oauth}" --password-stdin 2>/dev/null || true

echo "[nexus] 3/7 puxando as três imagens (tag ${NEXUS_TAG})..."
dc --env-file .env pull app worker scheduler

echo "[nexus] 4/7 validando configuração..."
dc --env-file .env config >/dev/null

echo "[nexus] 5/7 executando migrations seguras..."
# Migrations são aditivas primeiro (§81); o provisionamento aplica baseline idempotente.
dc --env-file .env run --rm app pnpm db:migrate || true

echo "[nexus] 6/7 subindo containers..."
dc --env-file .env up -d app worker scheduler

echo "[nexus] 7/7 health check..."
# O probe é DE DENTRO do contêiner (wait_app_healthy, do kit — já sourced):
# o app não publica porta no host (só o Caddy publica 80/443, doctrine de
# packaging), então um curl em 127.0.0.1:3000 morre "connection refused"
# em toda instalação SAUDÁVEL — medido na VPS crm.billhigiene.tech antes
# de confiar neste passo. Um critério, um lugar: o mesmo probe do kit.
if corpo="$(wait_app_healthy 30 5)"; then
  echo "[nexus] healthy: $corpo"
  # Grava o pin no .env (a mesma razão do `gravar_imagens` do update.sh:
  # uma escolha precisa sobreviver ao processo que a fez). Sem esta linha o
  # deploy só existe enquanto este script vive: qualquer `up -d` rodado à mão
  # re-resolve as três serviços pelo .env e volta para o pin antigo do
  # install. Medido no incidente de 2026-09-27: o .env ainda dizia 1.14.0
  # enquanto os containers rodavam nexus-v2, e o rollback do agente usou
  # esse pin para desfazer o deploy. O pull é explícito acima (etapa 3), então
  # a tag republicada chega mesmo com pull_policy=missing — mesma conta do
  # update.sh (docs/doctrine/packaging.md, invariante 5).
  gravar_imagens .env "$NEXUS_TAG"
  dc --env-file .env ps
  exit 0
fi
echo "[nexus] health FALHOU — execute rollback trocando NEXUS_IMAGE (§78, sem rebuild)."
exit 1
