#!/usr/bin/env bash
# Prova as DECISÕES de `scripts/ci/instalar-chromium.sh` — o instalador de
# Chromium que os jobs `e2e` e `e2e-pos-deploy` usam.
#
#   bash tests/shell/instalar-chromium.test.sh
#
# ── Por que este teste existe ───────────────────────────────────────────────
#
# Em 2026-11-11 o `e2e` ficou vermelho em 5 execuções seguidas, antes de rodar
# um teste: o `apt-get` do runner não resolvia `azure.archive.ubuntu.com` e o
# `playwright install-deps` saía 100. A resposta tem três pernas — pular o apt
# quando as libs já existem, tentar de novo com backoff, e provar que o browser
# abre quando o apt não volta. As três são DECISÃO, não instalação, e é isso que
# se exercita aqui: `pnpm`, `sudo`, `apt-get`, `node` e `sleep` são dublês, então
# nada de rede, Docker ou browser real.
#
# O caso que mais importa é o do FALSO POSITIVO do `--dry-run`: quando o índice
# do apt está ausente, ele imprime "All system dependencies are installed." sem
# ter checado nada. Um instalador que acredita nisso pula o apt num runner sem
# libs e a suíte morre em "browser fechou". Por isso a decisão exige também que
# o apt conheça o `libnss3` — e há um caso abaixo que reprova quem remover essa
# condição.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$RAIZ/scripts/ci/instalar-chromium.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILS=0
check() { # check <descrição> <comando...>
  if "${@:2}"; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; FAILS=$((FAILS + 1)); fi
}
contem() { grep -q -F -- "$1" <<<"$2"; }
nao_contem() { ! grep -q -F -- "$1" <<<"$2"; }

# ── Dublês ──────────────────────────────────────────────────────────────────
# Todos registram a chamada em $WORK/chamadas.log. Se algum lado regredir, a
# asserção acusa no lugar certo em vez de o script tentar rede de verdade.
mkdir -p "$WORK/bin"

cat > "$WORK/bin/pnpm" <<STUB
#!/usr/bin/env bash
echo "pnpm \$*" >> "$WORK/chamadas.log"
sub="\$3"
case "\$sub" in
  install)
    [ "\$CENARIO" = "download-falha" ] && exit 1
    exit 0 ;;
  install-deps)
    case " \$* " in
      *" --dry-run "*)
        case "\$CENARIO" in
          ja-instalado|falso-positivo) echo "All system dependencies are installed." ;;
          *) printf 'Missing system dependencies (3):\n  libnss3\n  libatk1.0-0\n  fonts-liberation\n' ;;
        esac
        exit 0 ;;
      *)
        n=\$(( \$(cat "$WORK/reais" 2>/dev/null || echo 0) + 1 ))
        echo "\$n" > "$WORK/reais"
        case "\$CENARIO" in
          retry) [ "\$n" -ge 2 ] && exit 0; exit 1 ;;
          *) exit 1 ;;
        esac ;;
    esac ;;
esac
exit 0
STUB

cat > "$WORK/bin/sudo" <<'STUB'
#!/usr/bin/env bash
exec "$@"
STUB

cat > "$WORK/bin/apt-get" <<STUB
#!/usr/bin/env bash
echo "apt-get \$*" >> "$WORK/chamadas.log"
# Sem índice de pacotes o apt não resolve nem na simulação — o cenário em que o
# --dry-run mente.
[ "\$CENARIO" = "falso-positivo" ] && exit 100
exit 0
STUB

cat > "$WORK/bin/node" <<STUB
#!/usr/bin/env bash
echo "node \$*" >> "$WORK/chamadas.log"
case "\$CENARIO" in
  fallback) exit 0 ;;
  *) exit 1 ;;
esac
STUB

cat > "$WORK/bin/sleep" <<STUB
#!/usr/bin/env bash
echo "sleep \$*" >> "$WORK/chamadas.log"
exit 0
STUB

