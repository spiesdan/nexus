-- 0294 — AGRUPAMENTO DE PEDIDOS NUMA NOTA SÓ
--
-- Cliente que tirou três pedidos no mês quer UMA nota, não três. A NF-e aceita
-- vários itens por documento; o que ela não aceita é destinatário diferente por
-- item — e essa regra mora no app (`emitirNota` recusa clientes distintos).
--
-- `invoices.order_id` continua sendo o pedido PRINCIPAL (tudo que já lia uma
-- nota por pedido segue igual). Esta tabela guarda TODOS os pedidos da nota —
-- é o que o drain lê para somar os itens e o que impede um pedido de entrar em
-- duas notas vivas.
--
-- Backfill: toda nota que já existe vira um vínculo de um pedido só. Sem isto,
-- notas emitidas antes desta migration não teriam linha aqui e a checagem de
-- "pedido já faturado" passaria por cima delas.
--
-- Idempotente: roda em install (baseline) e em update (migration).

create table if not exists public.invoice_orders (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  order_id uuid not null references public.commercial_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invoice_id, order_id)
);

create index if not exists invoice_orders_org_pedido_idx
  on public.invoice_orders (organization_id, order_id);

comment on table public.invoice_orders is
  'Pedidos que compõem a nota. Uma linha por pedido; `invoices.order_id` guarda o principal. Agrupamento de pedidos do mesmo cliente numa NF-e só (0294).';

insert into public.invoice_orders (invoice_id, order_id, organization_id, created_at)
select i.id, i.order_id, i.organization_id, i.created_at
  from public.invoices i
 where i.order_id is not null
on conflict (invoice_id, order_id) do nothing;

alter table public.invoice_orders enable row level security;

drop policy if exists invoice_orders_select on public.invoice_orders;
create policy invoice_orders_select on public.invoice_orders
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

revoke all on table public.invoice_orders from public, anon;
grant select on table public.invoice_orders to authenticated;
grant all on table public.invoice_orders to service_role;
