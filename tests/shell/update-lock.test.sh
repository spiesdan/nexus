#!/usr/bin/env bash
# Prova do lock de deploy do `update.sh` — sem docker, sem crontab, sem projeto
# de verdade: o segundo deploy tem que ser recusado ANTES de qualquer efeito.
#
#   bash tests/shell/update-lock.test.sh
#
# O que está sob prova:
#   1. Com o lock tomado por outro processo, `update.sh` sai com 4 e diz por quê
#      — sem trocar de diretório, sem puxar imagem, sem tocar no banco.
#   2. Com o lock livre, a execução NÃO é recusada pelo lock (segue o caminho
#      normal e falha depois, por outro motivo, num diretório vazio).
#   3. Dois processos concorrentes não entram juntos: exatamente um adquire.
#
# `flock` é a primitiva certa aqui porque é liberado pelo kernel quando o
# processo morre — não existe lock órfão para o dono limpar à mão. Sem `flock`
# (macOS antigo, por exemplo) o script pula o lock de propósito, e este teste
# declara isso em vez de fingir que provou.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KIT="$REPO_ROOT/hostgator-setup-kit"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILS=0
check() {
  if "${@:2}"; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; FAILS=$((FAILS + 1)); fi
}

if ! command -v flock >/dev/null 2>&1; then
  printf '  ⚠ flock não existe nesta máquina — o lock do update.sh é pulado de propósito.\n'
  printf 'SKIP (sem flock)\n'
  exit 0
fi

# Fixture mínima: só o kit. O lock é adquirido antes de `enter_project`, então
# nada além dos dois scripts é necessário para chegar ao caso 1.
mkdir -p "$WORK/projeto/hostgator-setup-kit" "$WORK/projeto/.git"
cp "$KIT/update.sh" "$KIT/_common.sh" "$WORK/projeto/hostgator-setup-kit/"
printf 'env:\n' > "$WORK/projeto/docker-compose.prod.yml"
# Numa instalação com git o lock mora em `.git/nexus-update.lock` — é o que
# impede o próprio `git checkout` do update de tropeçar num arquivo não
# rastreado. Sem `.git`, cai em `.update.lock` (caso 4).
LOCK="$WORK/projeto/.git/nexus-update.lock"

printf '── 1. lock tomado por outro processo → rc 4, antes de qualquer efeito\n'
(
  exec 9>"$LOCK"
  flock -n 9 || exit 1
  sleep 3
) &
DONO=$!
sleep 0.4

saida="$(bash "$WORK/projeto/hostgator-setup-kit/update.sh" --to v0.0.0 2>&1)"
rc=$?
wait "$DONO" 2>/dev/null

check "saiu com 4 (recusa por lock)" [ "$rc" -eq 4 ]
check "disse que há atualização em andamento" bash -c "printf '%s' \"\$1\" | grep -q 'atualização em andamento'" _ "$saida"
check "não prometeu sucesso nem falou em versão" bash -c "printf '%s' \"\$1\" | grep -qE 'Procurando atualizações|Atualização concluída' && exit 1 || exit 0" _ "$saida"

printf '\n── 2. lock livre → não é o lock que recusa\n'
saida2="$(bash "$WORK/projeto/hostgator-setup-kit/update.sh" --to v0.0.0 2>&1)"
rc2=$?
check "não saiu com 4" [ "$rc2" -ne 4 ]
check "não mencionou lock" bash -c "printf '%s' \"\$1\" | grep -qi 'em andamento' && exit 1 || exit 0" _ "$saida2"

printf '\n── 3. dois concorrentes → exatamente um adquire\n'
(
  exec 9>"$LOCK"; flock -n 9 || exit 1; sleep 0.5
) & A=$!
sleep 0.1
bash "$WORK/projeto/hostgator-setup-kit/update.sh" --to v0.0.0 >/dev/null 2>&1
rcB=$?
wait "$A" 2>/dev/null
check "o segundo foi recusado (rc 4)" [ "$rcB" -eq 4 ]

printf '\n── 4. instalação sem git → lock clássico na raiz\n'
mkdir -p "$WORK/sem-git/hostgator-setup-kit"
cp "$KIT/update.sh" "$KIT/_common.sh" "$WORK/sem-git/hostgator-setup-kit/"
printf 'env:\n' > "$WORK/sem-git/docker-compose.prod.yml"
(
  exec 9>"$WORK/sem-git/.update.lock"; flock -n 9 || exit 1; sleep 2
) & C=$!
sleep 0.3
bash "$WORK/sem-git/hostgator-setup-kit/update.sh" --to v0.0.0 >/dev/null 2>&1
rcD=$?
wait "$C" 2>/dev/null
check "sem git, o lock da raiz também recusa (rc 4)" [ "$rcD" -eq 4 ]

printf '\n'
if [ "$FAILS" -eq 0 ]; then
  echo "OK — o lock recusa o segundo deploy antes de qualquer efeito."
  exit 0
fi
printf 'FALHOU — %d asserção(ões)\n' "$FAILS"
exit 1