chmod +x "$WORK/bin"/*

rodar() { # rodar <cenário> [env extra...]
  local cenario="$1"
  shift
  rm -f "$WORK/chamadas.log" "$WORK/reais"
  ( cd "$WORK" && env PATH="$WORK/bin:$PATH" CENARIO="$cenario" "$@" \
      bash "$SCRIPT" 2>&1 )
}
chamadas() { cat "$WORK/chamadas.log" 2>/dev/null || true; }
reais() { cat "$WORK/reais" 2>/dev/null || echo 0; }

# ── Caso 0: sintaxe ─────────────────────────────────────────────────────────
check "o script passa em 'bash -n'" bash -n "$SCRIPT"

# ── Caso 1: libs já presentes — o apt NÃO é chamado ─────────────────────────
SAIDA="$(rodar ja-instalado CHROMIUM_CACHE_HIT=true)"
RC=$?
check "runner completo: sai 0" bash -c '[ "$1" = 0 ]' _ "$RC"
check "runner completo: não tenta instalar de verdade" bash -c '[ ! -f "$1/reais" ]' _ "$WORK"
check "runner completo: não prova o browser (não precisa)" nao_contem "node " "$(chamadas)"

# ── Caso 2: dry-run MENTE (índice do apt ausente) — tem de instalar assim ───
SAIDA="$(rodar falso-positivo CHROMIUM_CACHE_HIT=true)"
check "falso positivo: NÃO confia no dry-run" bash -c '[ "$1" -ge 1 ]' _ "$(reais)"

# ── Caso 3: falha transitória — a 2ª tentativa resolve, sem provar browser ──
SAIDA="$(rodar retry CHROMIUM_CACHE_HIT=true)"
RC=$?
check "retry: sai 0" bash -c '[ "$1" = 0 ]' _ "$RC"
check "retry: tentou 2 vezes" bash -c '[ "$1" = 2 ]' _ "$(reais)"
check "retry: esperou entre as tentativas" contem "sleep 20" "$(chamadas)"
check "retry: avisou no log do job" contem "::warning::" "$SAIDA"
check "retry: não chegou a provar o browser" nao_contem "provar-chromium.cjs" "$(chamadas)"

# ── Caso 4: apt fora, mas o Chromium abre — segue (não derruba 40 min) ──────
SAIDA="$(rodar fallback CHROMIUM_CACHE_HIT=true)"
RC=$?
check "fallback: sai 0" bash -c '[ "$1" = 0 ]' _ "$RC"
check "fallback: prova o browser" contem "provar-chromium.cjs" "$(chamadas)"
check "fallback: diz que segue" contem "Seguindo para a suíte" "$SAIDA"
check "fallback: terminou pronto" contem "Chromium pronto." "$SAIDA"

# ── Caso 5: apt fora E browser não abre — reprova, sem verde falso ──────────
SAIDA="$(rodar falha-total CHROMIUM_CACHE_HIT=true)"
RC=$?
check "falha total: sai 1" bash -c '[ "$1" = 1 ]' _ "$RC"
check "falha total: explica o motivo" contem "a suíte não pode rodar" "$SAIDA"
check "falha total: não diz 'pronto'" nao_contem "Chromium pronto." "$SAIDA"

# ── Caso 6: cache miss baixa o binário; cache hit não ───────────────────────
SAIDA="$(rodar ja-instalado CHROMIUM_CACHE_HIT=false)"
check "cache miss: baixa o binário" contem "pnpm exec playwright install chromium" "$(chamadas)"
SAIDA="$(rodar ja-instalado CHROMIUM_CACHE_HIT=true)"
check "cache hit: não baixa o binário" nao_contem "install chromium" "$(chamadas)"

# ── Caso 7: o download do binário falhou — reprova dizendo que foi rede ─────
SAIDA="$(rodar download-falha CHROMIUM_CACHE_HIT=false)"
RC=$?
check "download falhou: sai 1" bash -c '[ "$1" = 1 ]' _ "$RC"
check "download falhou: nomeia a causa" contem "O download do Chromium falhou" "$SAIDA"

printf '\n'
if [ "$FAILS" -gt 0 ]; then
  printf '%d asserção(ões) falharam\n' "$FAILS"
  exit 1
fi
printf 'instalar-chromium: todas as asserções passaram\n'
