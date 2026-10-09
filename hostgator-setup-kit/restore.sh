#!/usr/bin/env bash
# Restaura o banco a partir de um dump gerado pelo backup.sh.
# CUIDADO: sobrescreve o schema/dados atuais do banco.
#
#   bash hostgator-setup-kit/restore.sh backups/db-20260702-030000.sql.gz
source "$(dirname "$0")/_common.sh"
enter_project

DUMP="${1:-}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || die "Uso: restore.sh <arquivo-db-*.sql.gz>"

c_ylw "⚠ Isto vai SOBRESCREVER o banco em $NEXT_PUBLIC_SUPABASE_URL."
read -r -p "Digite 'RESTAURAR' para confirmar: " a
[ "$a" = "RESTAURAR" ] || die "Cancelado."

step "Restaurando $DUMP"
# `psql_run`, e NÃO `docker run` cru. Num self-host o hostname da connection
# string é o NOME DO CONTAINER do banco, e o container efêmero sem `--network`
# nasce na rede `bridge`, onde esse nome não existe:
#
#   psql: error: could not translate host name "supabase_db_selfhost"
#
# `psql_run` entra no container do banco quando o hostname é o nome dele, e cai
# no container efêmero quando não — que é o caminho certo no Supabase Cloud.
#
# Isto é medido, e é o pior lugar possível para o bug estar: o `restore.sh` é o
# que se usa quando o banco quebrou. O script falhava com um erro de DNS que
# não parece com "não consegui restaurar", e o `die` saía com o dump ainda
# inteiro, sem nada having sido restaurado.
gunzip -c "$DUMP" | psql_run -f - \
  && c_grn "✓ banco restaurado" || die "Falha na restauração — veja o log acima."

c_ylw "Reinicie o app: docker compose $(dc_files) restart app"
