-- 0333 — PEDIDO + BAIXA DE ESTOQUE NA MESMA TRANSAÇÃO.
--
-- Hoje `criarPedidoComercial` grava pedido e itens, e SÓ DEPOIS baixa o estoque
-- item a item (select + update CAS). Se a baixa falha (corrida), o pedido fica
-- sem baixa e o erro só é logado. A decisão 4 manda o contrário: pedido e baixa
-- nascem juntos; falhou a baixa, o pedido NÃO nasce.
--
-- A função recebe o pedido já calculado (preço, desconto, crédito e aprovação
-- continuam em TS) e o número já alocado por `fn_proximo_numero_pedido` — a
-- alocação fora da transação preserva a validação de organização daquela função
-- (que usa `auth.uid()`). Aqui só a ESCRITA é atômica: insert do pedido, insert
-- dos itens e baixa, com rollback em qualquer falha.
--
-- Atrás da flag `ORDER_STOCK_ATOMIC` (default false); o caminho antigo continua
-- intacto enquanto ela não for ligada. `p_ignorar_estoque` é o escape de gerente
-- (decisão 3): se o saldo não cobre, a linha NÃO é baixada — o pedido nasce e o
-- estoque fica como está, que é o comportamento visível do override.

create or replace function public.fn_criar_pedido_com_estoque(
  p_org uuid,
  p_numero integer,
  p_pedido jsonb,
  p_itens jsonb,
  p_chave text default null,
  p_baixar_estoque boolean default true,
  p_ignorar_estoque boolean default false,
  p_permitir_negativo boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existente jsonb;
  v_pedido public.commercial_orders;
  v_item jsonb;
  v_afetadas integer;
begin
  if p_org is null or p_numero is null then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'pedido_sem_itens' using errcode = '22023';
  end if;

  -- Idempotência: mesma chave devolve o pedido que já existe, sem tocar estoque.
  if p_chave is not null then
    select to_jsonb(o) into v_existente
      from public.commercial_orders o
     where o.organization_id = p_org
       and o.chave_sincronizacao = p_chave;
    if v_existente is not null then
      return jsonb_build_object('ja_existia', true, 'pedido', v_existente);
    end if;
  end if;

  insert into public.commercial_orders (
    organization_id, numero, contact_id, cliente_nome, cliente_documento,
    vendedor_user_id, status, origem, moeda, subtotal_cents, desconto_cents,
    desconto_pct, frete_cents, total_cents, condicao_pagamento, exige_nf,
    forma_pagamento, price_table_id, informacoes_fiscais, observacoes,
    obs_interna, endereco_entrega, transportadora_nome, modalidade_frete,
    previsao_entrega, parcelas, created_by, chave_sincronizacao
  ) values (
    p_org,
    p_numero,
    nullif(p_pedido->>'contact_id', '')::uuid,
    p_pedido->>'cliente_nome',
    nullif(p_pedido->>'cliente_documento', ''),
    nullif(p_pedido->>'vendedor_user_id', '')::uuid,
    coalesce(p_pedido->>'status', 'rascunho'),
    coalesce(p_pedido->>'origem', 'vendedor'),
    coalesce(p_pedido->>'moeda', 'BRL'),
    coalesce((p_pedido->>'subtotal_cents')::int, 0),
    coalesce((p_pedido->>'desconto_cents')::int, 0),
    nullif(p_pedido->>'desconto_pct', '')::numeric,
    coalesce((p_pedido->>'frete_cents')::int, 0),
    coalesce((p_pedido->>'total_cents')::int, 0),
    nullif(p_pedido->>'condicao_pagamento', ''),
    coalesce((p_pedido->>'exige_nf')::boolean, false),
    nullif(p_pedido->>'forma_pagamento', ''),
    nullif(p_pedido->>'price_table_id', '')::uuid,
    nullif(p_pedido->>'informacoes_fiscais', ''),
    nullif(p_pedido->>'observacoes', ''),
    nullif(p_pedido->>'obs_interna', ''),
    nullif(p_pedido->>'endereco_entrega', ''),
    nullif(p_pedido->>'transportadora_nome', ''),
    coalesce(p_pedido->>'modalidade_frete', 'retirada'),
    nullif(p_pedido->>'previsao_entrega', '')::date,
    coalesce(p_pedido->'parcelas', '[]'::jsonb),
    nullif(p_pedido->>'created_by', '')::uuid,
    p_chave
  )
  returning * into v_pedido;

  insert into public.commercial_order_items (
    organization_id, order_id, posicao, product_id, produto_codigo,
    produto_nome, quantidade, preco_unit_cents, desconto_pct, subtotal_cents
  )
  select
    p_org,
    v_pedido.id,
    coalesce((i->>'posicao')::int, (ord - 1)::int),
    nullif(i->>'product_id', '')::uuid,
    coalesce(i->>'produto_codigo', 'AVULSO'),
    coalesce(i->>'produto_nome', 'Item avulso'),
    (i->>'quantidade')::int,
    (i->>'preco_unit_cents')::int,
    coalesce((i->>'desconto_pct')::numeric, 0),
    (i->>'subtotal_cents')::int
  from jsonb_array_elements(p_itens) with ordinality as t(i, ord);

  if p_baixar_estoque then
    for v_item in select value from jsonb_array_elements(p_itens) loop
      if (v_item->>'product_id') is not null then
        if p_ignorar_estoque then
          -- Escape de gerente: a linha sem saldo NÃO é baixada (o saldo fica
          -- intacto); o pedido nasce com o override visível/motivado/auditado.
          update public.catalog_products
             set quantidade = quantidade - (v_item->>'quantidade')::int
           where id = (v_item->>'product_id')::uuid
             and organization_id = p_org
             and controla_estoque
             and quantidade >= (v_item->>'quantidade')::int;
        elsif p_permitir_negativo then
          update public.catalog_products
             set quantidade = quantidade - (v_item->>'quantidade')::int
           where id = (v_item->>'product_id')::uuid
             and organization_id = p_org
             and controla_estoque;
        else
          update public.catalog_products
             set quantidade = quantidade - (v_item->>'quantidade')::int
           where id = (v_item->>'product_id')::uuid
             and organization_id = p_org
             and controla_estoque
             and quantidade >= (v_item->>'quantidade')::int;
          get diagnostics v_afetadas = row_count;
          if v_afetadas = 0 then
            -- 0 linhas = produto controlado sem saldo OU produto inexistente.
            -- Só o primeiro é falha de negócio; o segundo o TS já barrou.
            if exists (
              select 1 from public.catalog_products
               where id = (v_item->>'product_id')::uuid
                 and organization_id = p_org
                 and controla_estoque
            ) then
              raise exception 'estoque_insuficiente:%',
                coalesce(v_item->>'produto_nome', 'item')
                using errcode = 'P0001';
            end if;
          end if;
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ja_existia', false, 'pedido', to_jsonb(v_pedido));

exception
  when unique_violation then
    -- Corrida entre dois POSTs com a mesma chave: o primeiro venceu; devolve o
    -- dele em vez de criar outro. O rollback já desfez itens/baixa deste.
    if p_chave is not null then
      select to_jsonb(o) into v_existente
        from public.commercial_orders o
       where o.organization_id = p_org
         and o.chave_sincronizacao = p_chave;
      if v_existente is not null then
        return jsonb_build_object('ja_existia', true, 'pedido', v_existente);
      end if;
    end if;
    raise;
end;
$$;

comment on function public.fn_criar_pedido_com_estoque(uuid, integer, jsonb, jsonb, text, boolean, boolean, boolean) is
  'Cria pedido + itens + baixa de estoque na MESMA transação (0333). Chamada só pelo servidor (service_role), atrás de ORDER_STOCK_ATOMIC. Falha de estoque levanta P0001 estoque_insuficiente:<nome>; o rollback não deixa pedido nem movimento. p_ignorar_estoque é o escape de gerente (baixa só o saldo coberto).';

revoke execute on function public.fn_criar_pedido_com_estoque(uuid, integer, jsonb, jsonb, text, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_criar_pedido_com_estoque(uuid, integer, jsonb, jsonb, text, boolean, boolean, boolean)
  to service_role;
