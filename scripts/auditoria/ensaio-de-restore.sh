#!/usr/bin/env bash
# F-32 — ENSAIO DE RESTAURAÇÃO PONTA A PONTA, descartável.
#
# O que prova, e por que em script:
#   instalar (baseline) → semear → BACKUP → APAGAR → RESTAURAR → conferir linhas,
#   RLS e isolamento entre tenants.
#
# O `backup.sh` do kit faz `pg_dump` pela conexão de schema e recusa dump vazio;
# o `restore.sh` usa o mesmo caminho. "Script correto" não é prova de restore —
# esta é a diferença entre ler o código e ter restaurado.
#
# Nada aqui toca a VPS nem banco real: container efêmero (pgvector/pgvector:pg15),
# porta alocada pelo daemon, banco derrubado e recriado do zero no meio do ensaio.
#
#   bash scripts/auditoria/ensaio-de-restore.sh
#
# Evidência: docs/auditoria/evidencias/restore/ensaio-<timestamp>.txt
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$RAIZ/supabase/baseline.sql"
PREAMBULO="$RAIZ/scripts/sql/preambulo-supabase-descartavel.sql"
EVIDENCIAS="$RAIZ/docs/auditoria/evidencias/restore"
IMG="${RESTORE_ENSAIO_IMG:-pgvector/pgvector:pg15}"
CONTAINER="nexus-ensaio-restore-$$"
ORIGEM="ensaio_origem"
RESTAURADO="ensaio_restaurado"
TS="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/ensaio-restore.XXXXXX")"
LOG="$EVIDENCIAS/ensaio-$TS.txt"

mkdir -p "$EVIDENCIAS"

limpa() {
  docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpa EXIT

registra() { printf '%s\n' "$*" | tee -a "$LOG"; }
secao() { registra ""; registra "── $* ─────────────────────────────────────"; }

sql() { # sql <banco> [args...]
  local banco="$1"; shift
  docker exec -i "$CONTAINER" psql -U postgres -d "$banco" -v ON_ERROR_STOP=1 -tA "$@"
}

: > "$LOG"
registra "Ensaio de restauração — nexus"
registra "quando:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
registra "imagem:   $IMG"
registra "baseline: sha256 $(shasum -a 256 "$BASELINE" | awk '{print $1}')"

secao "1. Container descartável"
docker run -d --rm --name "$CONTAINER" -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null
pronto=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c "select 1" >/dev/null 2>&1; then
    pronto=1; break
  fi
  sleep 1
done
[ "$pronto" = 1 ] || { registra "FALHOU: postgres não subiu"; exit 1; }
registra "ok — $(docker exec "$CONTAINER" psql -U postgres -d postgres -tA -c 'select version()' | cut -c1-40)"

secao "2. Instalação (preâmbulo + baseline)"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "create database $ORIGEM" >/dev/null
docker exec -i "$CONTAINER" psql -U postgres -d "$ORIGEM" -v ON_ERROR_STOP=1 -q -f - < "$PREAMBULO" >/dev/null 2>&1
docker exec -i "$CONTAINER" psql -U postgres -d "$ORIGEM" -v ON_ERROR_STOP=1 -q -f - < "$BASELINE" >/dev/null 2>&1
tabelas="$(sql "$ORIGEM" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")"
rls="$(sql "$ORIGEM" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")"
registra "tabelas em public: $tabelas · com RLS: $rls"

secao "3. Semeadura (dados que precisam SOBREVIVER)"
sql "$ORIGEM" -q -f - <<'SQL' >/dev/null
insert into auth.users (id, email) values
  ('aaaaaaaa-1111-4000-8000-000000000001','restore-a@invariant.test'),
  ('bbbbbbbb-1111-4000-8000-000000000001','restore-b@invariant.test');
insert into public.organizations (id, slug, legal_name, display_name) values
  ('aaaaaaaa-0000-4000-8000-000000000001','restore-a','Restore A','Restore A'),
  ('bbbbbbbb-0000-4000-8000-000000000001','restore-b','Restore B','Restore B');
insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
  ('aaaaaaaa-1111-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','admin',now()),
  ('bbbbbbbb-1111-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','admin',now());
do $s$
declare v_org uuid; v_tag text; v_contact uuid; v_conv uuid; v_sess uuid;
begin
  foreach v_tag in array array['a','b'] loop
    v_org := (case when v_tag='a' then 'aaaaaaaa-0000-4000-8000-000000000001' else 'bbbbbbbb-0000-4000-8000-000000000001' end)::uuid;
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values (gen_random_uuid(), v_org, 'restore-'||v_tag, '\x00'::bytea) returning id into v_sess;
    insert into public.contacts (id, organization_id, display_name)
      values (gen_random_uuid(), v_org, 'Contato Restore '||v_tag) returning id into v_contact;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
      values (gen_random_uuid(), v_org, v_contact, v_sess, 'open') returning id into v_conv;
    insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
      values (v_org, v_conv, v_sess, v_contact, 'text', 'inbound', 'mensagem que tem de voltar '||v_tag);
    insert into public.commercial_orders (organization_id, numero, cliente_nome, total_cents)
      values (v_org, 1, 'Cliente Restore '||v_tag, 12345);
    insert into public.financial_receivables (organization_id, parcela_n, total_parcelas, valor_original_cents, vencimento)
      values (v_org, 1, 1, 12345, current_date + 30);
  end loop;
