-- =============================================================================
-- PREÂMBULO: o que um Postgres descartável precisa ter para ser o banco DO
-- PRODUTO antes de qualquer SQL nosso.
-- =============================================================================
-- Fonte única. Consumido por:
--   * scripts/test-db.sh  (gate obrigatório `invariants` do CI)
--   * scripts/auditoria/replay-migrations.sh (instrumento da auditoria AAA)
--
-- POR QUE UM ARQUIVO E NÃO DOIS HEREDOCS.
--
-- Em 2026-11-15 o replay de migrations tinha uma cópia PRÓPRIA, mais pobre, deste
-- preâmbulo: faltavam `file_size_limit`/`allowed_mime_types` em storage.buckets,
-- `citext`, `pg_trgm`, o DEFAULT ACL de funções e o schema `extensions`. O
-- resultado foi medido como defeito do produto: as migrations 0014 e 0017
-- apareceram como "quebradas" porque o stub do instrumento era menor que o do
-- gate. Instrumento que não é o mesmo universo do gate produz achado falso com
-- cara de achado. Um arquivo só impede a divergência de nascer.
--
-- O conteúdo é o mesmo bloco que rodava em scripts/test-db.sh, sem alteração
-- semântica — inclusive os comentários que explicam POR QUE cada stub existe.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- O DEFAULT ACL QUE TODO PROJETO SUPABASE JÁ TEM ANTES DE QUALQUER SQL NOSSO.
--
-- Sem estas 4 linhas o Postgres efêmero NÃO é o banco do produto, e a diferença
-- não é cosmética: ela apaga uma classe inteira de defeito do campo de visão do
-- job `invariants`.
--
-- O `pg_dump` do baseline emite, na linha ~3960, o `ALTER DEFAULT PRIVILEGES ...
-- GRANT ALL ON FUNCTIONS TO anon` — mas ele só o emite PORQUE a entrada já
-- existia no projeto de origem. Num Supabase de verdade (nuvem, que é o que o
-- `hostgator-setup-kit/install.sh` manda o cliente usar, ou a CLI local) essa
-- entrada em `pg_default_acl` é gravada pelo bootstrap do Supabase, ANTES de
-- `install.sh`/`update.sh` rodarem. Consequência: toda função que o baseline cria
-- — inclusive as do CORPO do dump — nasce com EXECUTE para anon.
--
-- Num Postgres cru, ao contrário, a entrada só passa a existir NA linha 3960 — e
-- as funções do corpo, criadas antes dela, nascem limpas. Medido em 2026-08-08,
-- pg17 descartável, baseline @9249e6f2 aplicado com e sem este bloco:
--
--     sem  -> 0 de 27 SECURITY DEFINER de public executáveis por anon
--     com  -> 6 de 27  (activate_kb_version, fn_decrypt_oauth, fn_encrypt_oauth,
--                       fn_lgpd_cascade_redact_contact, fn_update_budget_consumption,
--                       retrieve_top_k_chunks)
--
-- As mesmas 6, exatamente, que `select ... has_function_privilege('anon', ...)`
-- devolve no `supabase_db_nexus` desta máquina hoje. Ou seja: o gate estava
-- verde medindo um universo onde o defeito não pode existir.
--
-- `revoke execute ... from public` no default também é fiel ao produto: no
-- Supabase real o `proacl` das definer de public NÃO tem `=X` (grant a PUBLIC),
-- então lá a exposição vem do grant DIRETO a anon — o caminho que
-- `revoke from public` sozinho não fecha.
alter default privileges for role postgres in schema public grant all on functions to anon;
alter default privileges for role postgres in schema public grant all on functions to authenticated;
alter default privileges for role postgres in schema public grant all on functions to service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public;

create schema if not exists auth;
create schema if not exists extensions;

