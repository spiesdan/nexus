-- =============================================================================
-- DIAGNÓSTICO DE RLS — o que a contagem de políticas não conta.
-- =============================================================================
-- "303 políticas" é um número de inventário, não uma prova de segurança. Uma
-- tabela pode ter 8 políticas e continuar aberta (RLS desligado — a política é
-- então IGNORADA pelo planejador), ou ter política `using (true)` (que não
-- isola nada), ou ter política só de SELECT (INSERT/UPDATE/DELETE caem no
-- deny-all e a tela quebra em silêncio, ou pior, o service_role escreve).
--
-- Saída: TSV `categoria<TAB>tabela<TAB>detalhe`, ordenado. Cada categoria é uma
-- pergunta que se responde lendo, não somando.
--
--   rls_desligado            tabela de public com RLS OFF. Política nela é enfeite.
--   rls_sem_politica         RLS ON e zero políticas ⇒ ninguém além de
--                            service_role/owner lê. Pode ser intencional; tem de
--                            estar nomeado, não descoberto.
--   politica_using_true      USING `true` explícito ⇒ não filtra linha nenhuma.
--   politica_sem_org         nem organization_id nem helper de org no predicado:
--                            candidata a vazamento entre tenants. Revisar uma a uma.
--   politica_para_public     papel `public` (qualquer um, inclusive anon).
--   comando_sem_politica     RLS ON, comando sem política ⇒ deny-all silencioso.
--   rls_forcado              FORCE ROW LEVEL SECURITY (owner também obedece).
--   dono                     quem é o dono da tabela (owner ignora RLS sem FORCE).
-- =============================================================================

with tabelas as (
  select c.oid,
         n.nspname || '.' || c.relname as nome,
         c.relrowsecurity,
         c.relforcerowsecurity,
         pg_get_userbyid(c.relowner) as dono
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname = 'public'
),
politicas as (
  select p.schemaname || '.' || p.tablename as tabela,
         p.policyname,
         p.cmd,
         p.roles::text as roles,
         coalesce(p.qual, '') as qual,
         coalesce(p.with_check, '') as with_check
  from pg_policies p
  where p.schemaname = 'public'
),
comandos as (
  select * from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) v(cmd)
)
select categoria, tabela, detalhe
from (
  -- 1. RLS desligado: a política existente é ignorada.
  select 'rls_desligado'::text as categoria, t.nome as tabela,
         coalesce('politicas=' || (select count(*) from politicas p where p.tabela = t.nome)::text, 'politicas=0') as detalhe
  from tabelas t
  where not t.relrowsecurity

  union all
  -- 2. RLS ligado e nenhuma política: tudo negado para anon/authenticated.
  select 'rls_sem_politica', t.nome, 'deny-all para anon/authenticated'
  from tabelas t
  where t.relrowsecurity
    and not exists (select 1 from politicas p where p.tabela = t.nome)

  union all
  -- 3. USING `true` (com ou sem parênteses): permissivo sem filtro.
  select 'politica_using_true', p.tabela, p.policyname || ' cmd=' || p.cmd
  from politicas p
  where btrim(p.qual) in ('true', '(true)')
     or btrim(p.with_check) in ('true', '(true)')

  union all
  -- 4. Predicado sem organization_id e sem helper de organização.
  select 'politica_sem_org', p.tabela, p.policyname || ' cmd=' || p.cmd
  from politicas p
  where p.qual || ' ' || p.with_check not like '%organization_id%'
    and p.qual || ' ' || p.with_check not like '%fn_user_org_ids%'
    and p.qual || ' ' || p.with_check not like '%fn_is_platform_admin%'
    and p.qual || ' ' || p.with_check not like '%fn_user_role_in_org%'
    and p.qual || ' ' || p.with_check not like '%fn_role_at_least%'
    and p.qual || ' ' || p.with_check not like '%fn_has_org_role%'

  union all
  -- 5. Papel public (inclui anon) numa política que escreve ou lê dados de tenant.
  select 'politica_para_public', p.tabela, p.policyname || ' cmd=' || p.cmd || ' roles=' || p.roles
  from politicas p
  where p.roles like '%public%'

  union all
  -- 6. Comando sem política numa tabela com RLS: deny-all silencioso.
  select 'comando_sem_politica', t.nome, c.cmd
  from tabelas t
  cross join comandos c
  where t.relrowsecurity
    and not exists (
      select 1 from politicas p
      where p.tabela = t.nome
        and (p.cmd = c.cmd or p.cmd = 'ALL')
    )

  union all
  -- 7. FORCE RLS: o dono também obedece. Raro e proposital quando existe.
  select 'rls_forcado', t.nome, 'force=true'
  from tabelas t
  where t.relforcerowsecurity

  union all
  -- 8. Dono: sem FORCE, o dono ignora RLS.
  select 'dono', t.nome, t.dono
  from tabelas t
) s
order by 1, 2, 3;
