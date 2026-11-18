#!/usr/bin/env bash
# F-09 — PROVA DO CAMINHO ÚNICO (baseline.sql), em Postgres descartável.
#
# A decisão F-09-B (docs/auditoria/20-f09-estrategia.md) declara que a cadeia de
# 292 migrations é HISTÓRICO MORTO e que `supabase/baseline.sql` é o único
# caminho de schema. "Decidido e escrito" não é prova de que o caminho funciona:
# este script executa, num Postgres 15 descartável, o que o kit faz na VPS e o
# que o `db:reset` faz no dev, e compara os resultados entre si.
#
# Prova cinco coisas, nesta ordem:
#
#   1. NENHUM executável do repositório aplica a cadeia (scripts, CI, kit,
#      Dockerfile/compose). Docs podem CITAR a proibição; script não pode
#      chamar `supabase db push` / `db reset` / `migration up`.
#   2. INSTALAÇÃO: preâmbulo + baseline num banco vazio, com ON_ERROR_STOP=1.
#   3. ATUALIZAÇÃO: o mesmo baseline re-aplicado SOBRE DADOS, com ON_ERROR_STOP=1
#      — é o que o `update.sh` faz — sem perder linha e sem mudar o ACL.
#   4. ACL: privilégios de tabela e função, e o DEFAULT ACL, idênticos entre
#      instalação, atualização e `db:reset`. ACL que diverge é banco que
#      "funciona" no dev e responde `permission denied` na VPS.
#   5. `db:reset` (o caminho do dev) reproduz o MESMO banco: mesmas contagens,
#      mesmo ACL. O reset é destrutivo, por isso roda num banco próprio.
#
# A restauração (backup → apagar → restaurar) é outro ensaio, com outro
# contrato: `scripts/auditoria/ensaio-de-restore.sh`. Este script o chama no
# fim, para que a evidência de F-09 cubra o ciclo inteiro numa execução.
#
# Nada aqui toca VPS nem banco remoto: container efêmero, porta alocada pelo
# daemon, banco derrubado no EXIT.
#
#   bash scripts/auditoria/prova-f09.sh              # tudo
#   PROVA_F09_SEM_RESTORE=1 bash scripts/auditoria/prova-f09.sh   # pula o restore
#
# Evidência: docs/auditoria/evidencias/f09/prova-<timestamp>.txt
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$RAIZ/supabase/baseline.sql"
PREAMBULO="$RAIZ/scripts/sql/preambulo-supabase-descartavel.sql"
EVIDENCIAS="$RAIZ/docs/auditoria/evidencias/f09"
IMG="${PROVA_F09_IMG:-pgvector/pgvector:pg15}"
CONTAINER="nexus-prova-f09-$$"
INSTALACAO="prova_instalacao"
RESET_DB="prova_reset"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$EVIDENCIAS/prova-$TS.txt"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/prova-f09.XXXXXX")"

mkdir -p "$EVIDENCIAS"

