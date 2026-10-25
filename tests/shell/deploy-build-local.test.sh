#!/usr/bin/env bash
# Prova os GUARDAS de `scripts/deploy-build-local.sh` — o caminho de deploy de
# uma instalação que não alcança o GHCR (VPS que constrói a imagem localmente).
#
#   bash tests/shell/deploy-build-local.test.sh
#
# ── Por que este teste existe ───────────────────────────────────────────────
#
# O script nasceu de um incidente: em 24/10/2026 o build das seis imagens, com a
# stack no ar, levou a VPS de 8 GB sem swap ao OOM — 11 processos mortos pelo
# kernel, entre eles `supabase_realtime` (17 restarts). O `docker ps` continuava
# mostrando tudo `healthy`. O script é a resposta a isso, e o que o torna
# resposta são os guardas: piso de memória, build serializado, rollback do .env,
# recusa em rodar sobre árvore suja, e rc != 0 quando o health não fecha.
#
# Um guarda que ninguém exercita é comentário. Nada aqui toca Docker, git de
# verdade ou a máquina de quem roda: `docker` é um dublê que DENUNCIA se for
# chamado — se um guarda regredir, o teste acusa no lugar certo.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$RAIZ/scripts/deploy-build-local.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILS=0
check() { # check <descrição> <comando...>
  if "${@:2}"; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; FAILS=$((FAILS + 1)); fi
}
# `contem`/`nao_contem` existem para não montar `bash -c "... '$SAIDA'"`: a
# saída do script contém apóstrofo (a dica do `git stash`), e a interpolação
# quebrava o comando — o teste "passava" com o grep reclamando do arquivo
# errado. Verde falso é pior que teste nenhum.
contem() { grep -q -F -- "$1" <<<"$2"; }
nao_contem() { ! grep -q -F -- "$1" <<<"$2"; }

# ── Dublê de docker: se alguém chegar aqui, o guarda falhou ─────────────────
mkdir -p "$WORK/bin"
cat > "$WORK/bin/docker" <<STUB
#!/usr/bin/env bash
touch "$WORK/docker-chamado"
echo "docker chamado: $*" >&2
exit 1
STUB
chmod +x "$WORK/bin/docker"
docker_nao_chamado() { [ ! -f "$WORK/docker-chamado" ]; }

rodar() { # rodar <diretório> [args...]
  local dir="$1"
  shift
  ( cd "$dir" && env PATH="$WORK/bin:$PATH" NEXUS_BACKUP_DIR="$WORK/backup" \
      bash "$SCRIPT" "$@" 2>&1 )
}

# ── Caso 0: sintaxe ─────────────────────────────────────────────────────────
check "o script passa em 'bash -n'" bash -n "$SCRIPT"

# ── Caso 1: sem argumento — uso, não stack trace ────────────────────────────
SAIDA="$(rodar "$WORK" 2>&1)"
RC=$?
check "sem argumento sai com 64" test "$RC" -eq 64
check "sem argumento diz o uso" contem "uso: scripts/deploy-build-local.sh <sha-da-main>" "$SAIDA"

# ── Caso 2: fora de um repositório git ──────────────────────────────────────
mkdir -p "$WORK/sem-git"
SAIDA="$(rodar "$WORK/sem-git" abc123 2>&1)"
RC=$?
check "fora de repo git sai com erro" test "$RC" -ne 0
check "fora de repo git explica o motivo" contem "não é um repositório git" "$SAIDA"

# ── Caso 3: repositório sem .env ────────────────────────────────────────────
REPO="$WORK/repo"
mkdir -p "$REPO"
( cd "$REPO" && git init -q && git config user.email t@t && git config user.name t \
    && echo a > tracked.txt && git add -A && git commit -qm init )
SAIDA="$(rodar "$REPO" abc123 2>&1)"
RC=$?
check "sem .env sai com erro" test "$RC" -ne 0
check "sem .env diz que falta o .env" contem ".env ausente" "$SAIDA"

# ── Caso 4: sem o override de build ─────────────────────────────────────────
printf 'APP_IMAGE=nexus:local-x\n' > "$REPO/.env"
SAIDA="$(rodar "$REPO" abc123 2>&1)"
RC=$?
check "sem docker-compose.build.yml sai com erro" test "$RC" -ne 0
check "sem o override explica que ele é obrigatório" contem "docker-compose.build.yml ausente" "$SAIDA"

# ── Caso 5: árvore suja — recusa em vez de apagar hotfix ────────────────────
touch "$REPO/docker-compose.build.yml"
ANTES="$(cat "$REPO/.env")"
echo "hotfix de plantão" >> "$REPO/tracked.txt"
SAIDA="$(rodar "$REPO" abc123 2>&1)"
RC=$?
check "árvore suja sai com erro" test "$RC" -ne 0
check "árvore suja nomeia a alteração" contem "alteração não commitada" "$SAIDA"
check "árvore suja aponta a saída (NEXUS_FORCE=1)" contem "NEXUS_FORCE=1" "$SAIDA"
check "árvore suja não toca o .env" test "$(cat "$REPO/.env")" = "$ANTES"
check "árvore suja não anuncia rollback à toa" nao_contem "[rollback]" "$SAIDA"

# ── O guarda que o incidente de 24/10 exige ────────────────────────────────
# Serializar o build é o que impede dois `next build`/`tsc` (~2-3 GB cada) de
# rodarem juntos e derrubarem o `supabase_realtime` sem aparecer no `docker ps`.
check "o build é serializado (COMPOSE_PARALLEL_LIMIT=1)" \
  grep -q "COMPOSE_PARALLEL_LIMIT=1" "$SCRIPT"
check "há piso de memória antes de construir" \
  grep -q "MemAvailable" "$SCRIPT"
check "o health que não fecha faz o script falhar" \
  grep -q 'health não fechou' "$SCRIPT"

# ── Invariante final: nenhum guarda chegou ao docker ───────────────────────
check "nenhum caso de guarda chamou o docker" docker_nao_chamado

echo
if [ "$FAILS" -eq 0 ]; then
  echo "deploy-build-local: todos os guardas verdes"
else
  echo "deploy-build-local: $FAILS falha(s)"
  exit 1
fi