end $s$;
SQL
conta() { sql "$1" -c "select count(*) from public.$2"; }
for t in organizations contacts conversations messages commercial_orders financial_receivables; do
  registra "  $t: $(conta "$ORIGEM" "$t")"
done

secao "4. BACKUP (mesmo caminho do kit: pg_dump pela conexão de schema)"
# `--no-owner` e NÃO `--no-privileges`: sem os grants, o role do app recebe
# "permission denied" depois do restore (medido na primeira rodada deste ensaio).
docker exec -i "$CONTAINER" pg_dump -U postgres --no-owner "$ORIGEM" \
  | gzip > "$TMP/db.sql.gz"
bytes="$(wc -c < "$TMP/db.sql.gz" | tr -d ' ')"
registra "dump: $bytes bytes · sha256 $(shasum -a 256 "$TMP/db.sql.gz" | awk '{print $1}')"
if [ "$bytes" -lt 4096 ]; then
  registra "FALHOU: dump abaixo do piso de 4 KiB — o backup.sh recusaria este arquivo"
  exit 1
fi

secao "5. APAGAR a origem (perda simulada)"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "drop database $ORIGEM"
sumiu="$(docker exec "$CONTAINER" psql -U postgres -d postgres -tA -c "select count(*) from pg_database where datname='$ORIGEM'")"
registra "banco de origem existe? $([ "$sumiu" = 0 ] && echo não || echo sim)"

secao "6. RESTAURAR num banco limpo"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "create database $RESTAURADO"
gunzip -c "$TMP/db.sql.gz" | docker exec -i "$CONTAINER" psql -U postgres -d "$RESTAURADO" -v ON_ERROR_STOP=1 -q >/dev/null
registra "restore: exit 0"

secao "7. Conferir: linhas, RLS e isolamento"
falhas=0
for t in organizations contacts conversations messages commercial_orders financial_receivables; do
  n="$(conta "$RESTAURADO" "$t")"
  registra "  $t: $n"
  [ "$n" -gt 0 ] || { registra "  ✗ $t voltou VAZIA"; falhas=$((falhas+1)); }
done
tabelas_r="$(sql "$RESTAURADO" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")"
rls_r="$(sql "$RESTAURADO" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")"
registra "  tabelas: $tabelas_r · com RLS: $rls_r"
[ "$tabelas_r" = "$tabelas" ] || { registra "  ✗ contagem de tabelas divergiu"; falhas=$((falhas+1)); }
[ "$rls_r" = "$rls" ] || { registra "  ✗ RLS divergiu depois do restore"; falhas=$((falhas+1)); }

# Privilégios que o app usa: sem eles o banco "restaura" e o app não abre.
pode_ler="$(sql "$RESTAURADO" -c "select has_table_privilege('authenticated','public.contacts','SELECT')")"
registra "  authenticated pode ler contacts? $pode_ler"
[ "$pode_ler" = "t" ] || { registra "  ✗ o restore não devolveu os privilégios do app"; falhas=$((falhas+1)); }

# Isolamento: o admin de A lê 0 linhas de B, e ≥1 da própria — depois do restore.
leitura_a="$(sql "$RESTAURADO" -c "
  set role authenticated;
  select set_config('request.jwt.claims','{\"sub\":\"aaaaaaaa-1111-4000-8000-000000000001\"}',false);
  select count(*) from public.messages where organization_id='bbbbbbbb-0000-4000-8000-000000000001';
" | tail -1)"
leitura_propria="$(sql "$RESTAURADO" -c "
  set role authenticated;
  select set_config('request.jwt.claims','{\"sub\":\"aaaaaaaa-1111-4000-8000-000000000001\"}',false);
  select count(*) from public.messages where organization_id='aaaaaaaa-0000-4000-8000-000000000001';
" | tail -1)"
registra "  isolamento pós-restore: A lê $leitura_a linha(s) de B; A lê $leitura_propria da própria"
[ "$leitura_a" = 0 ] || { registra "  ✗ VAZAMENTO entre tenants depois do restore"; falhas=$((falhas+1)); }
[ "$leitura_propria" -ge 1 ] || { registra "  ✗ controle positivo vazio (teste sem valor)"; falhas=$((falhas+1)); }

secao "8. Veredito"
if [ "$falhas" = 0 ]; then
  registra "PASSOU — backup, perda e restauração preservaram linhas, RLS e isolamento."
else
  registra "FALHOU — $falhas verificação(ões)."
fi
registra ""
registra "LACUNAS CONHECIDAS (não medidas por este ensaio):"
registra "  · uploads/storage (avatares, fotos de produto, mídia de conversa) NÃO entram no backup.sh"
registra "  · rotação: o backup.sh mantém 14 por tipo; storage não tem política"
registra "  · health da aplicação (/api/v1/health) exige o app no ar — aqui é saúde do BANCO"
registra ""
registra "evidência: ${LOG#"$RAIZ"/}"

exit "$falhas"