limpa() {
  docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpa EXIT

FALHAS=0
registra() { printf '%s\n' "$*" | tee -a "$LOG"; }
secao() { registra ""; registra "── $* ─────────────────────────────────────────"; }
falhou() { registra "  ✗ $*"; FALHAS=$((FALHAS + 1)); }
ok() { registra "  ✓ $*"; }

sql() { # sql <banco> [args...]
  local banco="$1"; shift
  docker exec -i "$CONTAINER" psql -U postgres -d "$banco" -v ON_ERROR_STOP=1 -tA "$@"
}

: > "$LOG"
registra "F-09 — prova do caminho único (baseline.sql)"
registra "quando:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
registra "commit:    $(git -C "$RAIZ" rev-parse --short HEAD) ($(git -C "$RAIZ" branch --show-current))"
registra "imagem:    $IMG"
registra "baseline:  $(wc -l < "$BASELINE" | tr -d ' ') linhas · sha256 $(shasum -a 256 "$BASELINE" | awk '{print $1}')"
registra "preâmbulo: sha256 $(shasum -a 256 "$PREAMBULO" | awk '{print $1}')"

# ────────────────────────────────────────────────────────────────────────────
secao "1. Nenhum executável do repositório aplica a cadeia"
# O gate unitário (tests/unit/cadeia-de-migrations-nao-e-instalacao.test.ts)
# cobre o mesmo por teste. Aqui a checagem é por EXECUÇÃO de grep no disco, para
# que a evidência do run não dependa de o vitest ter rodado.
PROIBIDOS='supabase[[:space:]]+(db[[:space:]]+push|db[[:space:]]+reset|migration[[:space:]]+up)'
ALVOS=()
for alvo in scripts .github hostgator-setup-kit Dockerfile Dockerfile.prod docker-compose.yml docker-compose.prod.yml docker-compose.traefik.yml; do
  [ -e "$RAIZ/$alvo" ] && ALVOS+=("$RAIZ/$alvo")
done
# Linha de COMENTÁRIO pode citar a proibição (e cita, em vários scripts).
# O que não pode existir é a INVOCAÇÃO — por isso o filtro de `#` no início.
HITS="$(grep -rInE "$PROIBIDOS" "${ALVOS[@]}" 2>/dev/null | grep -vE ':[0-9]+:[[:space:]]*#' || true)"
if [ -n "$HITS" ]; then
  registra "$HITS"
  falhou "executável do repositório chama a cadeia de migrations (ver linhas acima)"
else
  ok "scripts/, CI, kit e Docker/compose: zero invocação de db push/db reset/migration up"
fi
# O baseline tem de estar no kit, senão a "proibição" não tem caminho alternativo.
for arq in hostgator-setup-kit/install.sh hostgator-setup-kit/update.sh; do
  if grep -q 'baseline.sql' "$RAIZ/$arq" 2>/dev/null; then
    ok "$arq aplica baseline.sql"
  else
    falhou "$arq não menciona baseline.sql"
  fi
done

# ────────────────────────────────────────────────────────────────────────────
secao "2. Container descartável"
docker run -d --rm --name "$CONTAINER" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null
porta=""
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c "select 1" >/dev/null 2>&1; then
    porta="$(docker port "$CONTAINER" 5432/tcp | head -1 | sed 's/.*://')"
    break
  fi
  sleep 1
done
if [ -z "$porta" ]; then
  registra "FALHOU: postgres não subiu em 60s"
  exit 1
fi
registra "  $(docker exec "$CONTAINER" psql -U postgres -d postgres -tA -c 'select version()' | cut -c1-46)"
ok "postgres pronto"
registra "  porta publicada: $porta"

# ────────────────────────────────────────────────────────────────────────────
secao "3. INSTALAÇÃO (banco vazio, ON_ERROR_STOP=1)"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "create database $INSTALACAO" >/dev/null
if docker exec -i "$CONTAINER" psql -U postgres -d "$INSTALACAO" -v ON_ERROR_STOP=1 -q -f - < "$PREAMBULO" >/dev/null 2>&1; then
  ok "preâmbulo aplicado"
else
  falhou "preâmbulo falhou"
fi
if docker exec -i "$CONTAINER" psql -U postgres -d "$INSTALACAO" -v ON_ERROR_STOP=1 -q -f - < "$BASELINE" >/dev/null 2>&1; then
  ok "baseline aplicado (install)"
else
  falhou "baseline NÃO aplicou num banco vazio"
fi

contagem() { # contagem <banco>
  sql "$1" -c "
    select string_agg(x, ' ' order by x) from (
      select 'tabelas=' || count(*) as x from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r'
      union all select 'rls=' || count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relrowsecurity
      union all select 'politicas=' || count(*) from pg_policies where schemaname='public'
      union all select 'funcoes=' || count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      union all select 'triggers=' || count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
      union all select 'tipos=' || count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
        where n.nspname='public' and t.typtype in ('e','d','c')
    ) s;"
}
ACL() { # ACL <banco> — tabelas, funções e DEFAULT ACL, ordenados
  sql "$1" -c "
    select 'T ' || c.relname || ' ' || coalesce(g.grantee::text,'-') || ' ' || coalesce(g.privilege_type,'-')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      left join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) g on true
     where n.nspname='public' and c.relkind='r'
    union all
    select 'F ' || p.oid::regprocedure::text || ' ' || coalesce(g.grantee::text,'-') || ' ' || coalesce(g.privilege_type,'-')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g on true
     where n.nspname='public'
    union all
    select 'D ' || d.defaclobjtype::text || ' ' || coalesce(g.grantee::text,'-') || ' ' || coalesce(g.privilege_type,'-')
      from pg_default_acl d
      left join lateral aclexplode(d.defaclacl) g on true
    order by 1;"
}

