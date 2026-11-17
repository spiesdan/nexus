#!/usr/bin/env bash
# Prova do passo de SCHEMA do `scripts/deploy.sh` — o P0 em que o deploy subia
# a imagem nova sobre um banco sem o objeto novo.
#
# Nada aqui toca máquina ou banco de verdade: `_common.sh`, `docker` e o
# `psql_run` são dublês num diretório descartável. O que se mede é a DECISÃO do
# script:
#
#   1. o baseline é aplicado ANTES de `up -d` (ordem, não só presença);
#   2. erro de schema que NÃO é o ruído benigno de re-aplicação derruba o
#      deploy ANTES de subir container;
#   3. baseline aplicado mas objeto essencial ausente também derruba;
#   4. sem `supabase/baseline.sql` o deploy para em vez de fingir schema;
#   5. caminho feliz: aplica, verifica e sobe.
#
#   bash tests/shell/deploy-aplica-schema.test.sh
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$RAIZ/scripts/deploy.sh"
FALHAS=0

ok()   { printf '✓ %s\n' "$1"; }
ruim() { printf '✗ %s\n' "$1"; FALHAS=$((FALHAS+1)); }
espera() { # espera <descrição> <condição já avaliada como string "ok">
  if [ "$2" = "ok" ]; then ok "$1"; else ruim "$1"; fi
}

# ── cenário: <nome> <resposta_do_baseline> <objetos_faltando> <tem_baseline> ──
monta() {
  local nome="$1" resposta="$2" faltando="$3" tem_baseline="$4"
  local dir="$TMP/$nome"
  mkdir -p "$dir/scripts" "$dir/hostgator-setup-kit" "$dir/supabase" "$dir/bin"
  cp "$DEPLOY" "$dir/scripts/deploy.sh"
  [ "$tem_baseline" = "sim" ] && echo "-- baseline de teste" > "$dir/supabase/baseline.sql"
  printf 'SUPABASE_DB_URL=postgres://duble/db\n' > "$dir/.env"

  cat > "$dir/hostgator-setup-kit/_common.sh" <<'STUB'
COMPOSE="docker-compose.prod.yml"
IMG_APP="ghcr.io/exemplo/nexus"
IMG_WORKER="ghcr.io/exemplo/nexus-worker"
IMG_SCHEDULER="ghcr.io/exemplo/nexus-scheduler"
LOG="$PWD/dublê.log"
echo "SOURCE" >> "$LOG"
enter_project() { :; }
dc() { echo "dc $*" >> "$LOG"; return 0; }
wait_app_healthy() { echo '{"status":"ok"}'; return 0; }
gravar_imagens() { echo "pin $*" >> "$LOG"; }
psql_run() {
  echo "psql $*" >> "$LOG"
  local tem_arquivo=0 tem_c=0
  for a in "$@"; do
    if [ "$a" = "-f" ]; then tem_arquivo=1; fi
    if [ "$a" = "-c" ]; then tem_c=1; fi
  done
  if [ "$tem_arquivo" = 1 ]; then
    cat >/dev/null
    printf '%s\n' "${RESPOSTA_BASELINE:-}"
    return 0
  fi
  if [ "$tem_c" = 1 ]; then
    printf '%s' "${FALTANDO:-}"
  fi
  return 0
}
STUB

  cat > "$dir/bin/docker" <<'STUB'
#!/usr/bin/env bash
if [ "${1:-}" = "compose" ] && [ "${2:-}" = "version" ]; then exit 0; fi
if [ "${1:-}" = "login" ]; then cat >/dev/null; exit 0; fi
echo "docker $*" >> "$PWD/dublê.log"
exit 0
STUB
  chmod +x "$dir/bin/docker"
  echo "$dir"
}

