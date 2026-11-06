-- ============================================================================
-- 0297 — O PEDIDO QUE MUDOU NO MERCOS
--
-- O problema medido em 06/11/2026: um vendedor externo alterou um pedido no
-- Mercos, o pedido já tinha sido importado com o dado velho, e a alteração
-- nunca chegou. A expedição saiu com o cliente/cidade/itens antigos.
--
-- São DUAS portas fechadas, e as duas precisam abrir:
--
--   1. `fn_importar_pedido_mercos` para no número que já existe
--      (`numero_ja_existe`) e não atualiza nada;
--   2. o coletor só caminha para frente (corta quando o maior número da
--      página é <= o maior já importado), então nem relê o pedido.
--
-- Esta migration abre a porta 1 com uma função SEPARADA, e não mexendo na
-- importação: importar é criar, sincronizar é corrigir, e misturar os dois
-- faria o caminho de criação pagar o custo de diff em toda linha.
--
-- ─── A política, que é o que importa ──────────────────────────────────────
--
-- O Mercos manda em: cliente (nome/documento), endereço de entrega (cidade/UF
-- do contato) e itens/totais. NÃO manda em: status do ciclo, vendedor, carga,
-- ajuste fiscal. Essas são decisões do nosso lado; sobrescrever seria perder
-- trabalho feito aqui.
--
-- Travas, todas devolvidas como `bloqueado` com motivo nomeado:
--   - nota emitida (ou em fila) no pedido → o documento fiscal congela os itens;
--   - pedido `entregue` ou `cancelado` → ciclo encerrado.
--
-- Pedido que JÁ está numa carga: atualiza e MARCA a carga para reconferência
-- (`shipment_orders.reconferir_em`). Quem embarcou precisa saber que o que
-- estava no romaneio mudou depois de embarcar — sem tirar o pedido da carga
-- por conta própria, que é decisão de quem opera a expedição.
--
-- Identidade: `numero` + `origem = 'mercos'`. Pedido local com o mesmo número
-- (o caso dos 18538..18558 de demonstração) continua intocável — a função
-- devolve `nao_encontrado` e quem chama cai no import, que pula.
-- ============================================================================

alter table public.commercial_orders
  add column if not exists mercos_sincronizado_em timestamptz,
  add column if not exists mercos_ultima_mudanca jsonb;

comment on column public.commercial_orders.mercos_sincronizado_em is
  'Quando a revisão do Mercos conferiu os dados deste pedido. NULL = nunca revisado depois da importação.';

comment on column public.commercial_orders.mercos_ultima_mudanca is
  'Última mudança aplicada pela revisão do Mercos: {"em": timestamptz, "campos": [{campo, de, para}]}. NULL = a última revisão não mudou nada.';

alter table public.shipment_orders
  add column if not exists reconferir_em timestamptz,
  add column if not exists reconferir_motivo text;

comment on column public.shipment_orders.reconferir_em is
  'Quando o pedido mudou no Mercos DEPOIS de entrar na carga. A expedição mostra o aviso; a carga não é alterada sozinha.';

comment on column public.shipment_orders.reconferir_motivo is
  'O que mudou, em texto para quem está no pátio: campos alterados pelo Mercos.';

alter table public.mercos_import_runs
  add column if not exists orders_updated integer not null default 0,
  add column if not exists revisar_numeros integer[];

comment on column public.mercos_import_runs.revisar_numeros is
  'Revisão sob demanda: números de pedido a reconferir no Mercos. NULL = revisão normal (janela recente).';

alter table public.mercos_import_runs
  drop constraint if exists mercos_import_runs_contadores_nao_negativos;
alter table public.mercos_import_runs
  add constraint mercos_import_runs_contadores_nao_negativos check (
    orders_new >= 0
    and orders_skipped >= 0
    and items_new >= 0
    and customers_new >= 0
    and orders_updated >= 0
  );

