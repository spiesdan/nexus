-- ============================================================================
-- 0320 — toda SECURITY DEFINER de public passa a fixar `pg_temp` no search_path
-- ============================================================================
-- MEDIDO em 18/11/2026, baseline @ef08450c aplicado em pg15 descartável:
--
--     definer em public ................ 62
--     com search_path FIXO ............. 62
--     com `pg_temp` EXPLÍCITO .......... 20
--     sem `pg_temp` .................... 42   ← este arquivo
--
-- POR QUE ISSO É FURO, e não estilo. O Postgres procura primeiro no schema
-- TEMPORÁRIO quando `pg_temp` NÃO está listado no `search_path`
-- (documentação de `search_path`: "the temporary schema is searched first for
-- relation names and data type names, but only if pg_temp is not in
-- search_path"). Uma função `security definer` roda com o dono (`postgres`);
-- se o corpo dela referencia uma tabela SEM qualificar schema — e 42 destas
-- referenciam (`user_organizations`, `organizations`, `messages`, …) — quem
-- chama pode criar `pg_temp.<mesmo nome>` e a definer lê/escreve o OBJETO DO
-- CHAMADOR com privilégio de dono. Não é escalada cross-tenant por si (a
-- tabela temporária é da sessão de quem chamou), é execução de código com o
-- search_path controlado por quem chama: a classe que `pg_temp` explícito
-- fecha, e que a disciplina de "search_path fixo" sozinha não fecha.
--
-- A correção ADICIONA `pg_temp` ao FIM do caminho existente. Nada mais muda:
-- as funções que já listavam `private`/`extensions` mantêm a ordem; as que
-- tinham só `public` passam a `public, pg_temp`. Nenhuma assinatura, corpo,
-- grant ou policy é tocada.
--
-- Idempotente: só age em quem ainda não lista `pg_temp`, e o caminho é lido do
-- próprio catálogo (não há lista de 42 nomes para envelhecer).
-- ============================================================================

do $search_path$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as assinatura,
           (select split_part(c, '=', 2)
              from unnest(coalesce(p.proconfig, '{}')) c
             where c like 'search_path=%'
             limit 1) as caminho
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c
          where c like 'search_path=%pg_temp%'
       )
  loop
    execute format(
      'alter function %s set search_path = %s, pg_temp',
      f.assinatura,
      coalesce(f.caminho, 'public')
    );
  end loop;
end
$search_path$;
