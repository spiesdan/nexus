-- 0362 — O STATUS COMERCIAL QUE O PEDIDO TINHA AO EMBARCAR.
--
-- Embarcar leva o pedido para `expedido` (0214), e sair da carga o devolvia
-- para `aprovado` fixo — nos dois caminhos: DELETE de um pedido da carga e
-- DELETE da carga inteira. Isso perdia o status comercial anterior: um pedido
-- `faturado` (já com NF-e) voltava para a fila como `aprovado`, e o operador
-- não tinha como saber que ele já estava faturado. O dado existia no instante
-- do embarque e era descartado — não havia onde guardá-lo.
--
-- `shipment_orders.status_comercial_ao_embarcar` guarda esse instante. Ao sair
-- da carga, o pedido volta para o status gravado; carga legada (coluna NULL)
-- cai no `aprovado` de antes, que é o único fallback honesto para o que não
-- foi medido.
--
-- A coluna é histórica: não é reescrita quando o pedido avança depois do
-- embarque. A devolução só toca pedido ainda em `expedido` — quem já virou
-- `entregue` (ou foi faturado no meio do caminho) não regride.
--
-- Aditiva e idempotente; sem backfill (não há como reconstruir o status
-- anterior de cargas já encerradas).

alter table public.shipment_orders
  add column if not exists status_comercial_ao_embarcar text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'shipment_orders_status_ao_embarcar_valido'
  ) then
    alter table public.shipment_orders
      add constraint shipment_orders_status_ao_embarcar_valido
      check (
        status_comercial_ao_embarcar is null
        or status_comercial_ao_embarcar in ('aprovado', 'concluido', 'faturado')
      );
  end if;
end $$;

comment on column public.shipment_orders.status_comercial_ao_embarcar is
  'Status comercial do pedido no instante em que entrou nesta carga. Usado para devolvê-lo ao status certo ao sair da carga (NULL = carga anterior à 0362; fallback aprovado).';
