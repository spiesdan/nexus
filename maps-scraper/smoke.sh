#!/usr/bin/env bash
# Fumaça da imagem de descoberta. Duas provas, porque uma não cobre a outra:
#
#   1. CLI: o binário sobe e uma busca real em modo HTTP devolve negócio.
#   2. API: o modo `-web` aceita `fast_mode: true` e o GET do job devolve
#      `Data.fast_mode == true` — ou seja, a flag é ACEITA e NÃO ignorada.
#      (Já aconteceu de o campo existir no payload e o serviço criar o job em
#      modo navegador; só ler o create não provaria nada.)
#
# Não roda no CI de PR de propósito — depende do Google e deixaria um check
# obrigatório refém de rede de terceiro. Quem publica a imagem roda isto antes
# do push.
#
#   ./smoke.sh [imagem]
#
# Sai 0 com as contagens; sai 1 se não subir, voltar vazio, se a flag não
# persistir ou se o log tiver sinal de bloqueio (CAPTCHA/403/429) — bloqueio
# NÃO se contorna.
set -euo pipefail

# O namespace NÃO se repete aqui: a âncora única é `IMG_NS` em
# hostgator-setup-kit/_common.sh, e `namespace-das-imagens` reprova qualquer
# arquivo que volte a escrever o literal. Lido do arquivo, com fallback local
# para rodar de um checkout sem o kit ao lado.
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS_PADRAO="$(sed -n 's/^IMG_NS="\(.*\)"$/\1/p' "$AQUI/../hostgator-setup-kit/_common.sh" 2>/dev/null || true)"
IMG="${1:-${NS_PADRAO:-localhost}/nexus-maps-scraper:local}"
TMP="$(mktemp -d)"
CID=""
limpar() {
  [ -n "$CID" ] && docker rm -f "$CID" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpar EXIT

falhar() { echo "FALHOU: $*" >&2; exit 1; }

bloqueado() {
  grep -qiE 'captcha|unusual traffic|\b(403|429)\b' "$1"
}

echo "imagem: $IMG"
docker run --rm "$IMG" -version | tail -1

# ── 1. CLI ──────────────────────────────────────────────────────────────────
printf 'restaurante\n' > "$TMP/query.txt"
mkdir -p "$TMP/out"

if command -v timeout >/dev/null 2>&1; then
  LIMITE=(timeout 180)
else
  LIMITE=()
fi

"${LIMITE[@]}" docker run --rm --name descoberta-smoke-cli \
  -e DISABLE_TELEMETRY=1 \
  -v "$TMP/query.txt:/queries.txt:ro" \
  -v "$TMP/out:/out" \
  "$IMG" -input /queries.txt -results /out/results.csv \
  -fast-mode -geo "-26.3045,-48.8487" -radius 8000 -depth 1 -c 1 -lang pt \
  > "$TMP/cli.log" 2>&1

bloqueado "$TMP/cli.log" && { grep -iE 'captcha|unusual traffic|\b(403|429)\b' "$TMP/cli.log" >&2 || true; falhar "sinal de bloqueio no CLI — pare, não contorne"; }
[ -s "$TMP/out/results.csv" ] || { tail -20 "$TMP/cli.log" >&2; falhar "CLI não escreveu results.csv"; }

NEGOCIOS_CLI=$(($(wc -l < "$TMP/out/results.csv") - 1))
[ "$NEGOCIOS_CLI" -ge 1 ] || falhar "CLI voltou vazio (0 negócios)"
echo "ok CLI: $NEGOCIOS_CLI negócios"

# ── 2. API ──────────────────────────────────────────────────────────────────
# Porta efêmera no host: o serviço de verdade não publica porta nenhuma.
CID=$(docker run -d --rm --name descoberta-smoke-api \
  -e DISABLE_TELEMETRY=1 \
  -p 127.0.0.1::8080 \
  --tmpfs /data:rw,mode=1777,size=128m \
  "$IMG" -web -data-folder /data -addr :8080)

PORTA="$(docker port "$CID" 8080/tcp | head -1 | sed 's/.*://')"
[ -n "$PORTA" ] || falhar "não consegui resolver a porta publicada"

for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${PORTA}/api/v1/jobs" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:${PORTA}/api/v1/jobs" >/dev/null || falhar "API não respondeu em 30 s"

# O probe que o compose usa tem de funcionar DENTRO do distroless.
docker exec "$CID" /usr/local/bin/healthcheck || falhar "o binário de healthcheck reprovou no container"

CRIADO=$(curl -fsS -X POST "http://127.0.0.1:${PORTA}/api/v1/jobs" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke","keywords":["restaurante"],"lang":"pt","zoom":15,"lat":"-26.3045","lon":"-48.8487","fast_mode":true,"radius":8000,"depth":1,"max_time":180}')
ID=$(printf '%s' "$CRIADO" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
[ -n "$ID" ] || falhar "create não devolveu id: $CRIADO"

JOB=$(curl -fsS "http://127.0.0.1:${PORTA}/api/v1/jobs/${ID}")
# O ponto do teste: a flag foi aceita E persistida. Sem esta linha, um create
# que ignorasse `fast_mode` passaria verde e rodaria navegador na VPS.
printf '%s' "$JOB" | grep -Eq '"fast_mode"[[:space:]]*:[[:space:]]*true' \
  || falhar "Data.fast_mode não veio true no GET do job: $JOB"
echo "ok API: Data.fast_mode=true"

for _ in $(seq 1 60); do
  JOB=$(curl -fsS "http://127.0.0.1:${PORTA}/api/v1/jobs/${ID}")
  STATUS=$(printf '%s' "$JOB" | sed -n 's/.*"Status":"\([^"]*\)".*/\1/p')
  [ "$STATUS" = "ok" ] && break
  [ "$STATUS" = "failed" ] && falhar "job terminou em failed"
  sleep 2
done
[ "$STATUS" = "ok" ] || falhar "job não terminou em 120 s (status: ${STATUS:-?})"

curl -fsS "http://127.0.0.1:${PORTA}/api/v1/jobs/${ID}/download" -o "$TMP/api.csv"
NEGOCIOS_API=$(($(wc -l < "$TMP/api.csv") - 1))
[ "$NEGOCIOS_API" -ge 1 ] || falhar "API voltou vazia (0 negócios)"

echo "ok: CLI $NEGOCIOS_CLI + API $NEGOCIOS_API negócios, fast_mode persistido, healthcheck no container"
