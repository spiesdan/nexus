-- 0353 — TIRAR PEDIDO DA CARGA RENUMERA NA MESMA TRANSAÇÃO.
--
-- O DELETE apagava a linha e deixava a sequência 1,3 — a rota do motorista
-- e o romaneio mostravam um furo. Aqui remoção + renumeracao atômica; ninguém
-- mais depende de alguém notar e corrigir à mão.

create or replace function public.fn_remover_pedido_da_carga(
  p_org uuid,
  p_shipment uuid,
  p_order uuid
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_status text;
begin
  if (auth.jwt() ->> 'role') <> 'service_role'
     and not exists (select 1 from public.fn_user_org_ids() where fn_user_org_ids = p_org)
     and not public.fn_is_platform_admin() then
    raise exception 'shipment_org_invalida' using errcode = '42501';
  end if;

  select id, status into v_id, v_status
    from public.shipment_orders
   where organization_id = p_org
     and shipment_id = p_shipment
     and order_id = p_order
   for update;

  if not found then
    return jsonb_build_object('status', 'nao_encontrado');
  end if;
  if v_status not in ('na_carga', 'em_rota') then
    return jsonb_build_object('status', 'estado_invalido');
  end if;

  delete from public.shipment_orders where id = v_id;

  with numerados as (
    select id, row_number() over (order by sequencia, created_at) as nova
      from public.shipment_orders
     where organization_id = p_org and shipment_id = p_shipment
  )
  update public.shipment_orders s
     set sequencia = n.nova, updated_at = now()
    from numerados n
   where s.id = n.id
     and s.sequencia <> n.nova;

  return jsonb_build_object('status', 'removido', 'order_id', p_order);
end;
$$;

revoke execute on function public.fn_remover_pedido_da_carga(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_remover_pedido_da_carga(uuid, uuid, uuid) to authenticated, service_role;
