#!/usr/bin/env bash
# Backup: dump do banco (Supabase) + snapshot das sessões do WhatsApp.
# Supabase free NÃO tem backup automático — rode isto num cron diário.
#
#   crontab -e →  0 3 * * *  cd /caminho/deskcommcrm && bash hostgator-setup-kit/backup.sh
source "$(dirname "$0")/_common.sh"
enter_project

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
mkdir -p "$BACKUP_DIR"
# Timestamp vem do host (não do script) pra manter determinismo do kit.
ts="$(date +%Y%m%d-%H%M%S)"

step "Dump do banco → $BACKUP_DIR/db-$ts.sql.gz"
# Pela conexão de SCHEMA (url_do_schema), não pela do app: `pg_dump` só despeja
# o que a role enxerga, e com uma role menor — a que recomendamos no `.env` de
# quem usa Supabase próprio — o backup sai PARCIAL e sai verde. Falha silenciosa
# de backup é a pior das falhas: só aparece na hora de restaurar.
#
# `pg_dump_run` (e não um `docker run` solto aqui): num self-host o hostname da
# connection string é o nome do container do banco, e o container efêmero sem
# `--network` não resolve esse nome. Medido nesta VPS: o `docker run` antigo
# falhava com "could not translate host name", e o `| gzip >` escrevia MESMO
# ASSIM um arquivo de 20 bytes — um gzip vazio, que `zcat` não devolve nada.
# Cinco backups seguidos assim, todos "✓ banco: 20".
#
# A checagem de tamanho é o que fecha o buraco: mesmo que o `pg_dump` falhe de
# outro jeito no futuro, um dump que não passou de um piso é recusado com
# erro, em vez de virar mais um arquivo que "existe".
pg_dump_run | gzip > "$BACKUP_DIR/db-$ts.sql.gz"

# Piso: um banco vazio de verdade já produz mais que isso, e um `pg_dump` que
# não conecta produz 20 bytes. 4 KiB é folgado para o pior caso real e
# impossível de confundir com "não houve dump".
bytes_dump="$(wc -c < "$BACKUP_DIR/db-$ts.sql.gz" | tr -d ' ')"
if [ "$bytes_dump" -lt 4096 ]; then
  c_red "✗ o dump do banco saiu com $bytes_dump bytes — isso é um arquivo VAZIO, não um backup."
  c_red "✗ NÃO confie neste backup. O banco NÃO foi copiado."
  rm -f "$BACKUP_DIR/db-$ts.sql.gz"
  exit 1
fi
c_grn "✓ banco: $(du -h "$BACKUP_DIR/db-$ts.sql.gz" | awk '{print $1}')"

step "Snapshot das sessões do WhatsApp → $BACKUP_DIR/waha-$ts.tgz"
vol="$(dc config --volumes 2>/dev/null | grep -m1 waha-data || echo '')"
proj="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
docker run --rm -v "${proj}_waha-data:/data:ro" -v "$BACKUP_DIR:/out" alpine:3.20 \
  tar czf "/out/waha-$ts.tgz" -C /data . 2>/dev/null \
  && c_grn "✓ sessões WhatsApp salvas" \
  || c_ylw "⚠ não achei o volume waha-data (nome pode variar). Ajuste manualmente se necessário."

# Retenção: mantém os 14 mais recentes de cada tipo.
step "Limpando backups antigos (mantém 14)"
ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$BACKUP_DIR"/waha-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
c_grn "✓ backup concluído em $BACKUP_DIR"
