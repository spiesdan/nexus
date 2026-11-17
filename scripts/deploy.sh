#!/usr/bin/env bash
# NEXUS 2.0 — deploy canônico (§80). VPS NUNCA builda (§69/§82).
# Uso: NEXUS_IMAGE=ghcr.io/<dono>/nexus:<tag> ./scripts/deploy.sh
set -euo pipefail

# Fonte única do kit (IMG_NS/IMG_APP/IMG_WORKER/IMG_SCHEDULER, dc() com o
# override do proxy). Roda do diretório do projeto — o mesmo do .env —, onde
# o kit existe; sem ele, parar com a frase, não seguir sem a fonte.
# shellcheck source=hostgator-setup-kit/_common.sh
. hostgator-setup-kit/_common.sh || {
  echo "não achei hostgator-setup-kit/_common.sh — rode a partir do diretório do projeto (o mesmo onde está o .env)"
  exit 1
}

# Carrega o .env (inclui SUPABASE_DB_URL/SUPABASE_DB_ADMIN_URL). Sem isto o
# passo de schema não tem conexão: as variáveis só existiam para o compose,
# via `--env-file`, e não no ambiente deste shell.
enter_project

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

echo "[nexus] 1/8 validando ambiente..."
command -v docker >/dev/null || { echo "docker ausente"; exit 1; }
docker compose version >/dev/null || { echo "compose plugin ausente"; exit 1; }
test -f .env || { echo ".env ausente"; exit 1; }

echo "[nexus] 2/8 autenticando registry..."
echo "${GHCR_TOKEN:-}" | docker login ghcr.io -u "${GHCR_USER:-oauth}" --password-stdin 2>/dev/null || true

echo "[nexus] 3/8 puxando as três imagens (tag ${NEXUS_TAG})..."
dc --env-file .env pull app worker scheduler

echo "[nexus] 4/8 validando configuração..."
dc --env-file .env config >/dev/null

echo "[nexus] 5/8 schema: aplicando o baseline (idempotente) e verificando antes do app subir"
# POR QUE O DEPLOY APLICA O SCHEMA (e por que não é `pnpm db:migrate`)
#
# Até 2026-11 este passo não aplicava nada, com três razões medidas — e duas
# delas continuam válidas:
#
#   1. o placeholder que existia (`echo TODO … && exit 0`) saía com SUCESSO sem
#      aplicar nada — e o `|| true` aqui engolia até o erro de verdade;
#   2. a imagem de runtime não tem `pnpm` (`Cannot find module '/app/pnpm'`,
#      docs/infrastructure/deploy-performance.md): `pnpm db:migrate` dentro do
#      contêiner falhava SEMPRE;
#   3. a cadeia de 292 migrations não reproduz o schema (10 stubs `SELECT 1;`;
#      docs/auditoria/12-migrations-e-rls.md) — `supabase db push` seria pior,
#      porque marcaria migrations como aplicadas sobre schema parcial.
#
# A consequência de não fazer nada era pior que as três: um deploy que sobe a
# imagem nova contra um banco sem o objeto novo responde 500 na primeira tela
# que toca a coluna/tabela — e a mensagem não aponta para o schema. O caminho
# real é o do kit: `supabase/baseline.sql` (idempotente, re-aplicável sobre
# banco com dados), pelo `psql_run` da conexão de schema, exatamente como
# `update.sh` faz. É o MESMO arquivo que o `install.sh` aplica; não há caminho
# paralelo.
if [ -f supabase/baseline.sql ]; then
  # Extensões que o schema exige (idempotente; iguais ao install.sh/update.sh).
  psql_run -c \
    "create extension if not exists vector with schema public; create extension if not exists citext with schema public; create extension if not exists pg_trgm with schema public;" \
    >/dev/null 2>&1 || true

  raw="$(cat supabase/baseline.sql | psql_run -f - 2>&1 || true)"
  # Erros benignos ao re-aplicar sobre base existente.
  benign='already exists|multiple primary keys|multiple default values|is already a member|already a partition'
  unexpected="$(printf '%s\n' "$raw" | grep -iE 'ERROR|FATAL' | grep -viE "$benign" || true)"
  if [ -n "$unexpected" ]; then
    printf '%s\n' "$unexpected" | head -20
    echo "[nexus] schema FALHOU — NÃO subi containers novos. Corrija a conexão/credencial e rode de novo."
    exit 1
  fi

  # PROVA de que o schema está lá, com objetos que o app usa na primeira tela.
  # Não é contagem de migration: é o schema que responde.
  faltando="$(psql_run -tA -c "
    select string_agg(nome, ',')
      from (values ('organizations'),('messages'),('conversations'),('contacts'),
                   ('commercial_orders'),('financial_receivables'),('llm_calls')) v(nome)
     where to_regclass('public.' || nome) is null;
  " 2>/dev/null | tr -d ' ' || true)"
  if [ -z "$faltando" ]; then
    echo "[nexus] ✓ schema presente (baseline aplicado)"
  else
    echo "[nexus] schema INCOMPLETO — faltam: $faltando. Não subo o app sobre banco sem schema."
    exit 1
  fi
else
  echo "[nexus] sem supabase/baseline.sql no diretório — não há como garantir o schema; pare aqui."
  exit 1
fi

echo "[nexus] 6/8 subindo containers..."
dc --env-file .env up -d app worker scheduler

echo "[nexus] 7/8 health check..."
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
