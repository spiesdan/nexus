-- 0327 — O BLOCO DA 0320 TROPEÇAVA EM FUNÇÃO COM `search_path` VAZIO.
--
-- Medido em produção em 18/11/2026, no deploy da 1.57.0: o apêndice da 0320
-- (que adiciona `pg_temp` ao fim do `search_path` de toda SECURITY DEFINER de
-- `public`) abortava com
--
--   ERROR: zero-length delimited identifier at or near """"
--
-- A causa: uma função com `proconfig = {search_path=}` — caminho VAZIO, não
-- nulo. O script fazia `split_part(c, '=', 2)` e recebia `''`; o `coalesce`
-- não cobre string vazia, então o `format()` montava
--
--   alter function ... set search_path = , pg_temp
--
-- e o Postgres recusava. O erro derrubava o resto do baseline quando rodado com
-- `ON_ERROR_STOP` — e, sem ele, deixava o schema incompleto em silêncio.
--
-- Correção: caminho vazio vira NULL (`nullif(btrim(...), '')`) e o `coalesce`
-- abaixo já o resolve para `public`. Nada muda para quem tem caminho de verdade.

do $mig_definer_search_path_vazio$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as assinatura,
           (select nullif(btrim(btrim(split_part(c, '=', 2)), '"'), '')
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
$mig_definer_search_path_vazio$;
