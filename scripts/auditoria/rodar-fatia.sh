#!/bin/zsh
# UMA fatia, com servidor e Chromium mortos no fim — inclusive em erro.
# Uso: bash scripts/auditoria/rodar-fatia.sh <de> <ate>
set -u
de=${1:?falta o indice inicial}
ate=${2:?falta o indice final}
DIR=$(cd "$(dirname "$0")/../.." && pwd)
cd "$DIR" || exit 1

USO=$(sysctl vm.swapusage | awk '{print $7}' | tr -d 'M')
echo "swap antes: ${USO}MB"
if [ -n "$USO" ] && [ "${USO%%.*}" -ge 4096 ]; then
  echo "ABORTADA: swap >= 4096MB — nao iniciar servidor"
  exit 3
fi

PORT=3029
pkill -f "next dev -p $PORT" 2>/dev/null
sleep 2
cleanup() {
  pkill -f "next dev -p $PORT" 2>/dev/null
  sleep 1
  pkill -f "playwright_chromiumdev_profile" 2>/dev/null
  echo "limpo: $(sysctl vm.swapusage | awk '{print $7}')"
}
trap cleanup EXIT INT TERM

set -a; . ./.env.e2e; set +a
pnpm exec next dev -p "$PORT" > /tmp/dev-fatia.log 2>&1 &
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/login" 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "200" ] || { echo "servidor nao subiu"; exit 4; }

ROTAS=$(python3 -c "
import json
d=json.load(open('docs/auditoria/capturas/varredura-app/rotas.json'))
print(','.join(x['rota'] for x in d['rotas'][$de:$ate]))")
AUDIT_BASE_URL="http://localhost:$PORT" node scripts/auditoria/varredura-de-modulo.mjs \
  --estado /tmp/state-96.json --rotas "$ROTAS" --de 0 --ate $((ate-de)) \
  --saida docs/auditoria/capturas/varredura-app 2>&1 | tee "/tmp/fatia-${de}-${ate}.log"
# O instrumento nomeia pelo indice DENTRO da fatia (sempre 0-N); renomear para
# o indice GLOBAL evita que a fatia seguinte sobrescreva a anterior.
mv -f docs/auditoria/capturas/varredura-app/varredura-0-$((ate-de)).json \
      docs/auditoria/capturas/varredura-app/varredura-${de}-${ate}.json
