-- 0306 — FROTA / VEÍCULOS / MOTORISTAS / CAPACIDADE (F5: VRPTW multi-veículo).
--
-- O prompt V5 pedia otimização multi-veículo com restrição de capacidade; o
-- schema não tinha entidade de frota (a "frota" era texto solto em `shipments`:
-- placa/veiculo_tipo/motorista_nome — decisão registrada na 0212). Esta migration
-- cria a estrutura que o VRPTW precisa, sem tocar nas linhas existentes.
--
-- O QUE É (design, não invenção — derivado do prompt §4 e do contrato do
-- servico Python):
--
-- - `fleet_vehicles`: veículo com placa, tipo e capacidades próprias (kg e
--   volume). A carga que o VRPTW distribui passa a referenciar o veículo.
-- - `fleet_drivers`: motorista com capacidade de jornada (min) e bloco de
--   disponibilidade/restricoes (jsonb — decisão operacional, sem enum fechado
--   que o F5 não autoriza inventar).
--
-- COMPATIBILIDADE: nada foi alterado em `shipments`, `shipment_orders`,
-- `commercial_orders` nem policies existentes — as tabelas novas são
-- tenant-aware (organization_id + RLS por comando) e o `shipments` legado
-- continua sendo a carga operacional atual (placa/tipo/motorista_nome).
--
-- Idempotente: roda em install (baseline) e em update (migration).

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  placa text not null,
  veiculo_tipo text,
  capacidade_kg numeric(12,3) not null default 0,
  capacidade_m3 numeric(12,3) not null default 0,
  criados_em timestamptz not null default now(),
  atualizados_em timestamptz not null default now()
);

create table if not exists public.fleet_drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  nome text not null,
  telefone text,
  capacidade_jornada_min int not null default 480,
  disponibilidade jsonb not null default '{}'::jsonb,
  restricoes jsonb not null default '{}'::jsonb,
  criados_em timestamptz not null default now(),
  atualizados_em timestamptz not null default now()
);

create index if not exists idx_fleet_vehicles_organization_id
  on public.fleet_vehicles (organization_id);
create index if not exists idx_fleet_drivers_organization_id
  on public.fleet_drivers (organization_id);

alter table public.fleet_vehicles enable row level security;
alter table public.fleet_drivers enable row level security;

drop policy if exists "fleet_vehicles_select" on public.fleet_vehicles;
create policy "fleet_vehicles_select" on public.fleet_vehicles
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "fleet_vehicles_insert" on public.fleet_vehicles;
create policy "fleet_vehicles_insert" on public.fleet_vehicles
  for insert with check (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "fleet_vehicles_update" on public.fleet_vehicles;
create policy "fleet_vehicles_update" on public.fleet_vehicles
  for update using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  )
  with check (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "fleet_vehicles_delete" on public.fleet_vehicles;
create policy "fleet_vehicles_delete" on public.fleet_vehicles
  for delete using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "fleet_drivers_select" on public.fleet_drivers;
create policy "fleet_drivers_select" on public.fleet_drivers
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "fleet_drivers_insert" on public.fleet_drivers;
create policy "fleet_drivers_insert" on public.fleet_drivers
  for insert with check (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "fleet_drivers_update" on public.fleet_drivers;
create policy "fleet_drivers_update" on public.fleet_drivers
  for update using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  )
  with check (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "fleet_drivers_delete" on public.fleet_drivers;
create policy "fleet_drivers_delete" on public.fleet_drivers
  for delete using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

comment on table public.fleet_vehicles is
  'Frota (F5/VRPTW): veiculo com placa, tipo e capacidades proprias (kg/volume). Frota e legada em shipments.placa — esta tabela e a entidade usada pelo otimizador multi-veiculo.';

comment on table public.fleet_drivers is
  'Motoristas (F5/VRPTW): motorista com capacidade de jornada (min) e disponibilidade/restricoes (jsonb operacional). user_id liga ao login quando houver; sem login, motorista continua nome-only (logica TS no servico).';
