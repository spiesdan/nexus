#!/usr/bin/env bash
# F-32/D9 — o backup e o restore dos UPLOADS.
#
# O dump do banco não leva arquivo. Este teste mede a DECISÃO dos scripts, com
# `docker` dublado e diretórios reais num tmp:
#
#   1. as superfícies são descobertas (bind de fotos, `waha-media`, Storage
#      próprio) e a lista é a MESMA para backup e restore;
#   2. o backup produz `.tgz` legível, com conteúdo, permissão 600;
#   3. o restore recusa destino COM conteúdo (não sobrescreve mídia nova) e
#      aceita com `--substituir`;
#   4. arquivo corrompido e rótulo desconhecido falham ANTES de escrever;
#   5. `backup.sh` chama o passo de uploads e aplica a retenção de 14;
#   6. superfície que falha faz o backup sair 1 (backup parcial não é "ok").
#
#   bash tests/shell/backup-uploads.test.sh
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KIT="$RAIZ/hostgator-setup-kit"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/backup-uploads.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
FALHAS=0

ok()   { printf '✓ %s\n' "$1"; }
ruim() { printf '✗ %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
espera() { if [ "$2" = "ok" ]; then ok "$1"; else ruim "$1"; fi }

# ── projeto falso ───────────────────────────────────────────────────────────
monta() {
  local dir="$TMP/projeto"
  mkdir -p "$dir/hostgator-setup-kit" "$dir/bin" "$dir/uploads" "$dir/vols" "$dir/backups"
  cp "$KIT/_common.sh" "$dir/hostgator-setup-kit/_common.sh"
  cp "$KIT/backup-uploads.sh" "$dir/hostgator-setup-kit/backup-uploads.sh"
  cp "$KIT/backup.sh" "$dir/hostgator-setup-kit/backup.sh"
  printf 'FOTOS=%s\nSUPABASE_DB_URL=postgres://duble/db\n' "$dir/uploads" > "$dir/.env"
  cat > "$dir/docker-compose.prod.yml" <<EOF
services:
  app:
    volumes:
      - $dir/uploads:/data/product-images
EOF
  printf 'arquivo de foto\n' > "$dir/uploads/foto.jpg"
  mkdir -p "$dir/vols/$(basename "$dir")_waha-media" "$dir/vols/storage-vol"
  printf 'audio\n' > "$dir/vols/$(basename "$dir")_waha-media/a.ogg"
  printf 'blob\n' > "$dir/vols/storage-vol/b.bin"

  cat > "$dir/bin/docker" <<'STUB'
#!/usr/bin/env bash
# Dublê do docker: mapeia `-v <volume>:/x` para um diretório do teste e executa
# o comando de tar/sh localmente. Tudo que o script DECIDE passa por aqui.
D="$PROJ"
VOLS="$D/vols"
args=("$@")

case "${1:-}" in
  volume)
    # volume inspect <nome>
    [ -d "$VOLS/${3:-}" ]
    exit $?
    ;;
  ps)
    if [ "${COM_STORAGE:-0}" = "1" ]; then echo "fake-storage"; fi
    exit 0
    ;;
  inspect)
    echo "storage-vol"
    exit 0
    ;;
  compose)
    # `dc config --volumes` — usado pelo backup.sh para achar waha-data.
    echo "waha-data"
    exit 0
    ;;
esac

