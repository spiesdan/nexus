#!/usr/bin/env bash
# Deploy por COMMIT numa instalação que NÃO alcança o GHCR.
#
#   scripts/deploy-build-local.sh <sha-da-main>
#
# ═══ ISTO É EXCEÇÃO, NÃO CAMINHO PARALELO ═══
#
# A doutrina de packaging (§69/§82) diz que a VPS **nunca** constrói: o CI
# publica e a instalação puxa — `scripts/deploy.sh` é o caminho canônico, e
# `hostgator-setup-kit/update.sh` é o de quem opera. Este script existe para a
# instalação que **não tem credencial do GHCR** (registro privado, instalação
# sem token): lá o `pull` não acontece, e a única forma de subir um commit é
# construir na máquina. Foi escrito para a VPS de `crm.billhigiene.tech`, onde
# rodava como `/root/deploy-nexus.sh` — fora do git, o que é exatamente o
# problema que ele mesmo corrige: conhecimento que só existe no disco de uma
# máquina some quando ela é reconstruída.
#
# O caminho de saída é dar credencial ao registro e voltar ao `deploy.sh`. Até
# lá, este script é o que impede que o deploy seja um `up -d` improvisado.
#
# ═══ POR QUE ELE É CUIDADOSO ═══
#
# Em 24/10/2026 o build das seis imagens, com a stack no ar, levou uma VPS de
# 8 GB sem swap ao OOM: **11 processos mortos pelo kernel**, entre eles
# `supabase_realtime` (17 restarts) e `supabase_analytics`. O `docker ps`
# continuava mostrando tudo `healthy` — o dano era o Inbox parando de receber
# evento em tempo real durante o build. Daí:
#
#   - `COMPOSE_PARALLEL_LIMIT=1`: um serviço por vez. Em paralelo, dois
#     `next build`/`tsc` pedem ~2-3 GB cada.
#   - piso de memória ANTES de construir: abortar no começo é mais barato que
#     descobrir no meio, com metade das imagens prontas.
#   - `.env` restaurado se qualquer passo falhar: o script grava as tags novas
#     ANTES do build (o build etiqueta pelo `image:` do compose), e sem o
#     rollback um build quebrado deixaria o `.env` apontando para uma imagem
#     que não existe — o próximo `up -d`, mesmo à mão, falharia.
#   - health que NÃO fecha faz o script sair com erro: a versão anterior seguia
#     adiante e terminava com rc 0, ou seja, dizia "deploy ok" com serviço fora.
set -euo pipefail

if [ "$#" -lt 1 ] || [ -z "$1" ]; then
  echo "uso: scripts/deploy-build-local.sh <sha-da-main>" >&2
  exit 64
fi
SHA="$1"
cd "${NEXUS_DIR:-$(pwd)}"

# Pré-condições, na ordem em que o operador consegue consertar: diretório do
# projeto, repositório, .env. Descobrir isso no meio do build custa caro.
git rev-parse --git-dir >/dev/null 2>&1 || {
  echo "ERRO: $(pwd) não é um repositório git — rode do diretório da instalação (o mesmo do .env)." >&2
  exit 1
}
test -f .env || { echo "ERRO: .env ausente em $(pwd)" >&2; exit 1; }
test -f docker-compose.build.yml || {
  echo "ERRO: docker-compose.build.yml ausente — este script depende do override que fixa pull_policy: never." >&2
  exit 1
}

TAG="local-${SHA:0:9}"
BASE="${NEXUS_BACKUP_DIR:-/root}"
BACKUP_DIR="${BASE}/backups"
LOG="${BASE}/deploy-${TAG}-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$BACKUP_DIR"

REMOTE="${NEXUS_REMOTE:-$(git remote | head -1 || true)}"
SERVICOS=(app worker scheduler ocr mercos fiscal)
COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.build.yml --env-file .env)

say() { printf '\n=== %s ===\n' "$*"; }
# Devolve o id do contêiner do serviço, ou vazio. Nunca falha: um serviço que
# ainda não existe é um estado esperado no primeiro deploy, não um erro de shell.
container_de() { "${COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -1 || true; }

exec > >(tee -a "$LOG") 2>&1

# Rollback do `.env`: só depois que ele é gravado (passo 0), e só em falha.
ENV_BACKUP=""
restaurar_env() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
    # `cmp` antes de copiar: sem isso o rollback anuncia "restaurado" mesmo
    # quando o passo que falhou não chegou a tocar no .env — mentira barata que
    # ensina o operador a ignorar a mensagem.
    if ! cmp -s "$ENV_BACKUP" .env; then
      cp -a "$ENV_BACKUP" .env
      printf '\n[rollback] .env restaurado de %s\n' "$ENV_BACKUP" >&2
    fi
  fi
  exit "$rc"
}
trap restaurar_env EXIT

say "deploy $SHA (tag $TAG) — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "log: $LOG"

say "0. backup do .env e do estado atual"
ENV_BACKUP="$BACKUP_DIR/env-antes-${TAG}-$(date +%Y%m%d-%H%M%S)"
cp -a .env "$ENV_BACKUP"
git rev-parse HEAD | tee "$BACKUP_DIR/rev-antes-${TAG}-$(date +%Y%m%d-%H%M%S)"

