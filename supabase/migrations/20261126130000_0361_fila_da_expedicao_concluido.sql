-- 0361 — A FILA DA EXPEDIÇÃO CONTA O PEDIDO `concluido`.
--
-- A 0360 nasceu com `status in ('aprovado', 'faturado')`, mas o contrato da
-- Expedição (`STATUS_EMBARCAVEIS`, lib/schemas/expedicao.ts) inclui
-- `concluido` desde a 0302: é a venda fechada no ERP que ainda não tem nota, e
-- é justamente o status com que o pedido importado do Mercos nasce.
--
-- A consequência medida: a faixa "aguardando embarque" e a lista de pedidos
-- disponíveis discordavam. A lista (que lê o contrato) mostrava o pedido; a
-- faixa (que lê esta função) não o contava. O despachante planeja o dia pelo
-- número da faixa — número que mente é pior que número ausente.
--
-- Só o predicado muda. A função continua STABLE, SECURITY INVOKER (a RLS do
-- chamador vale) e com os mesmos grants: `p_org` só estreita o que a RLS já
-- deixaria ler.
--
-- Idempotente: roda em install (baseline) e em update (migration).

create or replace function public.fn_expedicao_fila(p_org uuid)
returns table (pedidos integer, valor_cents bigint)
  language sql
  stable
  security invoker
  set search_path to 'public', 'pg_temp'
as $$
  select
    count(*)::integer,
    coalesce(sum(o.total_cents), 0)::bigint
  from public.commercial_orders o
  where o.organization_id = p_org
    and o.status in ('aprovado', 'concluido', 'faturado')
    and not exists (
      select 1
        from public.shipment_orders so
        join public.shipments s on s.id = so.shipment_id
       where so.organization_id = p_org
         and so.order_id = o.id
         and s.status <> 'cancelada'
    );
$$;

alter function public.fn_expedicao_fila(uuid) owner to postgres;

revoke all on function public.fn_expedicao_fila(uuid) from public, anon;
grant execute on function public.fn_expedicao_fila(uuid) to authenticated, service_role;

comment on function public.fn_expedicao_fila(uuid) is
  'Fila da expedição por organização: pedidos embarcáveis (aprovado/concluído/faturado) ainda fora de carga viva e a soma em centavos. Invoker: a RLS do chamador continua valendo.';