CONTAGEM_INSTALACAO="$(contagem "$INSTALACAO")"
registra "  objetos: $CONTAGEM_INSTALACAO"
ACL "$INSTALACAO" > "$TMP/acl-instalacao.txt"
linhas_acl="$(wc -l < "$TMP/acl-instalacao.txt" | tr -d ' ')"
registra "  linhas de ACL: $linhas_acl"
if [ "${linhas_acl:-0}" -lt 1000 ]; then
  falhou "snapshot de ACL com $linhas_acl linhas — comparação de ACL seria vacuidade"
fi

case "$CONTAGEM_INSTALACAO" in
  *"tabelas=0"*|*"rls=0"*) falhou "contagem de tabelas/RLS zerada — install não criou o schema" ;;
esac
tabelas="$(printf '%s' "$CONTAGEM_INSTALACAO" | sed -n 's/.*tabelas=\([0-9]*\).*/\1/p')"
rls="$(printf '%s' "$CONTAGEM_INSTALACAO" | sed -n 's/.*rls=\([0-9]*\).*/\1/p')"
if [ "${tabelas:-0}" -gt 100 ] && [ "$rls" = "$tabelas" ]; then
  ok "$tabelas tabelas, todas com RLS"
else
  falhou "esperava >100 tabelas e RLS em todas; medido tabelas=$tabelas rls=$rls"
fi

# ────────────────────────────────────────────────────────────────────────────
secao "4. ATUALIZAÇÃO sobre dados (o que o update.sh faz)"
sql "$INSTALACAO" -q -f - >/dev/null <<'SQL'
insert into auth.users (id, email) values
  ('aaaaaaaa-1111-4000-8000-000000000001','f09-a@invariant.test'),
  ('bbbbbbbb-1111-4000-8000-000000000001','f09-b@invariant.test');
insert into public.organizations (id, slug, legal_name, display_name) values
  ('aaaaaaaa-0000-4000-8000-000000000001','f09-a','F09 A','A'),
  ('bbbbbbbb-0000-4000-8000-000000000001','f09-b','F09 B','B');
insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
  ('aaaaaaaa-1111-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','admin',now()),
  ('bbbbbbbb-1111-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','admin',now());
do $s$
declare v_org uuid; v_tag text; v_contact uuid; v_conv uuid; v_sess uuid;
begin
  foreach v_tag in array array['a','b'] loop
    v_org := (case when v_tag='a' then 'aaaaaaaa-0000-4000-8000-000000000001' else 'bbbbbbbb-0000-4000-8000-000000000001' end)::uuid;
    insert into public.channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted)
      values (v_org, 'f09-'||v_tag, '\x00'::bytea) returning id into v_sess;
    insert into public.contacts (organization_id, display_name)
      values (v_org, 'Contato F09 '||v_tag) returning id into v_contact;
    insert into public.conversations (organization_id, contact_id, channel_session_id)
      values (v_org, v_contact, v_sess) returning id into v_conv;
    insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
      values (v_org, v_conv, v_sess, v_contact, 'text', 'inbound', 'linha que tem de sobreviver '||v_tag);
    insert into public.commercial_orders (organization_id, numero, cliente_nome, total_cents)
      values (v_org, 1, 'Cliente F09 '||v_tag, 12345);
    insert into public.financial_receivables (organization_id, parcela_n, total_parcelas, valor_original_cents, vencimento)
      values (v_org, 1, 1, 12345, current_date + 30);
  end loop;
