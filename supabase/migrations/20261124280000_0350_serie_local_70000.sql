-- 0350 — SÉRIE LOCAL COMEÇA EM 70.000 (decisão do dono, 24/11/2026).
--
-- 900.000 era grande demais. O Mercos está em ~19.732 e cresce ~500/mês:
-- a série local em 70.000 dá ~8 anos de folga antes de alcançar a faixa do
-- ERP. Não é número decorado — é a consequência medida do crescimento.
--
-- 0349 já está tomada por `mercos_run_tipo`; esta é a próxima livre.
--
-- Os 6 pedidos que usaram 900001..900006 são de HOJE, não têm nota fiscal
-- (só o vínculo `numero_mercos`), então renumerar é seguro. Os 28 pedidos
-- locais antigos (18538..19722, alguns com nota) NÃO são tocados.

do $$
declare
  v_org uuid := '4bc721ce-157a-41b9-97ae-ba633650859c';
  v_altas integer;
  v_contador integer;
begin
  -- Falha fechada: nada é renumerado se o estado não for exatamente o medido.
  select count(*) into v_altas
    from public.commercial_orders
   where numero between 900001 and 900006;
  -- Instalação fresca (e instalação já renumerada) não tem as 6 linhas:
  -- não há o que renumerar, e o update é um no-op idempotente.
  if v_altas > 0 then
  if v_altas <> 6 then
    raise exception 'serie_70000: esperados 6 pedidos em 900001..900006, achei %', v_altas;
  end if;

  if exists (
    select 1 from generate_series(900001, 900006) as n
    where not exists (
      select 1 from public.commercial_orders c
       where c.numero = n and c.organization_id = v_org and c.numero_mercos is not null
    )
  ) then
    raise exception 'serie_70000: um dos 6 números altos não é pedido do Mercos na org esperada';
  end if;

  if exists (select 1 from public.commercial_orders where numero between 70001 and 70006) then
    raise exception 'serie_70000: 70001..70006 já estão ocupados';
  end if;

  select ultimo_numero into v_contador
    from public.commercial_order_counters
   where organization_id = v_org;
  if v_contador is distinct from 900000 then
    raise exception 'serie_70000: contador é %, não 900000', v_contador;
  end if;

  -- Transação única (a migration roda inteira): o índice único por org nunca
  -- vê 70001..70006 duplicados porque eles estavam livres e saem juntos.
  update public.commercial_orders
     set numero = numero - 830000, updated_at = now()
   where numero between 900001 and 900006;

  -- Valor EXATO: `greatest(900000, 70006)` não serviria — a série alta venceria.
  update public.commercial_order_counters
     set ultimo_numero = 70006, updated_at = now()
   where organization_id = v_org;
  end if;
end;
$$;

create or replace function public.fn_proximo_numero_pedido(p_org uuid)
returns integer
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_numero integer;
begin
  if (auth.jwt() ->> 'role') <> 'service_role'
     and not exists (select 1 from public.fn_user_org_ids() where fn_user_org_ids = p_org)
     and not public.fn_is_platform_admin() then
    raise exception 'pedido_numero_org_invalida' using errcode = '42501';
  end if;

  insert into public.commercial_order_counters (organization_id, ultimo_numero, updated_at)
  values (p_org, 70000, now())
  on conflict (organization_id)
  do update set ultimo_numero = greatest(
                 public.commercial_order_counters.ultimo_numero + 1, 70000
               ),
                updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

alter function public.fn_proximo_numero_pedido(uuid) owner to postgres;
revoke execute on function public.fn_proximo_numero_pedido(uuid) from public, anon;
grant execute on function public.fn_proximo_numero_pedido(uuid) to authenticated, service_role;
