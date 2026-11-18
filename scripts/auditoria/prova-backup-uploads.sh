#!/usr/bin/env bash
# F-32/D9 — prova ponta a ponta do backup/restore de UPLOADS, com docker de verdade.
#
# O teste de shell (`tests/shell/backup-uploads.test.sh`) mede a DECISÃO com
# dublê. Este script mede o TRANSPORTE: volume Docker real, bind real, `tar` de
# verdade — porque foi justamente aqui que a primeira versão falhou de um jeito
# que o dublê não pegava (`-v backups:/out` vira VOLUME nomeado, não diretório:
# o tar "dava certo" e o arquivo não aparecia no host).
#
# O ciclo, num projeto descartável em tmp:
#   1. semeia arquivos no bind de fotos e num volume;
#   2. `--listar` descobre as duas superfícies;
#   3. `--backup` gera os `.tgz`;
#   4. apaga os dois destinos (perda simulada);
#   5. `--restore` devolve cada um;
#   6. compara CONTEÚDO (sha256) — não só existência;
#   7. destino com conteúdo recusa sem `--substituir`.
#
#   bash scripts/auditoria/prova-backup-uploads.sh
#
# Evidência: docs/auditoria/evidencias/f32/prova-<timestamp>.txt
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KIT="$RAIZ/hostgator-setup-kit"
EVIDENCIAS="$RAIZ/docs/auditoria/evidencias/f32"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$EVIDENCIAS/prova-$TS.txt"
PROJ="$(mktemp -d "${TMPDIR:-/tmp}/prova-uploads.XXXXXX")/prova-uploads"
# O nome tem de ser EXATAMENTE `${projeto}_waha-media`, que é o que
# `uploads_do_projeto` procura — um sufixo de PID aqui fazia a descoberta achar
# outro volume e a prova medir o alvo errado (o dublê de teste não pegava).
VOLUME="prova-uploads_waha-media"

mkdir -p "$EVIDENCIAS"

FALHAS=0
registra() { printf '%s\n' "$*" | tee -a "$LOG"; }
secao() { registra ""; registra "── $* ─────────────────────────────────────────"; }
falhou() { registra "  ✗ $*"; FALHAS=$((FALHAS + 1)); }
ok() { registra "  ✓ $*"; }

limpa() {
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  rm -rf "$(dirname "$PROJ")"
}
trap limpa EXIT

: > "$LOG"
registra "F-32/D9 — backup e restore de uploads (docker real)"
registra "quando:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
registra "commit:  $(git -C "$RAIZ" rev-parse --short HEAD)"
registra "imagem:  alpine:3.20 (tar/sh) · Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null)"

secao "1. Projeto descartável e superfícies"
mkdir -p "$PROJ/hostgator-setup-kit" "$PROJ/fotos/sub" "$PROJ/backups"
cp "$KIT/_common.sh" "$KIT/backup-uploads.sh" "$PROJ/hostgator-setup-kit/"
printf 'SUPABASE_DB_URL=postgres://duble/db\n' > "$PROJ/.env"
printf 'services:\n  app:\n    volumes:\n      - %s/fotos:/data/product-images\n' "$PROJ" \
  > "$PROJ/docker-compose.prod.yml"
printf 'foto-1\n' > "$PROJ/fotos/a.jpg"
printf 'foto-2\n' > "$PROJ/fotos/b.jpg"
printf 'foto-3\n' > "$PROJ/fotos/sub/c.jpg"
docker volume create "$VOLUME" >/dev/null
docker run --rm -v "$VOLUME:/data" alpine:3.20 sh -c \
  'mkdir -p /data/sub && printf audio-1 > /data/x.ogg && printf audio-2 > /data/sub/y.ogg'
ok "bind com 3 fotos (1 em subdiretório) e volume com 2 arquivos"

LISTA="$( cd "$PROJ" && bash hostgator-setup-kit/backup-uploads.sh --listar )"
registra "$LISTA" | sed 's/^/    /'
printf '%s' "$LISTA" | grep -q "product-images" && ok "lista traz product-images" || falhou "lista sem product-images"
printf '%s' "$LISTA" | grep -q "waha-media" && ok "lista traz waha-media" || falhou "lista sem waha-media"

