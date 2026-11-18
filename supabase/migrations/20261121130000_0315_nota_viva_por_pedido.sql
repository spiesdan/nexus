-- 0315 — UM PEDIDO, UMA NOTA VIVA: a trava que era leitura agora é do banco.
--
-- Medido em 18/11/2026 em `lib/fiscal/emitir-nota.ts`: a regra "um pedido, uma
-- nota viva" era um SELECT em `invoices`/`invoice_orders` seguido de INSERT.
-- Dois cliques (ou um retry depois de timeout) podiam passar os dois pela mesma
-- leitura e criar DUAS notas vivas para o mesmo pedido — cada uma com job de
-- emissão, cada uma transmitindo à SEFAZ. O unique de `chave_acesso` só protege
-- depois da autorização; o dano fiscal acontece antes.
--
-- Esta migration não reescreve nem apaga histórico. Ela impede a SEGUNDA nota
-- viva daqui para frente:
--   - INSERT em `invoices` com `order_id` não nulo trava (advisory lock por
--     organização+pedido) e recusa se já existe outra nota não cancelada;
--   - INSERT em `invoice_orders` faz o mesmo para os pedidos secundários de uma
--     nota agrupada — sem isso, dois pedidos com principal diferente mas um
--     secundário em comum passariam;
--   - UPDATE só é checado quando a nota sai de `cancelada` ou troca de pedido,
--     para não bloquear o drain nem notas legadas duplicadas.
--
-- Nota cancelada continua liberando nova emissão (o filtro é `status <> 'cancelada'`).
-- Não há índice único global de propósito: instalação que já tenha duplicata
-- histórica não pode falhar no update por causa dela. O Sentinel detecta as
-- antigas; esta trava fecha as novas.

create or replace function private.fn_invoice_uma_viva_por_pedido()
returns trigger
language plpgsql
as $$
begin
  if new.order_id is null or new.status = 'cancelada' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Só interessa sair de cancelada ou trocar de pedido. Mudar pendente ->
    -- autorizada é a MESMA nota andando na fila, não uma segunda.
    if old.status <> 'cancelada' and new.order_id = old.order_id then
      return new;
    end if;
  end if;

  -- Serializa duas transações que tentam criar nota para o mesmo pedido. A
  -- segunda espera a primeira commitar e então enxerga a nota dela.
  perform pg_advisory_xact_lock(
    hashtextextended(new.organization_id::text || ':' || new.order_id::text, 0)
  );

  if exists (
    select 1
      from public.invoices i
     where i.organization_id = new.organization_id
       and i.order_id = new.order_id
       and i.id <> new.id
       and i.status <> 'cancelada'
  ) then
    raise exception 'invoice_pedido_ja_tem_nota_viva'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create or replace function private.fn_invoice_order_uma_viva()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(new.organization_id::text || ':' || new.order_id::text, 0)
  );

  if exists (
    select 1
      from public.invoice_orders io
      join public.invoices i on i.id = io.invoice_id
     where io.organization_id = new.organization_id
       and io.order_id = new.order_id
       and io.invoice_id <> new.invoice_id
       and i.status <> 'cancelada'
  ) then
    raise exception 'invoice_pedido_ja_tem_nota_viva'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function private.fn_invoice_uma_viva_por_pedido() from public, anon;
revoke all on function private.fn_invoice_order_uma_viva() from public, anon;
grant execute on function private.fn_invoice_uma_viva_por_pedido() to authenticated, service_role;
grant execute on function private.fn_invoice_order_uma_viva() to authenticated, service_role;

drop trigger if exists invoices_uma_viva_por_pedido on public.invoices;
create trigger invoices_uma_viva_por_pedido
  before insert or update on public.invoices
  for each row execute function private.fn_invoice_uma_viva_por_pedido();

drop trigger if exists invoice_orders_uma_viva on public.invoice_orders;
create trigger invoice_orders_uma_viva
  before insert or update on public.invoice_orders
  for each row execute function private.fn_invoice_order_uma_viva();