end $s$;
SQL
ANTES="$(sql "$INSTALACAO" -c "select (select count(*) from public.organizations) || '/' || (select count(*) from public.contacts) || '/' || (select count(*) from public.messages) || '/' || (select count(*) from public.commercial_orders) || '/' || (select count(*) from public.financial_receivables)")"
registra "  linhas antes (orgs/contatos/mensagens/pedidos/recebíveis): $ANTES"

if docker exec -i "$CONTAINER" psql -U postgres -d "$INSTALACAO" -v ON_ERROR_STOP=1 -q -f - < "$BASELINE" >"$TMP/update.log" 2>&1; then
  ok "baseline re-aplicado sobre dados, ON_ERROR_STOP=1, exit 0"
else
  registra "$(tail -20 "$TMP/update.log")"
  falhou "UPDATE falhou sobre dados (é o caso do update.sh na VPS)"
fi
DEPOIS="$(sql "$INSTALACAO" -c "select (select count(*) from public.organizations) || '/' || (select count(*) from public.contacts) || '/' || (select count(*) from public.messages) || '/' || (select count(*) from public.commercial_orders) || '/' || (select count(*) from public.financial_receivables)")"
if [ "$ANTES" = "$DEPOIS" ]; then
  ok "dado sobreviveu ao update: $DEPOIS"
else
  falhou "update mudou a contagem ($ANTES → $DEPOIS)"
fi
CONTAGEM_UPDATE="$(contagem "$INSTALACAO")"
if [ "$CONTAGEM_UPDATE" = "$CONTAGEM_INSTALACAO" ]; then
  ok "objetos idênticos após update: $CONTAGEM_UPDATE"
else
  falhou "update mudou objetos do schema (install=$CONTAGEM_INSTALACAO / update=$CONTAGEM_UPDATE)"
fi
ACL "$INSTALACAO" > "$TMP/acl-update.txt"
if diff -q "$TMP/acl-instalacao.txt" "$TMP/acl-update.txt" >/dev/null; then
  ok "ACL idêntico após update (tabelas + funções + default acl)"
else
  diff -u "$TMP/acl-instalacao.txt" "$TMP/acl-update.txt" | head -30 | tee -a "$LOG"
  falhou "update mudou ACL — o banco de quem atualiza deixa de ser o do install"
fi

# Privilégios que o app usa. Sem eles o banco "sobe" e o produto responde 500.
pra_ler="$(sql "$INSTALACAO" -c "select has_table_privilege('authenticated','public.contacts','SELECT')")"
pra_exec="$(sql "$INSTALACAO" -c "select has_function_privilege('authenticated','public.fn_user_org_ids()','EXECUTE')")"
falha_alto="$(sql "$INSTALACAO" -c "select has_function_privilege('anon','public.fn_user_org_ids()','EXECUTE')")"
[ "$pra_ler" = "t" ] && ok "authenticated lê public.contacts" || falhou "authenticated SEM select em public.contacts"
[ "$pra_exec" = "t" ] && ok "authenticated executa fn_user_org_ids()" || falhou "authenticated sem EXECUTE em fn_user_org_ids()"
if [ "$falha_alto" = "f" ]; then
  ok "anon NÃO executa fn_user_org_ids() (policy helper não é RPC pública)"
else
  registra "  AVISO: anon executa fn_user_org_ids() — a função só devolve as orgs do próprio JWT, mas a superfície é maior que a necessária"
fi

# Isolamento depois do update: o admin de A não vê a mensagem de B.
cross="$(sql "$INSTALACAO" -c "
  set role authenticated;
  select set_config('request.jwt.claims','{\"sub\":\"aaaaaaaa-1111-4000-8000-000000000001\"}',false);
  select count(*) from public.messages where organization_id='bbbbbbbb-0000-4000-8000-000000000001';" | tail -1)"
propria="$(sql "$INSTALACAO" -c "
  set role authenticated;
  select set_config('request.jwt.claims','{\"sub\":\"aaaaaaaa-1111-4000-8000-000000000001\"}',false);
  select count(*) from public.messages where organization_id='aaaaaaaa-0000-4000-8000-000000000001';" | tail -1)"