secao "2. Backup"
SAIDA_BKP="$( cd "$PROJ" && bash hostgator-setup-kit/backup-uploads.sh --backup backups "$TS" 2>&1 )"
registra "$SAIDA_BKP" | sed 's/^/    /'
ARQ_FOTOS="$PROJ/backups/uploads-product-images-$TS.tgz"
ARQ_MIDIA="$PROJ/backups/uploads-waha-media-$TS.tgz"
[ -f "$ARQ_FOTOS" ] && ok "arquivo das fotos existe" || falhou "arquivo das fotos não existe"
[ -f "$ARQ_MIDIA" ] && ok "arquivo da mídia existe" || falhou "arquivo da mídia não existe"
tar -tzf "$ARQ_FOTOS" 2>/dev/null | grep -q './sub/c.jpg' && ok "fotos: subdiretório entrou no tar" || falhou "fotos: subdiretório fora"
tar -tzf "$ARQ_MIDIA" 2>/dev/null | grep -q './sub/y.ogg' && ok "mídia: subdiretório entrou no tar" || falhou "mídia: subdiretório fora"

secao "3. Perda simulada"
rm -rf "$PROJ/fotos" && mkdir -p "$PROJ/fotos"
docker run --rm -v "$VOLUME:/data" alpine:3.20 sh -c 'rm -rf /data/*'
ok "bind esvaziado; volume esvaziado"

secao "4. Restore e conferência de CONTEÚDO"
restaura() { # restaura <arquivo> <rótulo>
  local saida
  saida="$( cd "$PROJ" && bash hostgator-setup-kit/backup-uploads.sh --restore "$1" 2>&1 )"
  registra "$saida" | sed 's/^/    /'
}
restaura "$ARQ_FOTOS" fotos
restaura "$ARQ_MIDIA" midia

CONTA_FOTOS="$(find "$PROJ/fotos" -type f | wc -l | tr -d ' ')"
[ "$CONTA_FOTOS" = 3 ] && ok "fotos restauradas: 3 arquivos" || falhou "fotos restauradas: $CONTA_FOTOS (esperado 3)"
[ "$(cat "$PROJ/fotos/a.jpg" 2>/dev/null)" = "foto-1" ] && ok "conteúdo da foto confere (foto-1)" || falhou "conteúdo da foto divergiu"
[ "$(cat "$PROJ/fotos/sub/c.jpg" 2>/dev/null)" = "foto-3" ] && ok "conteúdo do subdiretório confere (foto-3)" || falhou "subdiretório divergiu"

MIDIA_DENTRO="$(docker run --rm -v "$VOLUME:/data" alpine:3.20 sh -c 'find /data -type f | sort | tr "\n" " "')"
CONTA_MIDIA="$(docker run --rm -v "$VOLUME:/data" alpine:3.20 sh -c 'find /data -type f | wc -l' | tr -d ' ')"
[ "$CONTA_MIDIA" = 2 ] && ok "mídia restaurada: 2 arquivos ($MIDIA_DENTRO)" || falhou "mídia restaurada: $CONTA_MIDIA (esperado 2)"
[ "$(docker run --rm -v "$VOLUME:/data" alpine:3.20 cat /data/x.ogg 2>/dev/null)" = "audio-1" ] \
  && ok "conteúdo da mídia confere (audio-1)" || falhou "conteúdo da mídia divergiu"

secao "5. Recusa de sobrescrita"
printf 'novo\n' > "$PROJ/fotos/novo.jpg"
( cd "$PROJ" && bash hostgator-setup-kit/backup-uploads.sh --restore "$ARQ_FOTOS" >/dev/null 2>&1 )
[ $? -ne 0 ] && ok "destino com conteúdo recusa sem --substituir" || falhou "sobrescreveu sem pedir"
[ -f "$PROJ/fotos/novo.jpg" ] && ok "e não apagou o arquivo que já estava lá" || falhou "apagou arquivo alheio"

secao "Veredito"
if [ "$FALHAS" = 0 ]; then
  registra "PASSOU — backup e restore preservaram conteúdo no bind e no volume, e a sobrescrita é explícita."
else
  registra "FALHOU — $FALHAS verificação(ões)."
fi
registra ""
registra "O que esta prova NÃO cobre:"
registra "  · Storage no Supabase Cloud (bucket é do provedor; cópia exige API do Storage)"
registra "  · certificado A1 (excluído por decisão: credencial em claro)"
registra ""
registra "evidência: ${LOG#"$RAIZ"/}"

exit "$FALHAS"
