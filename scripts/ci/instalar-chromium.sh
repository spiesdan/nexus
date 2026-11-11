#!/usr/bin/env bash
# Instala o Chromium do Playwright num runner de CI — binário + libs do sistema.
#
#   CHROMIUM_CACHE_HIT=true bash scripts/ci/instalar-chromium.sh
#
# ── Por que este arquivo existe ─────────────────────────────────────────────
#
# Em 2026-11-11 o job `e2e` ficou vermelho em CINCO execuções seguidas, sempre no
# mesmo passo e sempre ANTES da suíte começar: "Instalar o browser". O erro,
# medido no log do run 43055433534 (job 130643498313):
#
#   Ign:2 http://azure.archive.ubuntu.com/ubuntu noble InRelease
#   Err:2 https://security.ubuntu.com/ubuntu noble InRelease
#     Temporary failure resolving 'azure.archive.ubuntu.com'
#   E: Failed to install browser dependencies
#   Error: Installation process exited with code: 100
#
# `playwright install-deps` roda `apt-get update && apt-get install`, e o apt do
# runner não resolvia o mirror da Ubuntu. O resultado: 1h45 de gates vermelhos em
# que NENHUM teste rodou, PR travado (a branch protection exige `e2e`) e três
# reexecuções inúteis — reexecutar não conserta o que não foi diagnosticado.
#
# A resposta é em camadas, da mais barata para a mais cara:
#
#   1. OFFLINE PRIMEIRO. `install-deps --dry-run` SIMULA a instalação
#      (`apt-get install -s`), sem baixar nada. Se o runner já tem as libs, o apt
#      nem é chamado — é o caso normal das imagens ubuntu-24.04 do GitHub, que já
#      trazem Chrome e as bibliotecas dele.
#
#      O `--dry-run` tem um falso positivo que já morde: quando o apt não
#      consegue sequer resolver o pacote (índice ausente), ele não imprime
#      nenhum "Inst" e conclui "All system dependencies are installed." — isto
#      é, um runner sem índices parece um runner completo. Por isso a decisão de
#      pular o apt exige DUAS condições: o apt conhece o `libnss3` E o dry-run
#      diz que está tudo instalado.
#
#   2. RETRY com backoff. Falha de DNS costuma ser transitória; 3 tentativas
#      (20s, 40s, 60s) cobrem a janela típica sem intervenção humana.
#
#   3. PROVA. Se o apt continuar fora, o que decide não é o apt — é se o Chromium
#      ABRE. Se abre com as libs que o runner já tem, a suíte roda de verdade e o
#      gate não deve cair por causa do mirror: avisa e segue. Se não abre,
#      reprova listando as libs que faltam (`ldd`), que é o dado que faz alguém
#      consertar em vez de reexecutar.
#
# O passo de browser do `e2e.yml` e do `e2e-pos-deploy.yml` chamam ESTE arquivo:
# uma implementação só, para os dois não divergirem (era o que acontecia quando
# cada workflow tinha a sua cópia).
#
# ── Contrato ────────────────────────────────────────────────────────────────
#
#   CHROMIUM_CACHE_HIT   "true" quando `~/.cache/ms-playwright` veio do cache
#                        (pula o download do binário). Default: false.
#   CHROMIUM_TENTATIVAS  quantas vezes tentar o `install-deps`. Default: 3.
#   CHROMIUM_ESPERA_BASE segundos da 1ª espera do backoff. Default: 20.
#
# Códigos de saída: 0 = dá para rodar a suíte; 1 = não dá (e o motivo está dito).
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ" || exit 1

CACHE_HIT="${CHROMIUM_CACHE_HIT:-false}"
TENTATIVAS="${CHROMIUM_TENTATIVAS:-3}"
ESPERA_BASE="${CHROMIUM_ESPERA_BASE:-20}"

aviso() { printf '::warning::%s\n' "$*"; }
erro() { printf '::error::%s\n' "$*"; }

PNPM="$(command -v pnpm || true)"
if [ -z "$PNPM" ]; then
  erro "pnpm não está no PATH — o passo precisa do pnpm/action-setup antes."
  exit 1
fi

# ── 1. Binário ──────────────────────────────────────────────────────────────
# Sem `--with-deps` de propósito: o apt é tratado abaixo, com as defensas dele.
if [ "$CACHE_HIT" != "true" ]; then
  echo "Cache do Chromium não veio — baixando o binário."
  if ! pnpm exec playwright install chromium; then
    erro "O download do Chromium falhou (rede do runner, não é o apt)."
    exit 1
  fi
fi

# ── 2. Libs do sistema: dá para pular? ──────────────────────────────────────
# Silencioso: aqui só interessa o código de saída.
apt_conhece_libnss3() { apt-get install -s --no-install-recommends libnss3 >/dev/null 2>&1; }

DEPS_OK=0
LOG="$(mktemp -t deps-chromium.XXXXXX)"
if apt_conhece_libnss3 &&
  pnpm exec playwright install-deps --dry-run chromium >"$LOG" 2>&1 &&
  grep -q 'All system dependencies are installed.' "$LOG"; then
  echo "Libs do Chromium já estão no runner — apt não é chamado."
  DEPS_OK=1
else
  echo "Libs ausentes ou índice do apt ilegível — o dry-run não autorizou pular o apt:"
  sed -n '1,20p' "$LOG" | sed 's/^/    /'
fi
rm -f "$LOG"

# ── 3. Instalação de verdade, com retry ─────────────────────────────────────
if [ "$DEPS_OK" != "1" ]; then
  for tentativa in $(seq 1 "$TENTATIVAS"); do
    if sudo "$PNPM" exec playwright install-deps chromium; then
      DEPS_OK=1
      break
    fi
    espera=$((tentativa * ESPERA_BASE))
    aviso "install-deps falhou (tentativa ${tentativa}/${TENTATIVAS}) — apt/mirror; nova tentativa em ${espera}s"
    sleep "$espera"
  done
fi

# ── 4. Se o apt não voltou: o Chromium abre? ────────────────────────────────
if [ "$DEPS_OK" != "1" ]; then
  aviso "apt não instalou as libs — provando se o Chromium abre com as do runner."
  if node "$RAIZ/scripts/ci/provar-chromium.cjs"; then
    aviso "Chromium abriu sem o apt: o mirror estava fora, o browser não. Seguindo para a suíte."
    DEPS_OK=1
  fi
fi

if [ "$DEPS_OK" != "1" ]; then
  erro "O Chromium não abre e o apt não instala as libs — a suíte não pode rodar."
  BIN="$(node -e 'console.log(require("@playwright/test").chromium.executablePath())' 2>/dev/null || true)"
  if [ -n "$BIN" ] && [ -e "$BIN" ]; then
    echo "Bibliotecas que faltam para $BIN:"
    ldd "$BIN" 2>/dev/null | grep 'not found' || echo "  (ldd não apontou nenhuma)"
  else
    echo "Não foi possível localizar o binário do Chromium (executablePath falhou)."
  fi
  exit 1
fi

echo "Chromium pronto."
