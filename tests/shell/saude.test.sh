#!/usr/bin/env bash
# Prova do `hostgator-setup-kit/saude.sh` — o script que diz se a instalação
# está saudável. Sem docker de verdade: `docker`, `df`, `curl`, `openssl` e
# `crontab` são dublês no PATH, e o cenário é escolhido por `CENARIO`.
#
#   bash tests/shell/saude.test.sh
#
# O que está sob prova:
#   1. Tudo dentro do limite  → exit 0 e um resumo verde.
#   2. Alerta induzido        → exit 1, e cada sinal ruim aparece NOMEADO:
#      disco, contêiner unhealthy, backup velho e certificado A1 vencendo.
#   3. `--json` acompanha o mesmo veredito (`"ok":false` quando há alerta).
#
# Por que dublês e não a VPS: o teste tem de ser determinístico e não pode
# depender de produção. O que ele NÃO prova — e o runbook diz isso — é o estado
# real; para isso existe a execução read-only na instalação.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KIT="$REPO_ROOT/hostgator-setup-kit"

# `saude.sh` é alvo Linux (lê /proc, `date -d`). Num macOS o `date -d` do BSD não
# existe e o cálculo do A1 não roda — o teste inteiro viraria falso verde. Em vez
# de fingir, declara o skip; quem valida é o CI (Ubuntu) e o `pnpm test:shell` lá.
if ! date -d @0 +%s >/dev/null 2>&1; then
  printf '  ⚠ date -d (GNU) não existe aqui — saude.sh é alvo Linux; rode no CI.\n'
  printf 'SKIP (sem date GNU)\n'
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILS=0
espera() {  # espera <descrição> <saída> <texto esperado>
  if printf '%s' "$2" | grep -qF -- "$3"; then
    printf '  ✓ %s\n' "$1"
  else
    printf '  ✗ %s (não achei: %s)\n' "$1" "$3"
    FAILS=$((FAILS + 1))
  fi
}
espera_nao() {
  if printf '%s' "$2" | grep -qF -- "$3"; then
    printf '  ✗ %s (achei o que não devia: %s)\n' "$1" "$3"
    FAILS=$((FAILS + 1))
  else
    printf '  ✓ %s\n' "$1"
  fi
}

# ── Fixture: um projeto mínimo do kit ───────────────────────────────────────
PROJ="$WORK/projeto"
mkdir -p "$PROJ/backups" "$WORK/bin"
printf 'services:\n  app:\n    image: x\n' > "$PROJ/docker-compose.prod.yml"
cat > "$PROJ/.env" <<'ENV'
NEXT_PUBLIC_APP_URL="https://exemplo.test"
APP_IMAGE=ghcr.io/spiesdan/nexus:2.0.18
REVERSE_PROXY="caddy"
ENV
: > "$PROJ/backups/db-20260101-000000.sql.gz"

# ── Dublês ──────────────────────────────────────────────────────────────────
cat > "$WORK/bin/docker" <<'STUB'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *"ps -a --format"*)
    if [ "${CENARIO:-ok}" = "alerta" ]; then
      printf 'crm-app-1|Up 2 hours (unhealthy)\ncrm-worker-1|Up 2 hours (healthy)\n'
    else
      printf 'crm-app-1|Up 2 hours (healthy)\ncrm-worker-1|Up 2 hours (healthy)\n'
    fi ;;
  *"ps -q"*) printf 'abc123\n' ;;
  *"RestartCount"*) printf '0\n' ;;
  *'{{.Name}}'*) printf '/crm-app-1\n' ;;
  *"ps --format"*) printf 'supabase_db_selfhost\n' ;;
  *organization_id*) printf '' ;;
  *psql*)
    if [ "${CENARIO:-ok}" = "alerta" ]; then
      printf '%s|35233142000183\n' "$(date -d '+10 days' +%F)"
    else
      printf '2027-10-27|35233142000183\n'
    fi ;;
  *) exit 0 ;;
esac
STUB

cat > "$WORK/bin/df" <<'STUB'
#!/usr/bin/env bash
if [ "${CENARIO:-ok}" = "alerta" ]; then
  printf 'Filesystem Size Used Avail Use%% Mounted\n/dev/sda1 96G 92G 3.8G 95%% /\n'
else
  printf 'Filesystem Size Used Avail Use%% Mounted\n/dev/sda1 96G 38G 59G 40%% /\n'
fi
STUB

cat > "$WORK/bin/curl" <<'STUB'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *"/api/v1/health"*) printf '{"data":{"status":"healthy","version":"2.0.18"}}\n' ;;
  *api.github.com*)   printf '{"tag_name":"v2.0.18"}\n' ;;
  *"-w"*)             if [ "${CENARIO:-ok}" = "erro404" ]; then printf '404'; else printf '307'; fi ;;
  *) exit 0 ;;
