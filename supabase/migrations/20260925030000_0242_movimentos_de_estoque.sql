-- ============================================================================
-- 0242 — MOVIMENTAÇÕES DE ESTOQUE + MÍNIMO (NEXUS §46, fundação)
--
-- Até aqui o saldo vivia só em `catalog_products.quantidade`, sem rastro de
-- quem mexeu: ajuste manual, recebimento e saída eram o mesmo UPDATE mudo.
-- `inventory_movements` é o razão (quem/quando/quanto/porquê); `quantidade`
-- segue como saldo cacheado, atualizado pelos mesmos escritores.
--
--   tipo: entrada | saida (quantidade > 0) | ajuste (delta com sinal, != 0);
--   origem: manual | compra | pedido | inventario;
--   order_id / purchase_order_id: o documento que gerou (quando houver).
-- Sem trigger de negócio: quem escreve a movimentação atualiza o saldo na
-- mesma transação, explícito e auditado na API. RLS molde 0212/0221.
-- ============================================================================

alter table public.catalog_products
  add column if not exists estoque_minimo integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_products_estoque_minimo_valido'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_estoque_minimo_valido check (estoque_minimo >= 0);
  end if;
end $$;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  quantidade integer not null check (
    (tipo in ('entrada', 'saida') and quantidade > 0)
    or (tipo = 'ajuste' and quantidade <> 0)
  ),
  origem text not null default 'manual' check (origem in ('manual', 'compra', 'pedido', 'inventario')),
  order_id uuid references public.commercial_orders(id) on delete restrict,
  -- FK para purchase_orders sai na 0243 (a tabela nasce lá; sem forward reference).
  purchase_order_id uuid,
  observacao text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.inventory_movements enable row level security;

drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists inventory_movements_write on public.inventory_movements;
create policy inventory_movements_write on public.inventory_movements
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

revoke all on public.inventory_movements from anon;
grant select, insert, update, delete on public.inventory_movements to authenticated;
grant all on public.inventory_movements to service_role;

create index if not exists inventory_movements_produto_idx
  on public.inventory_movements (organization_id, product_id, created_at desc);

comment on table public.inventory_movements is
  'Razão do estoque (NEXUS §46): cada linha diz quem/quando/quanto/porquê. O saldo em catalog_products.quantidade é cache atualizado pelos mesmos escritores.';
comment on column public.catalog_products.estoque_minimo is
  'Ponto de atenção (NEXUS §46): abaixo disto o produto entra na sugestão de compra.';
