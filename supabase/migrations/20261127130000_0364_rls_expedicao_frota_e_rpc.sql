-- 0364 — RLS DA EXPEDIÇÃO: FROTA SÓ MANAGER E RPCs DEFINER SÓ AGENT+.
--
-- Fonte: docs/auditoria (E4) e `Shared/nexus-expedicao/seguranca-plano-rls.md`,
-- seções P1-1 e P1-2. Só o que NÃO depende de decisão do dono. P0-2 (DELETE de
-- carga), P1-3 (retenção/GPS) e P1-4 (modo entregador) ficam para a 0365.
--
-- ─── P1-1 · frota ────────────────────────────────────────────────────────────
--
-- A 0306 criou `fleet_vehicles`/`fleet_drivers` com INSERT/UPDATE/DELETE
-- liberados a QUALQUER membro (`organization_id in (select fn_user_org_ids())`).
-- As rotas já exigem `manager` (fleet/vehicles:40, [id]:23,70; fleet/drivers:40,
-- [id]:23,79) e a UI só mostra edição para manager — a policy era a única porta
-- mais frouxa. Um `viewer` com a anon key + o próprio JWT criava/apagava
-- veículo e motorista pelo PostgREST, sem audit.
--
-- Nomes de policy PRESERVADOS (`fleet_vehicles_insert` etc.); SELECT continua
-- org-flat (a distribuição e o modo motorista leem placa/motorista da carga).
-- revoke/grant como o plano manda: a 0306 não tinha bloco de ACL próprio.
--
-- ─── P1-2 · RPCs SECURITY DEFINER ────────────────────────────────────────────
--
-- `fn_salvar_ordem_rota` (0335) e `fn_remover_pedido_da_carga` (0353) validavam
-- só membership. A rota que as chama exige `agent`, então um `viewer` podia
-- chamar `/rest/v1/rpc/...` e reescrever sequência/origem/geometria/versão da
-- carga — ou remover pedido — sem passar pela rota nem pelo audit.
--
-- O corpo é o da migration original; só o bloco de guarda muda. O nome do erro
-- é o que cada função já usa (`sem_membrosia`/`shipment_org_invalida` davam a
-- ideia de tenant; agora o motivo é papel).
--
-- `coalesce(auth.jwt() ->> 'role', '')` de propósito: `auth.jwt()` devolve `{}`
-- quando não há claim, e `null <> 'service_role'` é NULL — dentro de um `if`,
-- NULL é falso e a guarda passaria. Com o coalesce, quem não é service_role
-- cai na checagem de papel (fail-closed). service_role e platform admin
-- continuam passando (worker/cron não tem `auth.uid()`).
--
-- Idempotente: roda em install (baseline) e em update (migration).

-- ─── Frota: escrita manager+ (nomes preservados) ─────────────────────────────

drop policy if exists "fleet_vehicles_insert" on public.fleet_vehicles;
create policy "fleet_vehicles_insert" on public.fleet_vehicles
  for insert with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

drop policy if exists "fleet_vehicles_update" on public.fleet_vehicles;
create policy "fleet_vehicles_update" on public.fleet_vehicles
  for update using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

drop policy if exists "fleet_vehicles_delete" on public.fleet_vehicles;
create policy "fleet_vehicles_delete" on public.fleet_vehicles
  for delete using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

drop policy if exists "fleet_drivers_insert" on public.fleet_drivers;
create policy "fleet_drivers_insert" on public.fleet_drivers
  for insert with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

drop policy if exists "fleet_drivers_update" on public.fleet_drivers;
create policy "fleet_drivers_update" on public.fleet_drivers
  for update using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

drop policy if exists "fleet_drivers_delete" on public.fleet_drivers;
create policy "fleet_drivers_delete" on public.fleet_drivers
  for delete using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

revoke all on public.fleet_vehicles from anon;
revoke all on public.fleet_vehicles from authenticated;
grant select, insert, update, delete on public.fleet_vehicles to authenticated;
grant all on public.fleet_vehicles to service_role;

revoke all on public.fleet_drivers from anon;
revoke all on public.fleet_drivers from authenticated;
grant select, insert, update, delete on public.fleet_drivers to authenticated;
grant all on public.fleet_drivers to service_role;

-- ─── fn_salvar_ordem_rota: guarda agent+ ─────────────────────────────────────