roda() { # roda <dir>
  ( cd "$1" && \
    RESPOSTA_BASELINE="${RESPOSTA_BASELINE:-}" FALTANDO="${FALTANDO:-}" \
    PATH="$1/bin:$PATH" NEXUS_IMAGE="ghcr.io/exemplo/nexus:v9.9.9" GHCR_TOKEN="" \
    bash scripts/deploy.sh 2>&1 )
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/deploy-schema.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ── 1. caminho feliz: aplica, verifica e sobe ────────────────────────────────
d="$(monta feliz "" "" sim)"
saida="$(roda "$d")"; rc=$?
espera "caminho feliz sai 0" "$([ "$rc" = 0 ] && echo ok || echo nao)"
log="$d/dublê.log"
espera "baseline vai por psql_run (não por pnpm)" \
  "$(grep -q 'psql .*-f' "$log" && ! grep -q 'pnpm db:migrate' "$log" && echo ok || echo nao)"
linha_psql="$(grep -n 'psql .*-f' "$log" | head -1 | cut -d: -f1)"
linha_up="$(grep -n 'dc .*up -d' "$log" | head -1 | cut -d: -f1)"
espera "schema aplicado ANTES de subir container" \
  "$([ -n "$linha_psql" ] && [ -n "$linha_up" ] && [ "$linha_psql" -lt "$linha_up" ] && echo ok || echo nao)"
espera "diz que o schema está presente" \
  "$(printf '%s' "$saida" | grep -q 'schema presente' && echo ok || echo nao)"

# ── 2. erro real de schema: não sobe container ──────────────────────────────
d="$(monta erro 'psql: error: permission denied for schema public' '' sim)"
RESPOSTA_BASELINE='psql: error: permission denied for schema public' roda "$d" >/dev/null 2>&1
# A função roda em subshell; refaz com variáveis exportadas para checar o log.
( cd "$d" && RESPOSTA_BASELINE='psql: error: permission denied for schema public' \
  FALTANDO='' PATH="$d/bin:$PATH" NEXUS_IMAGE="ghcr.io/exemplo/nexus:v9.9.9" \
  bash scripts/deploy.sh >/dev/null 2>&1 )
rc=$?
espera "erro de schema derruba o deploy (exit != 0)" "$([ "$rc" != 0 ] && echo ok || echo nao)"
espera "container NÃO sobe com schema quebrado" \
  "$(grep -q 'up -d' "$d/dublê.log" && echo nao || echo ok)"

# ── 3. baseline "aplicou" mas falta objeto essencial ────────────────────────
d="$(monta incompleto '' 'messages,contacts' sim)"
( cd "$d" && RESPOSTA_BASELINE='' FALTANDO='messages,contacts' \
  PATH="$d/bin:$PATH" NEXUS_IMAGE="ghcr.io/exemplo/nexus:v9.9.9" \
  bash scripts/deploy.sh >/dev/null 2>&1 )
rc=$?
espera "schema incompleto derruba o deploy" "$([ "$rc" != 0 ] && echo ok || echo nao)"
espera "container NÃO sobe com schema incompleto" \
  "$(grep -q 'up -d' "$d/dublê.log" && echo nao || echo ok)"

# ── 4. sem baseline o deploy para em vez de fingir ──────────────────────────
d="$(monta sem-baseline '' '' nao)"
( cd "$d" && PATH="$d/bin:$PATH" NEXUS_IMAGE="ghcr.io/exemplo/nexus:v9.9.9" \
  bash scripts/deploy.sh >/dev/null 2>&1 )
rc=$?
espera "sem baseline.sql, deploy para" "$([ "$rc" != 0 ] && echo ok || echo nao)"

# ── 5. ruído benigno de re-aplicação NÃO derruba ────────────────────────────
d="$(monta benigno '' '' sim)"
( cd "$d" && RESPOSTA_BASELINE='psql: error: relation "organizations" already exists' \
  PATH="$d/bin:$PATH" NEXUS_IMAGE="ghcr.io/exemplo/nexus:v9.9.9" \
  bash scripts/deploy.sh >/dev/null 2>&1 )
rc=$?
espera "'already exists' é ruído esperado e o deploy segue" \
  "$([ "$rc" = 0 ] && echo ok || echo nao)"

printf '\n'
if [ "$FALHAS" = 0 ]; then
  echo "deploy aplica schema: todos os casos passaram"
  exit 0
fi
echo "deploy aplica schema: $FALHAS falha(s)"
exit 1
