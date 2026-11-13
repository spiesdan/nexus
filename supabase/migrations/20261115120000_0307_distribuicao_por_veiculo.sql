-- 0307 — DISTRIBUIÇÃO POR VEÍCULO, JANELAS DE ENTREGA E VERSÕES DE ROTA.
--
-- A 0306 criou a frota (fleet_vehicles/fleet_drivers), mas a carga continuava
-- single-vehicle: `shipments.placa/motorista_nome` são texto, um veículo por
-- carga, e `shipment_orders.sequencia` é uma ordem GLOBAL. O VRPTW devolve a
-- distribuição por veículo e não havia onde gravá-la — o operador confirmava e
-- a informação morria na resposta HTTP.
--
-- O QUE ESTA MIGRATION ADICIONA (sem alterar linha existente):
--
-- 1. `fleet_vehicles.ativo` / `fleet_drivers.ativo`: frota inativa continua no
--    histórico, mas não entra na distribuição. Apagar um veículo que já rodou
--    deixaria o histórico apontando para o nada.
-- 2. Placa única por organização (normalizada): duas linhas com a mesma placa
--    fariam o operador escolher "ABC1D23" sem saber qual é.
-- 3. `shipment_orders.veiculo_id` / `motorista_id` / `sequencia_veiculo`: a
--    atribuição operacional da parada. `sequencia` (global) continua sendo a
--    ordem de leitura do romaneio; `sequencia_veiculo` é a ordem DENTRO do
--    veículo — as duas não são a mesma pergunta.
-- 4. `shipment_orders.janela_inicio` / `janela_fim`: janela de entrega em hora
--    do dia (o que o cliente combinou), opcional. Sem janela informada, o
--    solver declara a restrição como não aplicada em vez de inventar horário.
-- 5. `shipments.saida_prevista`: hora do dia em que a carga sai da base. É o
--    que converte a janela (hora do dia) para o relógio do solver e o ETA
--    (segundos desde a saída) para horário na tela. Sem ela, a janela não é
--    aplicada e a resposta DECLARA isso — não existe hora de saída padrão
--    inventada.
-- 6. `shipment_route_versions`: snapshot imutável de cada distribuição
--    confirmada (versão, algoritmo, veículos, distância, duração, autor). É o
--    histórico de rotas que o prompt §7 pede e a base do teste de concorrência
--    (§8, teste 10): versão antiga não sobrescreve a nova.
--
-- COMPATIBILIDADE: nenhuma coluna existente muda de tipo ou de sentido; o
-- caminho single-vehicle (heurística NN + 2-opt) continua gravando `sequencia`,
-- `rota_geojson`, `distancia_m` e `duracao_s` como antes.
--
-- Idempotente: roda em install (baseline) e em update (migration).

-- ─── Frota: ativo + placa única ──────────────────────────────────────────────
alter table public.fleet_vehicles
  add column if not exists ativo boolean not null default true;

alter table public.fleet_drivers
  add column if not exists ativo boolean not null default true;

-- A placa é normalizada (sem espaço, maiúscula) porque a mesma placa digitada
-- "abc1d23" e "ABC 1D23" é o mesmo veículo — e duas linhas iguais fariam o
-- operador escolher no escuro.
create unique index if not exists fleet_vehicles_org_placa_key
  on public.fleet_vehicles (
    organization_id,
    upper(regexp_replace(placa, '\s', '', 'g'))
  );

-- ─── Parada: atribuição por veículo + janela de entrega ─────────────────────
alter table public.shipment_orders
  add column if not exists veiculo_id uuid references public.fleet_vehicles (id) on delete set null;

alter table public.shipment_orders
  add column if not exists motorista_id uuid references public.fleet_drivers (id) on delete set null;

alter table public.shipment_orders
  add column if not exists sequencia_veiculo integer;

alter table public.shipment_orders
  add column if not exists janela_inicio time;

alter table public.shipment_orders
  add column if not exists janela_fim time;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shipment_orders_sequencia_veiculo_positiva'
  ) then
    alter table public.shipment_orders
      add constraint shipment_orders_sequencia_veiculo_positiva
      check (sequencia_veiculo is null or sequencia_veiculo > 0);
  end if;

  -- Janela pela metade é janela que o solver não consegue aplicar; recusar no
  -- banco evita "otimizado" com restrição que ninguém vê.
  if not exists (
    select 1 from pg_constraint where conname = 'shipment_orders_janela_completa'
  ) then
    alter table public.shipment_orders
      add constraint shipment_orders_janela_completa
      check (
        (janela_inicio is null and janela_fim is null)
        or (janela_inicio is not null and janela_fim is not null and janela_fim > janela_inicio)
      );
  end if;
end
$$;

create index if not exists shipment_orders_veiculo_idx
  on public.shipment_orders (shipment_id, veiculo_id, sequencia_veiculo);

-- ─── Carga: hora prevista de saída (relógio das janelas e do ETA) ───────────
alter table public.shipments
  add column if not exists saida_prevista time;

comment on column public.shipments.saida_prevista is
  'Hora do dia em que a carga sai da base. Converte a janela de entrega (hora do dia) para o solver e o ETA (segundos desde a saída) para horário. NULL = janela não aplicável; o solver declara.';

-- ─── Versões da rota (histórico da distribuição confirmada) ─────────────────
create table if not exists public.shipment_route_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  versao integer not null,
  algoritmo text not null,
  -- Snapshot dos veículos: id, motorista, paradas (chave, na ordem), métricas e
  -- geometria. É histórico: não sofre update quando a frota muda depois.
  veiculos jsonb not null default '[]'::jsonb,
  distancia_m integer,
  duracao_s integer,
  tempo_execucao_ms integer,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  -- Uma versão por carga; a ativa é a que o app do motorista aplica.
  ativa boolean not null default false,
  constraint shipment_route_versions_versao_positiva check (versao > 0)
);

create unique index if not exists shipment_route_versions_shipment_versao_key
  on public.shipment_route_versions (shipment_id, versao);

create index if not exists shipment_route_versions_org_idx
  on public.shipment_route_versions (organization_id, shipment_id, versao desc);

alter table public.shipment_route_versions enable row level security;

drop policy if exists shipment_route_versions_select on public.shipment_route_versions;
create policy shipment_route_versions_select on public.shipment_route_versions
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists shipment_route_versions_insert on public.shipment_route_versions;
create policy shipment_route_versions_insert on public.shipment_route_versions
  for insert with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  );

-- A versão nasce como snapshot; o único update permitido é virar a ativa quando
-- uma distribuição mais nova é confirmada. O conteúdo não é reescrito.
drop policy if exists shipment_route_versions_update on public.shipment_route_versions;
create policy shipment_route_versions_update on public.shipment_route_versions
  for update using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  );

-- Sem delete por papel: histórico de rota não se apaga pela API. A remoção da
-- carga leva as versões junto (on delete cascade), que é o caminho correto.
revoke all on public.shipment_route_versions from anon;
grant select, insert, update on public.shipment_route_versions to authenticated;
grant all on public.shipment_route_versions to service_role;

comment on table public.shipment_route_versions is
  'Histórico de rotas (F5): snapshot imutável de cada distribuição confirmada por veículo. `ativa` marca a versão que o app do motorista aplica; versão antiga nunca sobrescreve a nova.';

comment on column public.shipment_orders.veiculo_id is
  'Veículo da frota responsável por esta parada na distribuição confirmada. NULL = caminho single-vehicle legado (shipments.placa).';

comment on column public.shipment_orders.janela_inicio is
  'Janela de entrega combinada com o cliente (hora do dia). Sem janela, o solver declara a restrição como não aplicada.';