create or replace function public.fn_sincronizar_pedido_mercos(
  p_org uuid,
  p_pedido jsonb,
  p_aplicar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_order public.commercial_orders;
  v_itens jsonb;
  v_soma bigint := 0;
  v_total bigint;
  v_subtotal bigint;
  v_frete bigint;
  v_nome text;
  v_documento text;
  v_condicao text;
  v_cidade text;
  v_uf text;
  v_cidade_atual text;
  v_uf_atual text;
  v_cidade_contato text;
  v_uf_contato text;
  v_sig_atual jsonb;
  v_sig_nova jsonb;
  v_mudancas jsonb := '[]'::jsonb;
  v_tem_nota boolean := false;
  v_shipment_id uuid;
  v_shipment_status text;
  v_item jsonb;
  v_posicao integer := 0;
  v_produto_id uuid;
  v_codigo text;
  v_descricao text;
  v_quantidade integer;
  v_preco bigint;
  v_item_subtotal bigint;
  v_itens_norm jsonb := '[]'::jsonb;
  v_itens_qtd integer := 0;
  v_qtd_nova integer := 0;
  v_qtd_atual integer := 0;
  v_vendedor text;
begin
  if p_org is null then
    raise exception 'organizacao obrigatoria';
  end if;
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' then
    raise exception 'pedido invalido';
  end if;

  v_numero := nullif(p_pedido->>'numero', '')::integer;
  if v_numero is null or v_numero <= 0 then
    raise exception 'numero do pedido invalido';
  end if;

  select * into v_order
    from public.commercial_orders
   where organization_id = p_org
     and numero = v_numero
     and origem = 'mercos'
   limit 1;

  if v_order.id is null then
    return jsonb_build_object('status', 'nao_encontrado', 'numero', v_numero);
  end if;

  -- ─── Travas: o que o ERP não pode reescrever ──────────────────────────────
  select exists (
    select 1 from public.invoice_orders io
     where io.organization_id = p_org and io.order_id = v_order.id
    union all
    select 1 from public.invoices i
     where i.organization_id = p_org and i.order_id = v_order.id
  ) into v_tem_nota;

  if v_tem_nota then
    return jsonb_build_object(
      'status', 'bloqueado', 'numero', v_numero, 'order_id', v_order.id,
      'motivo', 'nota_emitida'
    );
  end if;

  if v_order.status in ('entregue', 'cancelado') then
    return jsonb_build_object(
      'status', 'bloqueado', 'numero', v_numero, 'order_id', v_order.id,
      'motivo', 'pedido_encerrado'
    );
  end if;

  -- ─── Itens normalizados (mesma régua da importação) ───────────────────────
  v_itens := coalesce(p_pedido->'itens', '[]'::jsonb);
  if jsonb_typeof(v_itens) <> 'array' then
    raise exception 'itens invalidos';
  end if;

  select coalesce(sum((i->>'subtotal_cents')::bigint), 0)
    into v_soma
    from jsonb_array_elements(v_itens) i;

  v_total := coalesce(nullif(p_pedido->>'total_cents', '')::bigint, 0);
  if v_soma <> v_total then
    return jsonb_build_object(
      'status', 'divergente', 'numero', v_numero, 'order_id', v_order.id,
      'motivo', format('soma dos itens %s != total %s', v_soma, v_total)
    );
  end if;

  for v_item in select value from jsonb_array_elements(v_itens) loop
    v_posicao := v_posicao + 1;
    v_codigo := nullif(trim(coalesce(v_item->>'codigo', '')), '');
    v_descricao := nullif(trim(coalesce(v_item->>'descricao', '')), '');
    if v_codigo is null then
      v_codigo := v_descricao;
    end if;
    if v_descricao is null then
      v_descricao := v_codigo;
    end if;
    if v_codigo is null then
      raise exception 'item % sem codigo e sem descricao', v_posicao;
    end if;

    v_quantidade := greatest(1, round(coalesce(nullif(v_item->>'quantidade', '')::numeric, 1))::integer);
    v_item_subtotal := coalesce(nullif(v_item->>'subtotal_cents', '')::bigint, 0);
    v_preco := coalesce(
      nullif(v_item->>'preco_unit_cents', '')::bigint,
      case when v_quantidade > 0 then v_item_subtotal / v_quantidade else 0 end
    );

    v_itens_norm := v_itens_norm || jsonb_build_array(jsonb_build_object(
      'codigo', v_codigo,
      'descricao', left(v_descricao, 300),
      'quantidade', v_quantidade,
      'preco', v_preco,
      'subtotal', v_item_subtotal
    ));
  end loop;
  v_itens_qtd := jsonb_array_length(v_itens_norm);
  select coalesce(sum((x->>'quantidade')::integer), 0)
    into v_qtd_nova
    from jsonb_array_elements(v_itens_norm) x;

  -- Assinatura comparável: código + quantidade + preço + subtotal, na ordem.
  -- Descrição muda de acento/espaço no ERP e não justifica reescrever o item.
  select coalesce(jsonb_agg(jsonb_build_array(x->>'codigo', x->>'quantidade', x->>'preco', x->>'subtotal') order by ord), '[]'::jsonb)
    into v_sig_nova
    from jsonb_array_elements(v_itens_norm) with ordinality as t(x, ord);

  select coalesce(
           jsonb_agg(
             jsonb_build_array(
               it.produto_codigo, it.quantidade::text, it.preco_unit_cents::text, it.subtotal_cents::text
             ) order by it.posicao
           ),
           '[]'::jsonb
         )
    into v_sig_atual
    from public.commercial_order_items it
   where it.order_id = v_order.id;

  -- ─── Cabeçalho e endereço ─────────────────────────────────────────────────
  v_nome := nullif(trim(coalesce(p_pedido->>'cliente_nome', '')), '');
  if v_nome is null then
    v_nome := nullif(trim(coalesce(p_pedido->'cliente'->>'razao', '')), '');
  end if;
  if v_nome is null then
    raise exception 'cliente sem nome';
  end if;
  v_nome := left(v_nome, 300);

  v_documento := nullif(trim(coalesce(p_pedido->>'cliente_documento', p_pedido->'cliente'->>'documento', '')), '');
  v_condicao := nullif(trim(coalesce(p_pedido->>'condicao_pagamento', '')), '');
  v_subtotal := coalesce(nullif(p_pedido->>'subtotal_cents', '')::bigint, v_soma);
  v_frete := coalesce(nullif(p_pedido->>'frete_cents', '')::bigint, 0);
  v_vendedor := nullif(trim(coalesce(p_pedido->>'vendedor', '')), '');

  -- O Mercos manda a cidade numa linha só ("Canoinhas, SC"). A importação
  -- gravava isso cru em `contacts.cidade`, com a UF dentro e `uf` nulo — a
  -- expedição então exibia "Canoinhas, SC/". Aqui separa antes de comparar,
  -- e compara com o cadastro já separado, para não marcar mudança onde só
  -- havia sujeira de formato na primeira revisão.
  v_cidade := nullif(trim(coalesce(p_pedido->'cliente'->>'cidade', '')), '');
  v_uf := nullif(trim(coalesce(p_pedido->'cliente'->>'uf', '')), '');
  if v_cidade is not null and v_cidade ~ '[,/]\s*[A-Za-z]{2}\s*$' then
    v_uf := upper(right(btrim(v_cidade), 2));
    v_cidade := btrim(left(btrim(v_cidade), length(btrim(v_cidade)) - 3));
    v_cidade := regexp_replace(v_cidade, '[,/\s]+$', '');
  end if;
  v_cidade_contato := null;
  v_uf_contato := null;
  if v_order.contact_id is not null then
    select c.cidade, c.uf into v_cidade_contato, v_uf_contato
      from public.contacts c where c.id = v_order.contact_id;
    v_cidade_atual := nullif(trim(coalesce(v_cidade_contato, '')), '');
    v_uf_atual := nullif(trim(coalesce(v_uf_contato, '')), '');
    if v_cidade_atual is not null and v_cidade_atual ~ '[,/]\s*[A-Za-z]{2}\s*$' then
      v_uf_atual := coalesce(v_uf_atual, upper(right(btrim(v_cidade_atual), 2)));
      v_cidade_atual := btrim(left(btrim(v_cidade_atual), length(btrim(v_cidade_atual)) - 3));
      v_cidade_atual := regexp_replace(v_cidade_atual, '[,/\s]+$', '');
    end if;
  else
    v_cidade_atual := null;
    v_uf_atual := null;
  end if;

  -- ─── Diff ─────────────────────────────────────────────────────────────────
  if v_order.cliente_nome is distinct from v_nome then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'cliente_nome', 'de', v_order.cliente_nome, 'para', v_nome));
  end if;
  if coalesce(v_order.cliente_documento, '') is distinct from coalesce(v_documento, '') then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'cliente_documento', 'de', v_order.cliente_documento, 'para', v_documento));
  end if;
  if coalesce(v_order.condicao_pagamento, '') is distinct from coalesce(v_condicao, '') then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'condicao_pagamento', 'de', v_order.condicao_pagamento, 'para', v_condicao));
  end if;
  if v_order.frete_cents is distinct from v_frete then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'frete_cents', 'de', v_order.frete_cents, 'para', v_frete));
  end if;
  if v_order.subtotal_cents is distinct from v_subtotal then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'subtotal_cents', 'de', v_order.subtotal_cents, 'para', v_subtotal));
  end if;
  if v_order.total_cents is distinct from v_total then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'total_cents', 'de', v_order.total_cents, 'para', v_total));
  end if;
  if v_sig_atual is distinct from v_sig_nova then
    select coalesce(sum(it.quantidade), 0)
      into v_qtd_atual
      from public.commercial_order_items it
     where it.order_id = v_order.id;
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'itens',
      'de', v_qtd_atual,
      'para', v_qtd_nova));
  end if;
  -- Cidade ausente no payload NÃO é "cidade apagada": comparar null com o
  -- valor do cadastro marcaria mudança em todo pedido cujo detalhe não trouxe
  -- endereço. Só entra no diff quando o ERP mandou alguma coisa.
  if (v_cidade is not null or v_uf is not null)
     and (v_cidade_atual is distinct from v_cidade or v_uf_atual is distinct from v_uf) then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'cidade',
      'de', nullif(concat_ws('/', v_cidade_atual, v_uf_atual), ''),
      'para', nullif(concat_ws('/', v_cidade, v_uf), '')));
  end if;

  -- O cadastro é a fonte do endereço na expedição. Roda ANTES do corte de
  -- "sem mudança" e fora do diff de propósito: a importação antiga gravava
  -- "Canoinhas, SC" cru em `contacts.cidade` com `uf` nulo, e o valor
  -- normalizado é o mesmo — não é mudança, é sujeira que a carga exibe.
  -- `coalesce` preserva o que o payload não mandou (UF que some do detalhe
  -- não pode virar NULL), e o `is distinct` evita `updated_at` à toa.
  if p_aplicar and v_order.contact_id is not null and (v_cidade is not null or v_uf is not null) then
    update public.contacts
       set cidade = coalesce(v_cidade, cidade),
           uf = coalesce(upper(v_uf), uf),
           updated_at = now()
     where id = v_order.contact_id
       and organization_id = p_org
       and (cidade is distinct from coalesce(v_cidade, cidade)
            or uf is distinct from coalesce(upper(v_uf), uf));
  end if;

  if jsonb_array_length(v_mudancas) = 0 then
    if p_aplicar then
      update public.commercial_orders
         set mercos_sincronizado_em = now(), mercos_ultima_mudanca = null
       where id = v_order.id;
    end if;
    return jsonb_build_object(
      'status', 'sem_mudanca', 'numero', v_numero, 'order_id', v_order.id,
      'mudancas', '[]'::jsonb
    );
  end if;

  if not p_aplicar then
    return jsonb_build_object(
      'status', 'conferir', 'numero', v_numero, 'order_id', v_order.id,
      'mudancas', v_mudancas
    );
  end if;

  -- ─── Aplicação ────────────────────────────────────────────────────────────
  update public.commercial_orders
     set cliente_nome = v_nome,
         cliente_documento = v_documento,
         condicao_pagamento = v_condicao,
         subtotal_cents = v_subtotal,
         frete_cents = v_frete,
         total_cents = v_total,
         updated_at = now(),
         mercos_sincronizado_em = now(),
         mercos_ultima_mudanca = jsonb_build_object('em', now(), 'campos', v_mudancas)
   where id = v_order.id;

  if v_sig_atual is distinct from v_sig_nova then
    delete from public.commercial_order_items where order_id = v_order.id;

    v_posicao := 0;
    for v_item in select value from jsonb_array_elements(v_itens_norm) loop
      v_posicao := v_posicao + 1;
      v_codigo := v_item->>'codigo';
      v_descricao := v_item->>'descricao';

      v_produto_id := null;
      select id into v_produto_id
        from public.catalog_products
       where organization_id = p_org and codigo::text = v_codigo
       limit 1;

      insert into public.commercial_order_items (
        organization_id, order_id, product_id, produto_codigo, produto_nome,
        quantidade, preco_unit_cents, desconto_pct, subtotal_cents, posicao
      ) values (
        p_org, v_order.id, v_produto_id, v_codigo, v_descricao,
        (v_item->>'quantidade')::integer,
        (v_item->>'preco')::bigint,
        0,
        (v_item->>'subtotal')::bigint,
        v_posicao
      );
    end loop;
  end if;

  -- ─── Carga que já embarcou: avisa, não mexe ───────────────────────────────
  select so.shipment_id, s.status
    into v_shipment_id, v_shipment_status
    from public.shipment_orders so
    join public.shipments s on s.id = so.shipment_id
   where so.order_id = v_order.id
   limit 1;

  if v_shipment_id is not null and v_shipment_status in ('montando', 'em_rota') then
    update public.shipment_orders
       set reconferir_em = now(),
           reconferir_motivo = 'Pedido ' || v_numero || ' mudou no Mercos depois de entrar na carga.',
           updated_at = now()
     where order_id = v_order.id;
  end if;

  return jsonb_build_object(
    'status', 'atualizado',
    'numero', v_numero,
    'order_id', v_order.id,
    'mudancas', v_mudancas,
    'carga', case
      when v_shipment_id is null then null
      else jsonb_build_object('shipment_id', v_shipment_id, 'status', v_shipment_status,
                              'reconferir', v_shipment_status in ('montando', 'em_rota'))
    end
  );
end;
$$;

revoke execute on function public.fn_sincronizar_pedido_mercos(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.fn_sincronizar_pedido_mercos(uuid, jsonb, boolean) to service_role;
