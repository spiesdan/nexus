-- 0326 — DEVOLUÇÃO NÃO CONCORRE COM A NOTA DE VENDA.
--
-- Medido em produção em 18/11/2026, no deploy da 1.57.0: o pedido 19560 tinha
-- DUAS NF-e autorizadas — 4634 (venda, 13/11) e 4644 (devolução, 16/11, com
-- `finalidade = 4` e `ref_nfe` da 4634). Não era duplicidade: era devolução.
--
-- A trava da 0315 ("um pedido, uma nota viva") foi escrita olhando só a venda.
-- Ela recusa qualquer segunda nota não cancelada para o mesmo pedido — e uma
-- devolução é, por definição, a segunda nota do mesmo pedido. O efeito prático
-- era duplo:
--
--   1. o INSERT de backfill da 0294 em `invoice_orders` abortava com
--      `invoice_pedido_ja_tem_nota_viva`, e o `|| true` do update.sh engolia o
--      erro — o schema parava ali em silêncio;
--   2. no dia a dia, emitir a devolução de uma venda já faturada seria recusado
--      pelo banco, com uma mensagem que fala de duplicidade.
--
-- A regra correta: a trava vale para notas de **venda** (finalidade 1 ou não
-- informada). Nota de devolução (finalidade 4) não ocupa o lugar da venda nem é
-- bloqueada por ela — inclusive porque devolução parcial pode gerar mais de uma.
--
-- Nada de histórico é reescrito: só o corpo das duas funções de trigger muda.

create or replace function private.fn_invoice_uma_viva_por_pedido()
returns trigger
language plpgsql
as $$
declare
  v_finalidade int;
begin
  if new.order_id is null or new.status = 'cancelada' then
    return new;
  end if;

  -- Devolução não concorre com a venda: é a segunda nota por natureza.
  v_finalidade := coalesce(nullif(new.extras_fiscais->>'finalidade', '')::int, 1);
  if v_finalidade = 4 then
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
       and coalesce(nullif(i.extras_fiscais->>'finalidade', '')::int, 1) <> 4
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
declare
  v_finalidade int;
  v_status text;
begin
  select coalesce(nullif(i.extras_fiscais->>'finalidade', '')::int, 1), i.status
    into v_finalidade, v_status
    from public.invoices i
   where i.id = new.invoice_id;

  -- Nota cancelada não ocupa o pedido, e devolução não concorre com a venda.
  if coalesce(v_finalidade, 1) = 4 or v_status = 'cancelada' then
    return new;
  end if;

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
       and coalesce(nullif(i.extras_fiscais->>'finalidade', '')::int, 1) <> 4
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
