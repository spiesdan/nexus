-- ============================================================================
-- 0243 — COMPRAS: FORNECEDORES + PEDIDOS DE COMPRA (NEXUS §47)
--
-- Pedido de compra com itens (snapshot de código/nome, como os itens de
-- venda), numeração atômica por org e recebimento que vira `entrada` no
-- razão (0242) + soma no saldo. Status: rascunho → enviado → recebido
-- (parcial conta como recebido com sobra pendente fora do escopo v1) ou
-- cancelado. Receber é idempotente por item (recebido_qtd): re-tick não
-- duplica entrada. FK do movimento amarrada aqui (sem forward ref na 0242).
-- ============================================================================

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  cnpj text,
  email text,
  telefone text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  ultimo_numero integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  numero integer not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'recebido', 'cancelado')),
  observacoes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists purchase_orders_org_numero_key
  on public.purchase_orders (organization_id, numero);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete set null,
  produto_codigo text not null,
  produto_nome text not null,
  quantidade integer not null check (quantidade > 0),
  recebido_qtd integer not null default 0 check (recebido_qtd >= 0),
  custo_unit_cents bigint not null check (custo_unit_cents >= 0),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  created_at timestamptz not null default now()
);

-- Amarra o movimento ao documento de compra (a 0242 criou a coluna solta).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_purchase_order_fk'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_purchase_order_fk
      foreign key (purchase_order_id) references public.purchase_orders(id) on delete restrict;
  end if;
end $$;

create or replace function public.fn_proximo_numero_compra(p_org uuid)
returns integer
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_numero integer;
begin
  if not exists (select 1 from public.fn_user_org_ids() where fn_user_org_ids = p_org)
     and not public.fn_is_platform_admin() then
    raise exception 'compra_numero_org_invalida' using errcode = '42501';
  end if;

  insert into public.purchase_order_counters (organization_id, ultimo_numero, updated_at)
  values (p_org, 1, now())
  on conflict (organization_id)
  do update set ultimo_numero = public.purchase_order_counters.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

alter function public.fn_proximo_numero_compra(uuid) owner to postgres;

revoke execute on function public.fn_proximo_numero_compra(uuid) from public, anon;
grant execute on function public.fn_proximo_numero_compra(uuid) to authenticated;
grant execute on function public.fn_proximo_numero_compra(uuid) to service_role;

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_order_counters enable row level security;

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists purchase_orders_write on public.purchase_orders;
create policy purchase_orders_write on public.purchase_orders
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists purchase_order_items_select on public.purchase_order_items;
create policy purchase_order_items_select on public.purchase_order_items
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists purchase_order_items_write on public.purchase_order_items;
create policy purchase_order_items_write on public.purchase_order_items
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists purchase_order_counters_select on public.purchase_order_counters;
create policy purchase_order_counters_select on public.purchase_order_counters
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists purchase_order_counters_write on public.purchase_order_counters;
create policy purchase_order_counters_write on public.purchase_order_counters
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

revoke all on public.suppliers from anon;
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;

revoke all on public.purchase_orders from anon;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant all on public.purchase_orders to service_role;

revoke all on public.purchase_order_items from anon;
grant select, insert, update, delete on public.purchase_order_items to authenticated;
grant all on public.purchase_order_items to service_role;

revoke all on public.purchase_order_counters from anon;
grant select, insert, update, delete on public.purchase_order_counters to authenticated;
grant all on public.purchase_order_counters to service_role;

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_purchase_orders_updated_at on public.purchase_orders;
create trigger trg_purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.fn_set_updated_at();

comment on table public.suppliers is
  'Fornecedores da org (NEXUS §47).';
comment on table public.purchase_orders is
  'Pedidos de compra (NEXUS §47): rascunho → enviado → recebido/cancelado. Receber vira entrada no razão.';
