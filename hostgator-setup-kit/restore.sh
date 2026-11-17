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

# ── Privilégios: o dump ANTIGO não os carrega (F-32) ────────────────────────
#
# Medido no ensaio de restauração (`scripts/auditoria/ensaio-de-restore.sh`):
# um dump feito com `pg_dump --no-privileges` restaura sem nenhum GRANT, e o
# role `authenticated` recebe "permission denied for table messages". O banco
# volta com as linhas e as policies, e o app fica sem acesso — exatamente na
# hora em que ninguém pode depurar.
#
# O backup NOVO já carrega os privilégios (`pg_dump_run` deixou de passar
# `--no-privileges`). Este bloco existe pelo backup VELHO: se o role do app não
# consegue ler, re-aplicamos o `baseline.sql` — idempotente e já usado em toda
# atualização sobre banco com dados —, que recria grants, DEFAULT ACL e o que
# faltar. Depois disso, o teste é o mesmo: ou lê, ou o restore falha alto.
if [ -f "$PROJECT_DIR/supabase/baseline.sql" ]; then
  pode_ler="$(psql_run -tA -c "select has_table_privilege('authenticated','public.contacts','SELECT');" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$pode_ler" != "t" ]; then
    c_ylw "⚠ o dump não trouxe os privilégios do app (backup antigo) — re-aplicando o schema para recriá-los"
    cat "$PROJECT_DIR/supabase/baseline.sql" | psql_run -f - >/dev/null 2>&1 || true
    pode_ler="$(psql_run -tA -c "select has_table_privilege('authenticated','public.contacts','SELECT');" 2>/dev/null | tr -d '[:space:]' || true)"
    if [ "$pode_ler" != "t" ]; then
      die "O banco foi restaurado, mas o role do app continua SEM acesso à tabela contacts.
     NÃO suba o app assim. Restaure de novo com o backup novo, ou aplique supabase/baseline.sql
     pela conexão do dono (SUPABASE_DB_ADMIN_URL) antes de reiniciar."
    fi
    c_grn "✓ privilégios recriados pelo baseline"
  fi
fi

c_ylw "Reinicie o app: docker compose $(dc_files) restart app"