-- O search_path QUE O ROLE `postgres` DO SUPABASE TEM — medido, não suposto.
--
-- `show search_path` no `supabase_db_nexus` desta máquina (imagem
-- supabase/postgres 17.x) devolve:
--
--     "$user", public, extensions
--
-- e o mesmo valor está em `pg_db_role_setting` para o role `postgres`. Isso é
-- bootstrap do Supabase, como os roles e o DEFAULT ACL — não SQL nosso.
--
-- Sem esta linha o banco descartável NÃO é o do produto num ponto que produz
-- achado falso: a migration 0066 (`human_cases`) chama `uuid_generate_v4()`
-- sem qualificar, que é como se escreve num projeto onde `extensions` está no
-- search_path. Sem ele o replay acusa "function uuid_generate_v4() does not
-- exist" e a migration vira "quebrada" — quando o defeito é do instrumento.
-- Medido em 2026-11-16: era exatamente 1 das 257 falhas.
--
-- `alter role … set` vale para sessões NOVAS (é assim que o gate abre cada
-- psql) e o `set` abaixo cobre a sessão atual, para o caso de o preâmbulo e o
-- SQL seguinte rodarem no mesmo psql.
alter role postgres set search_path = "$user", public, extensions;
set search_path = "$user", public, extensions;

-- O baseline referencia extensions.uuid_generate_v4/gen_random_bytes e os tipos
-- public.vector/public.citext + gin_trgm_ops, mas não cria as extensões (pg_dump).
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;

-- Stubs de storage (o apêndice do baseline cria buckets + policies em storage.objects).
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Stub de auth.users (FKs do baseline apontam pra cá).
--
-- `raw_user_meta_data` entrou com a migration 0202 (fn_conversation_assign
-- passou a ler `raw_user_meta_data->>'full_name'` dentro da definer) — é o
-- nome real da coluna no GoTrue, não um apelido do stub.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Stub de auth.uid() lendo o claim `sub` de request.jwt.claims (mesmo contrato
-- do Supabase; os testes simulam o JWT via set_config).
--
-- O CORPO ABAIXO É CÓPIA FIEL do `auth.uid()` do Supabase — conferido em
-- 2026-08-11 com `pg_get_functiondef` no `supabase_db_nexus` (imagem
-- supabase/postgres:17.6.1.106). A cópia importa por causa de UM detalhe que a
-- versão anterior deste stub errava:
--
--     antes:  nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
--     real:   nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
--
-- O `nullif` do original protege o CAST; o do stub protegia o resultado. Um GUC
-- customizado que já foi tocado numa transação anterior passa a existir com
-- string VAZIA em vez de NULL — e aí o stub estourava
-- `invalid input syntax for type json` onde o Supabase devolve NULL sossegado.
-- Consequência: qualquer função que chame `auth.uid()` incondicionalmente (o
-- guard `if auth.uid() is not null and not fn_role_at_least(...)`, que é o
-- padrão deste schema) quebrava no gate e passava em produção. Instrumento que
-- diverge do produto não mede o produto.
create or replace function auth.uid() returns uuid
  language sql stable
  as $fn$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $fn$;

-- Stub de auth.jwt() — o Supabase real o tem (é o que `auth.jwt() ->> 'role'`
-- lê em funções como fn_remover_pedido_da_carga, 0353). Sem ele, uma definer
-- que chame `auth.jwt()` funciona em produção e quebra no gate com
-- "function auth.jwt() does not exist". Corpo fiel: claims em `request.jwt.claims`
-- (o que PostgREST/testes gravam) e o GUC legado singular.
create or replace function auth.jwt() returns jsonb
  language sql stable
  as $fn$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $fn$;

grant execute on function auth.jwt() to anon, authenticated, service_role;

grant usage on schema auth, extensions, storage to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- A PUBLICAÇÃO QUE TODO PROJETO SUPABASE NASCE TENDO.
--
-- Um projeto Supabase (nuvem ou CLI local) já tem `supabase_realtime` no
-- `pg_publication` antes de qualquer SQL nosso — é o bootstrap que a cria, não a
-- migration. As migrations que fazem `alter publication supabase_realtime add
-- table ...` (0025 e sucessoras) supõem isso, com razão.
--
-- O baseline NÃO supõe: o apêndice dele cria a publicação se ela não existir
-- (`if not exists (select 1 from pg_publication where pubname='supabase_realtime')`).
-- Criar aqui não muda o resultado do gate `test:db`; muda o do replay, que sem
-- esta linha acusa "publication does not exist" e transforma stub de instrumento
-- em achado falso — exatamente o que aconteceu com as migrations 0014/0017.
-- `create publication if not exists` NÃO existe no Postgres 15/16/17 — a forma
-- que funciona (e a mesma que o apêndice do baseline usa) é o DO abaixo.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