# `git checkout -f` apaga alteração local sem perguntar. Numa instalação viva
# pode haver hotfix de plantão — recusar é mais barato que perder.
if [ "${NEXUS_FORCE:-0}" != "1" ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERRO: há alteração não commitada em $(pwd)." >&2
  git status --short --untracked-files=no >&2
  echo "commite, guarde com 'git stash', ou rode com NEXUS_FORCE=1 para descartar." >&2
  exit 1
fi

say "1. checkout do commit"
[ -n "$REMOTE" ] || { echo "ERRO: nenhum remote git configurado" >&2; exit 1; }
git fetch "$REMOTE" main
git checkout -f "$SHA"
git log --oneline -1

say "2. tags de imagem no .env"
sed -i \
  -e "s|^APP_IMAGE=.*|APP_IMAGE=nexus:${TAG}|" \
  -e "s|^OCR_IMAGE=.*|OCR_IMAGE=nexus-ocr:${TAG}|" \
  -e "s|^WORKER_IMAGE=.*|WORKER_IMAGE=nexus-worker:${TAG}|" \
  -e "s|^SCHEDULER_IMAGE=.*|SCHEDULER_IMAGE=nexus-scheduler:${TAG}|" \
  -e "s|^MERCOS_IMAGE=.*|MERCOS_IMAGE=nexus-mercos:${TAG}|" \
  -e "s|^FISCAL_IMAGE=.*|FISCAL_IMAGE=nexus-fiscal-sidecar:${TAG}|" \
  .env
grep -E "^(APP|OCR|WORKER|SCHEDULER|MERCOS|FISCAL)_IMAGE=" .env

say "3. piso de memória e build local das 6 imagens"
if [ ! -r /proc/meminfo ]; then
  echo "ERRO: /proc/meminfo ausente — este script roda no Linux da instalação, não na máquina de desenvolvimento." >&2
  exit 1
fi
MEM_DISPONIVEL_MB=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo)
echo "memória disponível: ${MEM_DISPONIVEL_MB} MB · swap: ${SWAP_MB} MB"
if [ "$MEM_DISPONIVEL_MB" -lt 1200 ] && [ "$SWAP_MB" -lt 2048 ]; then
  echo "ERRO: sem memória nem swap para construir. Libere memória ou crie swap antes." >&2
  echo "(4 GB de swapfile com vm.swappiness=10 foi o que resolveu em 24/10/2026)" >&2
  exit 1
fi
COMPOSE_PARALLEL_LIMIT=1 "${COMPOSE[@]}" build "${SERVICOS[@]}"

say "4. up -d (prod + override de build)"
# O `docker-compose.traefik.yml` NÃO entra por padrão: ele declara a rede
# `traefik` como externa, e numa instalação servida pelo `caddy` do próprio
# compose o comando aborta ANTES de subir nada — "network traefik declared as
# external, but could not be found", medido em 24/10/2026. Quem tem Traefik
# externo passa NEXUS_TRAEFIK=1.
if [ "${NEXUS_TRAEFIK:-0}" = "1" ]; then
  COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.build.yml -f docker-compose.traefik.yml --env-file .env)
fi
"${COMPOSE[@]}" up -d "${SERVICOS[@]}"

say "5. health dos 6 serviços (até 8 min)"
PENDENTES=1
for i in $(seq 1 48); do
  PENDENTES=0
  for s in "${SERVICOS[@]}"; do
    id="$(container_de "$s")"
    if [ -z "$id" ]; then
      printf '  %-10s ausente\n' "$s"
      PENDENTES=$((PENDENTES + 1))
      continue
    fi
    h="$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')"
    printf '  %-10s %s\n' "$s" "$h"
    case "$h" in
      healthy | running) ;;
      *) PENDENTES=$((PENDENTES + 1)) ;;
    esac
  done
  printf '[%02d/48] pendentes=%d\n' "$i" "$PENDENTES"
  [ "$PENDENTES" -eq 0 ] && break
  sleep 10
done
if [ "$PENDENTES" -ne 0 ]; then
  echo "ERRO: health não fechou em 8 min. Nada foi dado como pronto." >&2
  echo "rollback: cp -a $ENV_BACKUP .env && docker compose -f docker-compose.prod.yml --env-file .env up -d ${SERVICOS[*]}" >&2
  exit 1
fi

say "6. o app responde de verdade?"
# Probe DE DENTRO do contêiner: o app não publica porta no host (só o proxy
# publica), então um curl em 127.0.0.1:3000 a partir da VPS morre
# "connection refused" em instalação SAUDÁVEL.
docker exec "$(container_de app)" node -e '
const url = "http://127.0.0.1:3000/api/v1/health";
fetch(url)
  .then(async (r) => { console.log("HTTP", r.status); console.log((await r.text()).slice(0, 400)); process.exit(r.ok ? 0 : 1); })
  .catch((e) => { console.log("health FALHOU", e.message); process.exit(1); });
'

say "7. imagem que está rodando bate com o commit?"
for s in "${SERVICOS[@]}"; do
  printf '%-20s %s\n' "$s" "$(docker inspect "$(container_de "$s")" --format '{{.Config.Image}}')"
done
git log --oneline -1

say "fim — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
