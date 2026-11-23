-- 0335 — ORDEM DA ROTA EM UMA TRANSAÇÃO SÓ.
--
-- Hoje PATCH /rota/ordem faz N updates em `shipment_orders`, depois o update em
-- `shipments` que sobe `rota_versao`. Se o meio falha, sobra sequência parcial
-- com versão velha — e o motorista aplica uma rota que não é a que o escritório
-- viu. `publicarRota()` ainda chama depois o POST /iniciar, então uma falha no
-- meio vira publicação pela metade.
--
-- A função valida cobertura/separação ANTES de qualquer escrita: todo item
-- passado deve pertencer à carga da org, não pode repetir, e as sequências
-- devem ser exatamente 1..N. Depois sobe a versão com CAS (`rota_versao =
-- p_versao_esperada`) e grava as sequências. QUALQUER falha levanta exceção e o
-- rollback desfaz versão E sequências — não existe "compensação" manual: a
-- transação é a compensação.
--
-- Atrás da flag `ROTA_ORDEM_ATOMIC` (default false); o caminho antigo fica
-- intacto até o dono ligar. Security definer com search_path fixo, sem bossa
-- de RLS: a org vem da rota (authz) e é conferida em todo update.

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
  -- Guarda de tenant: a função é executável por `authenticated` porque a rota
  -- PATCH /rota/ordem chama com o client de sessão; confere membership antes
  -- de qualquer escrita (a rota também tem requireRole).
  if coalesce(auth.uid()::text, '') = ''
     or not exists (
       select 1 from public.user_organizations uo
        where uo.user_id = auth.uid() and uo.organization_id = p_org
     ) then
    raise exception 'sem_membrosia';
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
