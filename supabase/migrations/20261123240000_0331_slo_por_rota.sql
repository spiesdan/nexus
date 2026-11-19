-- 0331 — SLO POR ROTA PARA O SENTINEL.
--
-- A tela usa `fn_slo_api_resumo` (total/erros/p95 agregados). O detector
-- `plataforma.slo_estourado` precisa saber QUAIS rotas puxaram o número para a
-- evidência — e continua sendo uma ida só. Mesma janela mínima de 7 dias e
-- p95 só de 2xx/3xx.
--
-- O índice `(route, created_at)` criado na 0330 cobre `route = any(...)` +
-- `created_at >= ...`; a consulta com 1.000 amostras ficou abaixo de 200 ms no
-- teste da 0330. Não há índice novo nesta migration.

create or replace function public.fn_slo_api_rotas(
  p_dias integer,
  p_rotas text[]
)
returns table (route text, total bigint, erros bigint, p95 numeric)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select
    route,
    count(*)::bigint as total,
    count(*) filter (where status >= 500)::bigint as erros,
    percentile_cont(0.95) within group (order by duration_ms)
      filter (where status < 400) as p95
  from public.api_request_samples
  where created_at >= now() - make_interval(days => greatest(coalesce(p_dias, 7), 7))
    and route = any(coalesce(p_rotas, array[]::text[]))
  group by route
  order by route;
$fn$;

revoke execute on function public.fn_slo_api_rotas(integer, text[])
  from public, anon, authenticated;
grant execute on function public.fn_slo_api_rotas(integer, text[])
  to service_role;

comment on function public.fn_slo_api_rotas(integer, text[]) is
  'SLO por rota (total/5xx/p95) para a evidência do Sentinel; só service_role.';