create or replace function public.fn_salvar_ordem_rota(
  p_org uuid,
  p_shipment uuid,
  p_itens jsonb,
  p_carga jsonb,
  p_versao_esperada integer,
  p_rota_em timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_novo integer;
  v_item jsonb;
begin
  -- Mesma fonte das policies: membership + papel. service_role e platform admin
  -- continuam passando (worker não tem auth.uid()).
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.fn_is_platform_admin()
     and not public.fn_role_at_least(p_org, 'agent') then
    raise exception 'sem_papel' using errcode = '42501';
  end if;

  select count(*) into v_total
    from public.shipment_orders so
   where so.shipment_id = p_shipment
     and so.organization_id = p_org;

  if v_total = 0 then
    raise exception 'carga_sem_paradas';
  end if;
  if coalesce(jsonb_typeof(p_itens), '') <> 'array'
     or jsonb_array_length(p_itens) <> v_total then
    raise exception 'cobertura_incompleta';
  end if;

  -- Validação ANTES de qualquer UPDATE.
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     group by i->>'id' having count(*) > 1
  ) then
    raise exception 'item_duplicado';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     where not exists (
       select 1 from public.shipment_orders so
        where so.id = (i->>'id')::uuid
          and so.shipment_id = p_shipment
          and so.organization_id = p_org
     )
  ) then
    raise exception 'item_estranho';
  end if;
  if exists (
    select 1 from generate_series(1, v_total) s
     where not exists (
       select 1 from jsonb_array_elements(p_itens) i
        where (i->>'sequencia')::integer = s
     )
  ) then
    raise exception 'sequencia_incompleta';
  end if;

  -- CAS da versão: se outra aba gravou primeiro, NADA é escrito.
  update public.shipments s
     set origem_endereco = coalesce(p_carga->>'origem_endereco', s.origem_endereco),
         origem_lat = case when p_carga ? 'origem_lat' and p_carga->>'origem_lat' <> 'null'
                           then (p_carga->>'origem_lat')::double precision else s.origem_lat end,
         origem_lng = case when p_carga ? 'origem_lng' and p_carga->>'origem_lng' <> 'null'
                           then (p_carga->>'origem_lng')::double precision else s.origem_lng end,
         retornar_origem = case when p_carga ? 'retornar_origem'
                                then (p_carga->>'retornar_origem')::boolean else s.retornar_origem end,
         tempo_parada_min = case when p_carga ? 'tempo_parada_min'
                                 then (p_carga->>'tempo_parada_min')::integer else s.tempo_parada_min end,
         distancia_m = case when p_carga ? 'distancia_m' and p_carga->>'distancia_m' <> 'null'
                            then (p_carga->>'distancia_m')::integer else s.distancia_m end,
         duracao_s = case when p_carga ? 'duracao_s' and p_carga->>'duracao_s' <> 'null'
                          then (p_carga->>'duracao_s')::integer else s.duracao_s end,
         rota_geojson = case when coalesce(p_carga->>'limpar_geojson', 'false')::boolean
                             then null
                             when p_carga ? 'rota_geojson' then p_carga->'rota_geojson'
                             else s.rota_geojson end,
         rota_em = coalesce(p_rota_em, now()),
         rota_versao = s.rota_versao + 1,
         updated_at = now()
   where s.id = p_shipment
     and s.organization_id = p_org
     and s.rota_versao = p_versao_esperada
     and s.status in ('montando', 'em_rota');

  if not found then
    raise exception 'concorrencia_ou_status';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    update public.shipment_orders so
       set sequencia = (v_item->>'sequencia')::integer,
           updated_at = now()
     where so.id = (v_item->>'id')::uuid
       and so.organization_id = p_org
       and so.shipment_id = p_shipment;
    if not found then
      raise exception 'item_perdido';
    end if;
  end loop;

  select rota_versao into v_novo
    from public.shipments where id = p_shipment and organization_id = p_org;

  return jsonb_build_object('rota_versao', v_novo, 'paradas', v_total);
end;
$$;

comment on function public.fn_salvar_ordem_rota(uuid, uuid, jsonb, jsonb, integer, timestamptz) is
  'Grava ordem da rota, campos da carga e rota_versao na MESMA transação (0335). Valida cobertura/separação antes de escrever; CAS em rota_versao. Qualquer falha levanta exceção e o rollback desfaz versão e sequências. Atrás de ROTA_ORDEM_ATOMIC (default false).';

revoke execute on function public.fn_salvar_ordem_rota(uuid, uuid, jsonb, jsonb, integer, timestamptz)
  from public, anon;
grant execute on function public.fn_salvar_ordem_rota(uuid, uuid, jsonb, jsonb, integer, timestamptz)
  to authenticated, service_role;

-- ─── fn_remover_pedido_da_carga: guarda agent+ ───────────────────────────────

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
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.fn_is_platform_admin()
     and not public.fn_role_at_least(p_org, 'agent') then
    raise exception 'shipment_papel_invalido' using errcode = '42501';
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
