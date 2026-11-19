-- 0330 — SÉRIE DE API PARA OS DOIS PRIMEIROS SLOs.
--
-- O doc 42 propôs disponibilidade (5xx/total) e latência (p95) das cinco rotas
-- quentes, mas nenhum dos dois era persistido: `api.5xx` era só log e duração
-- não existia. A tela /admin/observabilidade era obrigada a dizer "sem
-- histórico ainda". Esta migration cria a série mínima, sem body, sem PII e sem
-- mensagem de erro.
--
-- Uma linha por requisição medida nas 5 rotas do SLO. `code` só é preenchido em
-- 5xx (vem do envelope de erro); `organization_id` é o cookie `active_org`
-- quando existe, e fica nulo quando não há organização resolvida. A amostragem
-- é 100% hoje; se pesar, o chamador reduz e a taxa fica declarada no doc.
--
-- RLS por organização: membro lê a própria; `platform_admin` lê todas; escrita
-- só service_role (o insert acontece no `after()` da resposta). A rota de
-- observabilidade usa service_role atrás de `requirePlatformAdmin`.

create table if not exists public.api_request_samples (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  route text not null,
  status smallint not null check (status between 100 and 599),
  duration_ms numeric(10, 1) not null check (duration_ms >= 0),
  code text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists api_request_samples_created_idx
  on public.api_request_samples (created_at);
create index if not exists api_request_samples_route_created_idx
  on public.api_request_samples (route, created_at);
create index if not exists api_request_samples_org_created_idx
  on public.api_request_samples (organization_id, created_at);

alter table public.api_request_samples enable row level security;

drop policy if exists api_request_samples_select on public.api_request_samples;
create policy api_request_samples_select on public.api_request_samples
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

revoke all on public.api_request_samples from anon;
grant select on public.api_request_samples to authenticated;
grant all on public.api_request_samples to service_role;

comment on table public.api_request_samples is
  'Série dos SLOs de API: rota, status, duração, código de erro e org. Sem body/PII/mensagem. Retenção de 7 dias.';

-- Retenção em lotes: o cron diário chama até o lote voltar incompleto.
create or replace function public.fn_api_metricas_expurgar(
  p_dias integer,
  p_limite integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_dias integer := greatest(coalesce(p_dias, 7), 7);
  v_limite integer := greatest(coalesce(p_limite, 1000), 1);
  v_apagadas integer;
begin
  with alvo as (
    select id
      from public.api_request_samples
     where created_at < now() - make_interval(days => v_dias)
     order by created_at
     limit v_limite
  )
  delete from public.api_request_samples s
   using alvo a
   where s.id = a.id;

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$fn$;

revoke execute on function public.fn_api_metricas_expurgar(integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_api_metricas_expurgar(integer, integer)
  to service_role;

comment on function public.fn_api_metricas_expurgar(integer, integer) is
  'Retenção da série de API: apaga em lotes o que passou de 7 dias (piso no corpo). Idempotente.';

-- Agregado dos dois SLOs em UMA ida ao banco. A janela mínima é 7 dias (a
-- mesma do SLO); p95 considera só 2xx/3xx (4xx/5xx ficam fora). `total` e `erros` contam TODAS as
-- amostras da janela, inclusive 4xx (que não são falha de disponibilidade).
create or replace function public.fn_slo_api_resumo(
  p_dias integer,
  p_rotas text[]
)
returns table (total bigint, erros bigint, p95 numeric)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select
    count(*)::bigint as total,
    count(*) filter (where status >= 500)::bigint as erros,
    percentile_cont(0.95) within group (order by duration_ms)
      filter (where status < 400) as p95
  from public.api_request_samples
  where created_at >= now() - make_interval(days => greatest(coalesce(p_dias, 7), 7))
    and route = any(coalesce(p_rotas, array[]::text[]));
$fn$;

revoke execute on function public.fn_slo_api_resumo(integer, text[])
  from public, anon, authenticated;
grant execute on function public.fn_slo_api_resumo(integer, text[])
  to service_role;

comment on function public.fn_slo_api_resumo(integer, text[]) is
  'Agregado de disponibilidade e p95 das rotas quentes na janela (mínimo 7 dias), só service_role.';
