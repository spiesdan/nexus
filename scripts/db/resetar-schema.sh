#!/usr/bin/env bash
# =============================================================================
# `db:reset` — recria o schema do zero pelo caminho que FUNCIONA (baseline),
# não pela cadeia de 292 migrations que reprovou no replay.
# =============================================================================
# O `package.json` declarava:
#
#   "db:reset": "supabase db reset"
#
# e o `supabase db reset` aplica `supabase/migrations/` — a mesma cadeia que
# `docs/auditoria/12-migrations-e-rls.md` mediu: 35 de 292 aplicam, 257 falham
# por pré-requisito ausente, e dez arquivos da base são `SELECT 1;`. Quem
# rodava aquilo recebia um banco com 2 tabelas em `public`, zero políticas e a
# impressão de "reset feito". O caminho do cliente (`install.sh`/`update.sh`)
# nunca usou a cadeia: usa `supabase/baseline.sql`.
#
# Este script faz o equivalente destrutivo do install:
#   1. derruba o schema do produto (`public`, `private`) e as extensões que o
#      baseline supõe instaladas EM `public` (vector, citext, pg_trgm);
#   2. restabelece o DEFAULT ACL que todo projeto Supabase já tem ANTES de
#      qualquer SQL nosso — sem isso, as funções criadas no CORPO do baseline
#      nascem sem `EXECUTE` para anon e o reset produz um banco mais fechado
#      que o do cliente (ver scripts/sql/preambulo-supabase-descartavel.sql);
#   3. aplica `supabase/baseline.sql` com `ON_ERROR_STOP=1` e VERIFICA o
#      schema, pelo mesmo `scripts/db/aplicar-schema.sh` do `db:migrate`.
#
# O que ele NÃO faz: mexer em `auth`, `storage`, `extensions` ou nos roles. Isso
# é bootstrap do Supabase (ou do preâmbulo do banco descartável), não SQL nosso.
#
# SEGURANÇA. É destrutivo por definição. Só roda contra host local por padrão;
# contra qualquer outro host exige `--forcar`, porque o custo de apagar o banco
# de produção por engano é a instalação inteira.
#
# Uso:
#   SUPABASE_DB_URL=postgres://... pnpm db:reset
#   SUPABASE_DB_URL=postgres://... bash scripts/db/resetar-schema.sh --forcar
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FORCAR=0

for arg in "$@"; do
  case "$arg" in
    # `pnpm run x -- --flag` entrega o `--` literal para o script (pnpm 9).
    # Tratá-lo como erro fazia a única forma documentada de forçar falhar.
    --) ;;
    --forcar) FORCAR=1 ;;
    -h|--help)
      sed -n '5,45p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "argumento desconhecido: $arg" >&2
      echo "uso: bash scripts/db/resetar-schema.sh [--forcar]" >&2
      exit 2
      ;;
  esac
done

URL="${SUPABASE_DB_URL:-}"
if [ -z "$URL" ]; then
  echo "ERRO: SUPABASE_DB_URL não está definida." >&2
  echo "" >&2
  echo "  Nada foi apagado. Defina a connection string direta do Postgres do" >&2
  echo "  AMBIENTE DE DESENVOLVIMENTO (não a de produção) e rode de novo." >&2
  exit 1
fi

# Mascarar credenciais. `postgres://user:senha@host:5432/db` -> `postgres://***@host:5432/db`
mascarada() { printf '%s' "$1" | sed -E 's#(://)[^@/]*@#\1***@#'; }

host_da_url() {
  printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://([^@/]*@)?(\[[^]]*\]|[^:/?]+).*#\2#' \
    | sed -E 's#^\[(.*)\]$#\1#'
}

HOST="$(host_da_url "$URL")"
case "$HOST" in
  localhost|127.0.0.1|::1|0.0.0.0|host.docker.internal|postgres|db) ;;
  *)
    if [ "$FORCAR" != 1 ]; then
      echo "ERRO: host '$HOST' não é local." >&2
      echo "" >&2
      echo "  Este comando APAGA o schema do produto e não distingue dev de" >&2
      echo "  produção. Se o alvo é mesmo esse banco, repita com --forcar:" >&2
      echo "    SUPABASE_DB_URL=… pnpm db:reset -- --forcar" >&2
      exit 1
    fi
    ;;
esac

psql_stdin() {
  if command -v psql >/dev/null 2>&1; then
    psql "$URL" "$@"
  else
    docker run --rm -i postgres:17-alpine psql "$URL" "$@"
  fi
}

echo "==> RESET do schema do produto em $(mascarada "$URL")"
echo "    host: $HOST"
echo "    isto APAGA os dados do ambiente alvo. Aplicando: public, private e as"
echo "    extensões instaladas em public (vector, citext, pg_trgm)."
echo ""

if ! psql_stdin -v ON_ERROR_STOP=1 -q -f - <<'SQL'
-- Só o que o baseline cria. `auth`, `storage`, `extensions` e os roles são
-- bootstrap do Supabase e ficam como estão.
--
-- As extensões vêm ANTES do schema, de propósito: estas três vivem EM `public`
-- (as do `extensions` — uuid-ossp e pgcrypto — ficam), e o baseline não as
-- cria (é pg_dump). Derrubar o schema primeiro já as levaria junto e os `drop
-- extension` virariam "does not exist, skipping" — o comando continuaria certo,
-- mas o script mentiria sobre o que fez.
drop extension if exists vector cascade;
drop extension if exists citext cascade;
drop extension if exists pg_trgm cascade;

drop schema if exists public cascade;
drop schema if exists private cascade;

create schema public;

-- ACL e DEFAULT ACL de um projeto Supabase, restabelecidos ANTES do baseline.
-- A ordem importa: o baseline só emite `alter default privileges` na linha
-- ~4900, depois de criar as tabelas do corpo — sem estas linhas, as funções
-- criadas no CORPO nasceriam sem EXECUTE para anon e o reset não reproduziria o
-- banco do cliente.
--
-- FUNÇÕES apenas. Tabelas e sequências NÃO entram aqui, e a ausência é medida:
-- com `grant all on tables to anon` ANTES do baseline, toda tabela criada herda
-- o grant e o `revoke` explícito do dump deixa de ser o que decide. Resultado
-- medido em 2026-11-18 (scripts/auditoria/prova-f09.sh, seção 5): o reset
-- concedia `anon` em `ai_agent_runs` — tabela em que o baseline concede SÓ a
-- `authenticated`/`service_role` de propósito. Dev ficava mais aberto que a
-- instalação. O ACL canônico é o que o baseline emite, tabela por tabela.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public;

-- O baseline referencia estes tipos/operadores e supõe as extensões presentes.
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;
SQL
then
  echo "" >&2
  echo "ERRO: falhou ao derrubar ou preparar o schema." >&2
  echo "       O banco pode estar pela metade. NÃO use este banco até rodar de novo." >&2
  exit 1
fi

echo "==> schema zerado; aplicando o baseline (o mesmo do install/update)"
if ! bash "$ROOT/scripts/db/aplicar-schema.sh"; then
  echo "" >&2
  echo "ERRO: o baseline não aplicou. O banco está INCOMPLETO." >&2
  exit 1
fi

echo ""
echo "==> reset concluído: schema do produto recriado pelo baseline"