[ "$cross" = "0" ] && ok "isolamento pós-update: A lê 0 mensagem de B" || falhou "VAZAMENTO pós-update: A lê $cross de B"
[ "${propria:-0}" -ge 1 ] && ok "controle positivo pós-update: A lê $propria da própria org" || falhou "controle positivo vazio"

# ────────────────────────────────────────────────────────────────────────────
secao "5. db:reset reproduz o mesmo schema (banco próprio, destrutivo)"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "create database $RESET_DB" >/dev/null
# O reset derruba public/private e re-aplica o baseline pelo aplicar-schema.sh.
# O preâmbulo tem de estar aplicado antes: o reset NÃO cria roles/schemas do
# Supabase, só o schema do produto (é o contrato do script).
docker exec -i "$CONTAINER" psql -U postgres -d "$RESET_DB" -v ON_ERROR_STOP=1 -q -f - < "$PREAMBULO" >/dev/null 2>&1
if SUPABASE_DB_URL="postgresql://postgres:postgres@host.docker.internal:${porta}/${RESET_DB}" \
   bash "$RAIZ/scripts/db/resetar-schema.sh" >"$TMP/reset.log" 2>&1; then
  ok "db:reset (resetar-schema.sh) exit 0"
else
  tail -20 "$TMP/reset.log" | tee -a "$LOG"
  falhou "db:reset falhou"
fi
CONTAGEM_RESET="$(contagem "$RESET_DB")"
if [ "$CONTAGEM_RESET" = "$CONTAGEM_INSTALACAO" ]; then
  ok "reset reproduz os mesmos objetos: $CONTAGEM_RESET"
else
  falhou "reset divergiu do install (install=$CONTAGEM_INSTALACAO / reset=$CONTAGEM_RESET)"
fi
ACL "$RESET_DB" > "$TMP/acl-reset.txt"
if diff -q "$TMP/acl-instalacao.txt" "$TMP/acl-reset.txt" >/dev/null; then
  ok "ACL do reset idêntico ao do install"
else
  diff -u "$TMP/acl-instalacao.txt" "$TMP/acl-reset.txt" | head -30 | tee -a "$LOG"
  falhou "reset produz ACL diferente do install — dev e VPS deixam de ser o mesmo banco"
fi
# O reset também prova que o `aplicar-schema.sh` SABE falhar sem conexão.
if env -u SUPABASE_DB_URL bash "$RAIZ/scripts/db/aplicar-schema.sh" --verificar >"$TMP/verificar.log" 2>&1; then
  falhou "--verificar sem SUPABASE_DB_URL saiu 0 (não sabe falhar)"
else
  ok "--verificar sem SUPABASE_DB_URL sai diferente de 0 (não é verde por acidente)"
fi

# ────────────────────────────────────────────────────────────────────────────
secao "6. RESTORE (backup → apagar → restaurar → conferir)"
if [ "${PROVA_F09_SEM_RESTORE:-0}" = "1" ]; then
  registra "  pulado por PROVA_F09_SEM_RESTORE=1"
else
  if bash "$RAIZ/scripts/auditoria/ensaio-de-restore.sh" >"$TMP/restore.log" 2>&1; then
    ok "ensaio de restore PASSOU"
    registra "  evidência: $(grep -E '^evidência:' "$TMP/restore.log" | tail -1 | sed 's/^evidência: //')"
  else
    tail -20 "$TMP/restore.log" | tee -a "$LOG"
    falhou "ensaio de restore falhou"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
secao "Veredito"
if [ "$FALHAS" = 0 ]; then
  registra "PASSOU — install, update, grants, ACL e reset no caminho único; restore no ensaio próprio."
else
  registra "FALHOU — $FALHAS verificação(ões)."
fi
registra ""
registra "O que esta prova NÃO cobre (e onde está):"
registra "  · restauração de uploads/storage: lacuna declarada em 25-ensaio-de-restauracao.md §3"
registra "  · update com a cadeia histórica: PROIBIDO por decisão (20-f09-estrategia.md §4)"
registra "  · aplicação do baseline em banco Supabase gerenciado: só o caminho psql é exercitado"
registra ""
registra "evidência: ${LOG#"$RAIZ"/}"

exit "$FALHAS"
