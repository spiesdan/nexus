-- 0250_prospecting_orcamento - FASE 13 da spec 19 (secoes 6, 20, 21 e 24)
-- Budget guard mensal + preco de consulta/enriquecimento em config (D4/D21)
-- e contagem de hits de cache: o POST que reutiliza busca recente nao cria
-- linha nova em prospecting_searches, entao so esta tabela enxerga o hit.
alter table public.prospecting_settings
  add column if not exists orcamento_mensal_cents integer,
  add column if not exists preco_busca_cents integer,
  add column if not exists preco_detalhe_cents integer;

alter table public.prospecting_settings
  drop constraint if exists prospecting_settings_orcamento_valido;

alter table public.prospecting_settings
  add constraint prospecting_settings_orcamento_valido check (
    (orcamento_mensal_cents is null or orcamento_mensal_cents >= 0)
    and (preco_busca_cents is null or preco_busca_cents >= 0)
    and (preco_detalhe_cents is null or preco_detalhe_cents >= 0)
  );

comment on column public.prospecting_settings.orcamento_mensal_cents is
  'Teto mensal de gasto em centavos (spec 19, secao 24). NULL = sem teto; 80% avisa, 90% reduz a automacao, 100% bloqueia consulta paga.';
comment on column public.prospecting_settings.preco_busca_cents is
  'Preco de uma consulta de descoberta em centavos (D4). NULL = arquivo neutro lib/prospeccao/custos.ts.';
comment on column public.prospecting_settings.preco_detalhe_cents is
  'Preco de um enriquecimento Place Details em centavos (D4). NULL = arquivo neutro lib/prospeccao/custos.ts.';

create table if not exists public.prospecting_cache_hits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  search_id uuid references public.prospecting_searches(id) on delete set null,
  hit_at timestamptz not null default now()
);

create index if not exists prospecting_cache_hits_org_time_idx
  on public.prospecting_cache_hits (organization_id, hit_at desc);

alter table public.prospecting_cache_hits enable row level security;

drop policy if exists prospecting_cache_hits_select on public.prospecting_cache_hits;
create policy prospecting_cache_hits_select on public.prospecting_cache_hits
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists prospecting_cache_hits_insert on public.prospecting_cache_hits;
create policy prospecting_cache_hits_insert on public.prospecting_cache_hits
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

revoke all on public.prospecting_cache_hits from anon;
grant select, insert on public.prospecting_cache_hits to authenticated;
grant all on public.prospecting_cache_hits to service_role;

comment on table public.prospecting_cache_hits is
  'Hit de cache de busca (spec 19, secoes 7 e 21): o hit nao cria busca nova, entao o painel de consumo conta o hit aqui.';