if [ "${1:-}" = "run" ]; then
  shift
  mapa=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --rm|-i|-t) shift ;;
      -u) shift 2 ;;
      -v)
        src="${2%%:*}"
        dst="$(printf '%s' "$2" | awk -F: '{print $2}')"
        if [ -d "$src" ]; then mapa+=("$dst=$src"); else mapa+=("$dst=$VOLS/$(basename "$src")"); fi
        shift 2
        ;;
      postgres:*|alpine:*|*/*)
        shift; break
        ;;
      *) break ;;
    esac
  done
  # Traduz os caminhos internos (/data, /out, /in) e roda o comando local.
  traduz() {
    local s="$1" par dst src
    for par in "${mapa[@]}"; do
      dst="${par%%=*}"; src="${par#*=}"
      s="${s//$dst/$src}"
    done
    printf '%s' "$s"
  }
  cmd=()
  for a in "$@"; do cmd+=("$(traduz "$a")"); done
  # pg_dump: o backup.sh exige >4 KiB e gzip válido.
  if [ "${cmd[0]:-}" = "pg_dump" ]; then
    head -c 6000 /dev/urandom | gzip
    exit 0
  fi
  "${cmd[@]}"
  exit $?
fi

exit 0
STUB
  chmod +x "$dir/bin/docker"
  echo "$dir"
}

roda() { # roda <dir> <comando...>
  local dir="$1"; shift
  ( cd "$dir" && PATH="$dir/bin:$PATH" PROJ="$dir" "$@" )
}

# ── 1. descoberta ───────────────────────────────────────────────────────────
dir="$(monta)"
saida="$(roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --listar 2>&1)"
espera "descobre as fotos em disco (bind)" \
  "$(printf '%s\n' "$saida" | grep -q "product-images	bind	$dir/uploads" && echo ok || echo nao)"
espera "descobre o volume waha-media" \
  "$(printf '%s\n' "$saida" | grep -q "waha-media	volume	$(basename "$dir")_waha-media" && echo ok || echo nao)"
espera "sem Storage próprio, não inventa superfície de storage" \
  "$(printf '%s\n' "$saida" | grep -q '^storage' && echo nao || echo ok)"
COM_STORAGE=1
saida="$(COM_STORAGE=1 roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --listar 2>&1)"
espera "com Storage próprio (storage-api), descobre o volume" \
  "$(printf '%s\n' "$saida" | grep -q 'storage	volume	storage-vol' && echo ok || echo nao)"
unset COM_STORAGE

# ── 2. backup ───────────────────────────────────────────────────────────────
roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --backup "$dir/backups" 20261118-120000 >/dev/null 2>&1
arq_fotos="$dir/backups/uploads-product-images-20261118-120000.tgz"
espera "backup cria o .tgz das fotos" "$([ -f "$arq_fotos" ] && echo ok || echo nao)"
espera "o .tgz abre e contém o arquivo" \
  "$(tar -tzf "$arq_fotos" 2>/dev/null | grep -q './foto.jpg' && echo ok || echo nao)"
espera "o .tgz não é legível por outros usuários (600)" \
  "$([ "$(stat -c '%a' "$arq_fotos" 2>/dev/null || stat -f '%Lp' "$arq_fotos")" = "600" ] && echo ok || echo nao)"
espera "backup do volume waha-media também foi criado" \
  "$([ -f "$dir/backups/uploads-waha-media-20261118-120000.tgz" ] && echo ok || echo nao)"
espera "e contém o arquivo do volume" \
  "$(tar -tzf "$dir/backups/uploads-waha-media-20261118-120000.tgz" 2>/dev/null | grep -q './a.ogg' && echo ok || echo nao)"

# ── 3. restore ──────────────────────────────────────────────────────────────
# 3a. recuperação de desastre: destino VAZIO restaura sem flag.
rm -rf "$dir/uploads"/* 
roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --restore "$arq_fotos" >/dev/null 2>&1
espera "restore em destino VAZIO recupera foto.jpg (recuperação de desastre)" \
  "$([ -f "$dir/uploads/foto.jpg" ] && echo ok || echo nao)"

# 3b. destino COM conteúdo: recusa, e não apaga o que está lá.
printf 'novo\n' > "$dir/uploads/novo.jpg"
espera "restore em destino COM conteúdo falha sem --substituir" \
  "$(roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --restore "$arq_fotos" >/dev/null 2>&1 \
       && echo nao || echo ok)"
espera "e não apagou o arquivo que já estava lá" \
  "$([ -f "$dir/uploads/novo.jpg" ] && echo ok || echo nao)"

# 3c. --substituir sobrescreve o que veio no arquivo, sem apagar o resto.
printf 'conteudo diferente\n' > "$dir/uploads/foto.jpg"
roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --restore "$arq_fotos" --substituir >/dev/null 2>&1
espera "com --substituir, sobrescreve o arquivo existente" \
  "$([ "$(cat "$dir/uploads/foto.jpg")" = "arquivo de foto" ] && echo ok || echo nao)"
espera "e mantém o arquivo que não estava no backup (novo.jpg)" \
  "$([ -f "$dir/uploads/novo.jpg" ] && echo ok || echo nao)"

# ── 4. falhas que não podem tocar em nada ───────────────────────────────────
head -c 100 "$arq_fotos" > "$dir/backups/corrompido.tgz"
espera "arquivo truncado falha antes de escrever" \
  "$(roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --restore "$dir/backups/corrompido.tgz" >/dev/null 2>&1 && echo nao || echo ok)"
saida_desc="$(cp "$arq_fotos" "$dir/backups/uploads-desconhecido-20261118-120000.tgz"; \
  roda "$dir" bash hostgator-setup-kit/backup-uploads.sh --restore "$dir/backups/uploads-desconhecido-20261118-120000.tgz" 2>&1)"
espera "rótulo desconhecido falha e diz as superfícies conhecidas" \
  "$(printf '%s' "$saida_desc" | grep -q 'não achei a superfície' && echo ok || echo nao)"
[ "${FALHAS:-0}" = 0 ] || printf '  (saída do restore desconhecido: %s)\n' "$saida_desc"

# ── 5. backup.sh integra e retém 14 ─────────────────────────────────────────
for i in $(seq -w 1 15); do
  : > "$dir/backups/uploads-product-images-20260101-0000$i.tgz"
  sleep 0.01
done
roda "$dir" bash hostgator-setup-kit/backup.sh >/dev/null 2>&1
espera "backup.sh gerou uploads-product-images-<hoje>" \
  "$(ls "$dir"/backups/uploads-product-images-"$(date +%Y%m%d)"-*.tgz 2>/dev/null | grep -q . && echo ok || echo nao)"
qtd_fotos="$(ls -1 "$dir"/backups/uploads-product-images-*.tgz 2>/dev/null | wc -l | tr -d ' ')"
espera "retenção mantém 14 uploads-product-images (não 15+) — medido $qtd_fotos" \
  "$([ "$qtd_fotos" -le 14 ] && echo ok || echo nao)"

# ── 5b. retenção é configurável: BACKUP_RETENTION=3 mantém 3, não 14 ────────
# 14 dias cobre um deploy quebrado no fim de semana; não cobre o fechamento do
# mês. Quem emite nota escolhe quanto guardar sem editar o script.
BACKUP_RETENTION=3 roda "$dir" bash hostgator-setup-kit/backup.sh >/dev/null 2>&1
qtd3="$(ls -1 "$dir"/backups/uploads-product-images-*.tgz 2>/dev/null | wc -l | tr -d ' ')"
espera "BACKUP_RETENTION=3 mantém 3 uploads — medido $qtd3" \
  "$([ "$qtd3" -eq 3 ] && echo ok || echo nao)"

# ── 6. falha de superfície derruba o backup ─────────────────────────────────
chmod 000 "$dir/uploads" 2>/dev/null || true
roda "$dir" bash hostgator-setup-kit/backup.sh >/dev/null 2>&1
rc=$?
chmod 755 "$dir/uploads" 2>/dev/null || true
espera "superfície de uploads ilegível faz backup.sh sair != 0" \
  "$([ "$rc" != 0 ] && echo ok || echo nao)"

printf '\n'
if [ "$FALHAS" = 0 ]; then
  printf '✓ backup/restore de uploads: todos os casos passaram\n'
else
  printf '✗ %s caso(s) falharam\n' "$FALHAS"
fi
exit "$FALHAS"
