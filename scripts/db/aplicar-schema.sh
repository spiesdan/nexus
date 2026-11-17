#!/usr/bin/env bash
# =============================================================================
# O ÚNICO CAMINHO DE SCHEMA QUE FUNCIONA — e a verificação que prova que ele
# funcionou.
# =============================================================================
# Substitui o placeholder que existia em `package.json`:
#
#   "db:migrate": "echo 'TODO: wire supabase db push or pg-migrate' && exit 0"
#
# Um script que imprime TODO e sai com 0 não é um passo de migração: é uma
# afirmação falsa com código de saída de sucesso. Quem rodava `pnpm db:migrate`
# (inclusive o `scripts/deploy.sh`, com `|| true` em cima) ficava com o schema
# que já existia e a certeza de que a migração tinha rodado.
#
# POR QUE NÃO `supabase db push`. A cadeia de 292 migrations NÃO reproduz o
# schema: `docs/auditoria/evidencias/replay-migrations/` mede o resultado e
# `docs/auditoria/12-migrations-e-rls.md` registra a causa. Dez migrations da
# base (0001–0009, 0013) são stubs `SELECT 1;` — o schema delas foi aplicado
# out-of-band via Supabase MCP e nunca foi escrito de volta em SQL. Aplicar a
# cadeia num banco limpo cria um schema parcial, e `db push` ainda MARCA as
# migrations como aplicadas. Seria piorar a mentira, não corrigi-la.
#
# O caminho suportado é o mesmo do `install.sh`/`update.sh` do kit e o mesmo que
# o README manda o operador rodar: aplicar `supabase/baseline.sql`, que é
# idempotente (o `update.sh` re-aplica sobre banco com dados).
#
# Uso:
#   SUPABASE_DB_URL=postgres://... bash scripts/db/aplicar-schema.sh
#   SUPABASE_DB_URL=postgres://... bash scripts/db/aplicar-schema.sh --verificar
#
# `--verificar` NÃO escreve nada: só prova que o schema do produto está lá. É o
# modo seguro para rodar em deploy (o schema é do kit; o deploy não deve mutar).
#
# A URL nunca é impressa: ela carrega a senha do banco. Só host/banco.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$ROOT/supabase/baseline.sql"
SOMENTE_VERIFICAR=0

for arg in "$@"; do
  case "$arg" in
    --verificar|--verificar-somente|--check) SOMENTE_VERIFICAR=1 ;;
    -h|--help)
      sed -n '5,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "argumento desconhecido: $arg" >&2
      echo "uso: bash scripts/db/aplicar-schema.sh [--verificar]" >&2
      exit 2
      ;;
  esac
done

URL="${SUPABASE_DB_URL:-}"
if [ -z "$URL" ]; then
  echo "ERRO: SUPABASE_DB_URL não está definida." >&2
  echo "" >&2
  echo "  O schema NÃO foi aplicado e nada foi alterado. Defina a connection" >&2
  echo "  string direta do Postgres (Project Settings → Database → Connection" >&2
  echo "  string, modo 'URI') e rode de novo. O self-host a tem em .env." >&2
  exit 1
fi

# Mascarar credenciais. `postgres://user:senha@host:5432/db` -> `postgres://***@host:5432/db`
mascarada() { printf '%s' "$1" | sed -E 's#(://)[^@/]*@#\1***@#'; }

hash_arquivo() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# O psql do host quando existe; senão o do container oficial. O kit usa a mesma
# imagem, então o cliente é o mesmo que o cliente final tem.
psql_stdin() {
  if command -v psql >/dev/null 2>&1; then
    psql "$URL" "$@"
  else
    docker run --rm -i postgres:17-alpine psql "$URL" "$@"
  fi
}

aplicar_baseline() {
  if command -v psql >/dev/null 2>&1; then
    psql "$URL" -v ON_ERROR_STOP=1 -q -f "$BASELINE"
  else
    docker run --rm -i -v "$BASELINE:/baseline.sql:ro" postgres:17-alpine \
      psql "$URL" -v ON_ERROR_STOP=1 -q -f /baseline.sql
  fi
}

echo "==> schema do produto em $(mascarada "$URL")"

if [ "$SOMENTE_VERIFICAR" = 1 ]; then
  echo "    modo: --verificar (nenhuma escrita)"
else
  [ -f "$BASELINE" ] || { echo "ERRO: $BASELINE não encontrado" >&2; exit 1; }
  echo "    baseline: $BASELINE"
  echo "    sha256:   $(hash_arquivo "$BASELINE")"
  echo "    aplicando com ON_ERROR_STOP=1 (idempotente — seguro sobre banco com dados)"
  if ! aplicar_baseline; then
    echo "" >&2
    echo "ERRO: o baseline falhou. Nada foi dado como aplicado." >&2
    echo "       A mensagem do Postgres está acima. NÃO siga para o deploy." >&2
    exit 1
  fi
  echo "    baseline aplicado"
fi

# -----------------------------------------------------------------------------
# VERIFICAÇÃO — porque "o psql terminou" não é o mesmo que "o schema está lá".
# -----------------------------------------------------------------------------
# Lista os objetos SEM OS QUAIS o app não funciona. É piso, não inventário: o
# inventário completo é o do replay de migrations.
echo ""
echo "==> verificando o schema que o app exige"
# `faltando` VAZIO é ambíguo: pode ser "nada falta" ou "o psql não conectou".
# Sem separar os dois, banco fora do ar virava sucesso — o mesmo defeito do
# placeholder original, com outra roupa. O status do psql decide.
if ! faltando="$(
  psql_stdin -t -A -v ON_ERROR_STOP=1 -f - <<'SQL'
select 'tabela public.' || v.n
from (values
  ('organizations'), ('user_organizations'), ('contacts'), ('conversations'),
  ('messages'), ('crm_pipelines'), ('crm_stages'), ('crm_leads'),
  ('ai_agents'), ('event_log'), ('api_tokens')
) v(n)
where not exists (
  select 1 from pg_class c
  join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname = v.n and c.relkind in ('r', 'p')
);

select 'funcao public.fn_user_org_ids'
where not exists (
  select 1 from pg_proc p
  join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname = 'fn_user_org_ids'
);

select 'rls em public.' || c.relname
from pg_class c
join pg_namespace s on s.oid = c.relnamespace
where s.nspname = 'public'
  and c.relname in ('organizations', 'user_organizations', 'contacts', 'conversations', 'messages')
  and not c.relrowsecurity;

select 'politica em public.organizations'
where not exists (
  select 1 from pg_policies where schemaname = 'public' and tablename = 'organizations'
);
SQL
)"; then
  echo "" >&2
  echo "ERRO: não foi possível consultar o banco (conexão, DNS, TLS ou permissão)." >&2
  echo "       A mensagem do psql está acima. Isto NÃO é 'schema ok'." >&2
  exit 1
fi

if [ -n "$faltando" ]; then
  echo "    FALTANDO:" >&2
  printf '%s\n' "$faltando" | sed 's/^/      - /' >&2
  echo "" >&2
  echo "ERRO: o banco não tem o schema do produto. Não é um deploy válido." >&2
  exit 1
fi

contagens="$(
  psql_stdin -t -A -F ' ' -v ON_ERROR_STOP=1 -f - <<'SQL'
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE') as tabelas,
  (select count(*) from pg_policies where schemaname = 'public') as politicas;
SQL
)"
echo "    ok: objetos exigidos presentes ($contagens)"
echo ""
echo "==> schema pronto"
