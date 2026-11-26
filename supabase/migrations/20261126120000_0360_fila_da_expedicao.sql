-- 0360 — A FILA DA EXPEDIÇÃO É CONTADA NO BANCO, NÃO NA PÁGINA.
--
-- A página carregava os pedidos elegíveis com `.limit(200)` e somava esse array.
-- Com 482 pedidos elegíveis a faixa mostrava 200 e o valor só dos 200 — número
-- que mente é pior que número ausente: o despachante planeja o dia por ele.
--
-- A função é SECURITY INVOKER de propósito. Ela é chamada pelo server component
-- com o client de sessão (cookie), e a RLS de `commercial_orders`,
-- `shipment_orders` e `shipments` continua valendo para o usuário que pediu a
-- tela. Não há bypass de tenant: `p_org` só estreita o que a RLS já deixaria
-- ler. Uma definer + service role contornaria a RLS e trocaria um número
-- subcontado por um número que pode vazar entre organizações.
--
-- "Aguardando" é o mesmo conceito da faixa: pedido com status embarcável que
-- NÃO está em carga viva. Carga cancelada devolve o pedido para a fila; carga
-- montando/em rota/concluída tira (a situação dele é a da carga). Sem esta
-- exclusão o total passaria a contar duas vezes o pedido já embarcado.
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
    and o.status in ('aprovado', 'faturado')
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

-- Duas origens de EXECUTE (regra 9): revogar `public` não tira o grant direto a
-- `anon`, e revogar `anon` não tira o que ele herda de PUBLIC. Revogamos as
-- duas e concedemos só a quem tem sessão — a RLS é quem decide as linhas.
revoke all on function public.fn_expedicao_fila(uuid) from public, anon;
grant execute on function public.fn_expedicao_fila(uuid) to authenticated, service_role;

comment on function public.fn_expedicao_fila(uuid) is
  'Fila da expedição por organização: pedidos embarcáveis ainda fora de carga viva e a soma em centavos. Invoker: a RLS do chamador continua valendo.';