esac
STUB

cat > "$WORK/bin/openssl" <<'STUB'
#!/usr/bin/env bash
case "${1:-}" in
  s_client) cat >/dev/null 2>&1; printf 'CONNECTED\n' ;;
  x509)     printf 'notAfter=Feb 18 20:57:32 2027 GMT\n' ;;
esac
STUB

cat > "$WORK/bin/crontab" <<'STUB'
#!/usr/bin/env bash
printf '0 6 * * * cd /var/www/crm && bash hostgator-setup-kit/backup.sh\n'
STUB

chmod +x "$WORK/bin"/*
export PATH="$WORK/bin:$PATH"

roda() {  # roda <cenário> [flags] → saída em $SAIDA, status em $RC
  CENARIO="$1"; shift
  RC=0
  SAIDA="$(cd "$PROJ" && CENARIO="$CENARIO" bash "$KIT/saude.sh" "$@" 2>&1)" || RC=$?
}

# ── 1. Tudo dentro do limite ────────────────────────────────────────────────
printf '── 1. instalação saudável → exit 0\n'
: > "$PROJ/backups/db-20260101-000000.sql.gz"   # mtime = agora
roda ok
if [ "$RC" -eq 0 ]; then printf '  ✓ saída 0\n'; else printf '  ✗ saída %s (esperava 0)\n' "$RC"; FAILS=$((FAILS+1)); fi
espera "resume que está tudo dentro do limite" "$SAIDA" "RESUMO: tudo dentro do limite"
espera_nao "não inventa alerta" "$SAIDA" "✗"
espera "nomeia o proxy do compose na borda" "$SAIDA" "devolve 307"

# ── 2. Alerta induzido ──────────────────────────────────────────────────────
printf '\n── 2. disco, contêiner, backup e A1 ruins → exit 1, cada um nomeado\n'
touch -t 202601010000 "$PROJ/backups/db-20260101-000000.sql.gz"   # backup velho
roda alerta
if [ "$RC" -eq 1 ]; then printf '  ✓ saída 1\n'; else printf '  ✗ saída %s (esperava 1)\n' "$RC"; FAILS=$((FAILS+1)); fi
espera "disco acima de 80%" "$SAIDA" "disco em 95%"
espera "contêiner unhealthy" "$SAIDA" "contêiner unhealthy: crm-app-1"
espera "backup velho, com a idade" "$SAIDA" "último dump do banco tem"
espera "A1 vencendo, em dias" "$SAIDA" "A1 vence em "
espera "resumo com a contagem de alertas" "$SAIDA" "RESUMO: 4 alerta(s)"

# ── 3. --json acompanha o veredito ──────────────────────────────────────────
printf '\n── 3. --json diz o mesmo que o texto\n'
roda alerta --json
espera "--json marca ok:false" "$SAIDA" '"ok":false'
espera "--json lista o disco" "$SAIDA" "disco em 95%"
: > "$PROJ/backups/db-20260101-000000.sql.gz"   # volta o backup para agora
roda ok --json
espera "--json marca ok:true" "$SAIDA" '"ok":true'

# ── 4. 404 nomeia o proxy certo ─────────────────────────────────────────────
# Mandar quem tem Caddy refazer o deploy com os dois -f derruba o up dele. O
# alerta tem de apontar o caminho da instalação, não o do vizinho.
printf '\n── 4. 404 fala a língua do proxy em uso\n'
sed -i.bak -E 's/^REVERSE_PROXY=.*/REVERSE_PROXY="caddy"/' "$PROJ/.env"
roda erro404
espera "com Caddy, explica o 404 sem falar de Traefik" "$SAIDA" "o app respondeu não achei a rota"
espera_nao "e não manda passar os dois -f" "$SAIDA" "dois -f"
sed -i.bak -E 's/^REVERSE_PROXY=.*/REVERSE_PROXY="traefik"/' "$PROJ/.env"
roda erro404
espera "com Traefik, aponta labels perdidas" "$SAIDA" "labels do Traefik perdidas"
espera "e manda refazer com os dois -f" "$SAIDA" "DOIS -f"
sed -i.bak -E 's/^REVERSE_PROXY=.*/REVERSE_PROXY="caddy"/' "$PROJ/.env"

printf '\n'
if [ "$FAILS" -eq 0 ]; then
  echo "OK — saude.sh acusa o que está ruim e fica quieto quando está bom."
  exit 0
fi
printf 'FALHOU — %d asserção(ões)\n' "$FAILS"
exit 1
