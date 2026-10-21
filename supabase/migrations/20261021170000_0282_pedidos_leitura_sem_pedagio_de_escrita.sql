-- 0282 — leitura de pedidos não paga o pedágio de escrita
--
-- `commercial_orders_write` foi criada como `for all` (sem `for`), então a
-- checagem de papel (`fn_role_at_least(organization_id, 'agent')`) também
-- rodava em TODO SELECT. Medido em 21/10/2026, com 11.491 pedidos: 1.000
-- linhas levavam 2,4 s como `authenticated`, e o dashboard carrega 5.000 em
-- cinco rajadas paralelas — acima do statement_timeout do PostgREST. O
-- resultado era `r.error` em `carregarJanelaDeVendas`, que devolve lista vazia
-- e o painel mostrava R$ 0,00 com `cortado: false`.
--
-- A leitura já tem policy própria (`commercial_orders_select`): membro da
-- organização lê; visitante não. A escrita continua de `agent` para cima, mas
-- em policies separadas por comando. Separar não afrouxa nada: INSERT, UPDATE
-- e DELETE mantêm exatamente a mesma condição de antes; SELECT deixa de
-- avaliá-la.
drop policy if exists commercial_orders_write on public.commercial_orders;

drop policy if exists commercial_orders_insert on public.commercial_orders;
create policy commercial_orders_insert on public.commercial_orders
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists commercial_orders_update on public.commercial_orders;
create policy commercial_orders_update on public.commercial_orders
  for update using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  ) with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists commercial_orders_delete on public.commercial_orders;
create policy commercial_orders_delete on public.commercial_orders
  for delete using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
