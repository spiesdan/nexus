-- ============================================================================
-- 0298 — PAGO E ENTREGUE NO MERCOS SAI DA CARGA
--
-- O vendedor externo às vezes entrega a mercadoria na mão e recebe o dinheiro
-- ali mesmo. No ERP isso vira uma linha em **Informações Adicionais** do pedido
-- ("Pago e ja entregue"), e no CRM o pedido ficava `faturado` — elegível para a
-- carga. O motorista saía com uma mercadoria que o cliente já tinha.
--
-- O que entra:
--
--   1. `commercial_orders.mercos_observacoes` — o texto do ERP, num campo
--      próprio e só de leitura. NÃO é `observacoes` (o campo que o operador
--      digita no CRM e que a 1.43.0 passou a levar para o infCpl da nota):
--      "Pago e já entregue" não pode virar informação complementar de NF-e.
--
--   2. `fn_mercos_pago_e_entregue(texto)` — a régua. Exige as duas ideias
--      (pago e entregue) e ignora negação/futuro ("falta pagar", "a entregar",
--      "não entregue"). Tolerante a digitação: "pg e entregue", "pago e
--      entrgue", "pago e entrege", "pago e entregou". Sem acento também.
--
--   3. Importação (`fn_importar_pedido_mercos`): grava a observação e, quando
--      ela fecha a régua, o pedido nasce `entregue` em vez de `faturado`.
--      Pedido `entregue` não aparece na fila da carga nem é aceito nela
--      (`STATUS_EMBARCAVEIS` = aprovado/faturado).
--
--   4. Revisão (`fn_sincronizar_pedido_mercos`): o ERP pode ganhar a
--      observação DEPOIS da importação. A revisão também fecha o pedido em
--      `entregue` — antes das travas, porque nota emitida não impede uma
--      entrega física. Nunca regride `entregue`/`cancelado`.
--
-- Por que a decisão mora no banco e não no worker: é a função que decide o que
-- o ERP escreve; um dublê no JavaScript aceitaria qualquer coisa. A prova está
-- em `tests/invariants/mercos-pago-e-entregue.test.ts`.
-- ============================================================================

alter table public.commercial_orders
  add column if not exists mercos_observacoes text;

comment on column public.commercial_orders.mercos_observacoes is
  'Informações Adicionais do pedido no Mercos, como vieram do ERP. Só leitura: o campo editável do CRM é observacoes.';

-- A RÉGUA ---------------------------------------------------------------------
--
-- Normaliza (minúscula e sem acento), remove negação/futuro e só então procura
-- "pago" E "entregue". As duas negações são o que impede o falso positivo mais
-- caro: transformar em `entregue` um pedido que ainda precisa sair.
create or replace function public.fn_mercos_pago_e_entregue(p_texto text)
returns boolean
language plpgsql
immutable
as $$
declare
  v text;
begin
  if p_texto is null or btrim(p_texto) = '' then
    return false;
  end if;

  v := lower(translate(
         p_texto,
         'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
         'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));

  -- Futuro e negação saem ANTES da busca positiva.
  v := regexp_replace(v, '\m(nao|nunca)\s+(foi\s+)?pag[oa-z]*\M', ' ', 'g');
  v := regexp_replace(v, '\m(falta|faltam|a|por|para)\s+(de\s+)?pag[ao]r\M', ' ', 'g');
  v := regexp_replace(v, '\m(nao|nunca)\s+(foi\s+)?entreg\w*\M', ' ', 'g');
  v := regexp_replace(v, '\m(falta|faltam|a|por|para)\s+entregar\M', ' ', 'g');
  v := regexp_replace(v, '\m(a|por|para)\s+receber\M', ' ', 'g');

  return v ~ '\m(pag[oa]|pagou|paguei|pg|pgo)\M'
     and v ~ '\mentr\w*(gue|ge|gou|gamos|guei|garam)s?\M';
end;
$$;

revoke execute on function public.fn_mercos_pago_e_entregue(text) from public, anon, authenticated;
grant execute on function public.fn_mercos_pago_e_entregue(text) to service_role;

-- A IMPORTAÇÃO -----------------------------------------------------------------

create or replace function public.fn_importar_pedido_mercos(
  p_org uuid,
  p_pedido jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_status text;
  v_nome text;
  v_documento text;
  v_doc_digitos text;
  v_telefone text;
  v_cidade text;
  v_uf text;
  v_itens jsonb;
  v_item jsonb;
  v_soma bigint := 0;
  v_total bigint;
  v_subtotal bigint;
  v_frete bigint;
  v_condicao text;
  v_criado_em timestamptz;
  v_order_id uuid;
  v_contact_id uuid;
  v_cliente_novo boolean := false;
  v_produto_id uuid;
  v_codigo text;
  v_descricao text;
  v_quantidade integer;
  v_preco bigint;
  v_item_subtotal bigint;
  v_posicao integer := 0;
  v_itens_novos integer := 0;
  v_fantasia text;
  v_vendedor_nome text;
  v_vendedor_user_id uuid;
  v_nome_normalizado text;
  v_obs text;
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

  -- Já existe? Não sobrescreve. O número é a identidade dentro da org, e um
  -- pedido do Mercos pode colidir com pedido de demonstração (foi o caso dos
  -- 21 números 18538..18558). Colisão é PULADA e contada, nunca sobrescrita.
  select id into v_order_id
    from public.commercial_orders
   where organization_id = p_org and numero = v_numero
   limit 1;
  if v_order_id is not null then
    return jsonb_build_object('status', 'skipped', 'numero', v_numero, 'motivo', 'numero_ja_existe');
  end if;

  v_status := coalesce(nullif(trim(p_pedido->>'status'), ''), '');
  if v_status not in ('rascunho', 'em_analise', 'aprovado', 'faturado', 'expedido', 'entregue', 'cancelado') then
    raise exception 'status invalido: %', v_status;
  end if;

  -- ── "Pago e já entregue" nas Informações Adicionais do Mercos ────────────
  --
  -- O vendedor externo entrega na mão e recebe o dinheiro; o que sobra no ERP
  -- é a observação. Esse pedido já foi entregue — mandá-lo para a carga faria
  -- o motorista sair com uma mercadoria que o cliente já tem.
  --
  -- A observação é gravada como veio, num campo próprio e só de leitura: o
  -- texto é do ERP, e "Informações adicionais" do CRM é outro campo (o que o
  -- operador digita aqui, e que alimenta o infCpl da nota).
  v_obs := nullif(regexp_replace(trim(coalesce(p_pedido->>'mercos_observacoes', '')), '\s+', ' ', 'g'), '');
  if public.fn_mercos_pago_e_entregue(v_obs) and v_status <> 'cancelado' then
    v_status := 'entregue';
  end if;

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
      'status', 'divergent',
      'numero', v_numero,
      'motivo', format('soma dos itens %s != total %s', v_soma, v_total)
    );
  end if;

  v_subtotal := coalesce(nullif(p_pedido->>'subtotal_cents', '')::bigint, v_soma);
  v_frete := coalesce(nullif(p_pedido->>'frete_cents', '')::bigint, 0);
  v_condicao := nullif(trim(coalesce(p_pedido->>'condicao_pagamento', '')), '');
  v_criado_em := coalesce(nullif(p_pedido->>'created_at', '')::timestamptz, now());

  v_nome := nullif(trim(coalesce(p_pedido->>'cliente_nome', '')), '');
  if v_nome is null then
    v_nome := nullif(trim(coalesce(p_pedido->'cliente'->>'razao', '')), '');
  end if;
  if v_nome is null then
    raise exception 'cliente sem nome';
  end if;

  v_documento := nullif(trim(coalesce(p_pedido->>'cliente_documento', p_pedido->'cliente'->>'documento', '')), '');
  v_doc_digitos := regexp_replace(coalesce(v_documento, ''), '\D', '', 'g');
  v_telefone := regexp_replace(coalesce(p_pedido->'cliente'->>'telefone', ''), '\D', '', 'g');
  v_cidade := nullif(trim(coalesce(p_pedido->'cliente'->>'cidade', '')), '');
  v_uf := nullif(trim(coalesce(p_pedido->'cliente'->>'uf', '')), '');
  v_fantasia := nullif(trim(coalesce(p_pedido->'cliente'->>'fantasia', '')), '');
  v_nome_normalizado := lower(regexp_replace(v_nome, '\s+', ' ', 'g'));
  v_vendedor_nome := nullif(
    trim(coalesce(p_pedido->>'vendedor', p_pedido->>'vendedor_nome', '')),
    ''
  );

  -- O emissor do Mercos pode ser usuário do CRM (ANA, EDITH) ou um login
  -- operacional que não existe aqui (VENDEDOR JB). Casa pelo nome completo,
  -- pelo primeiro nome e pelo prefixo do e-mail; se nada casar, o UUID fica
  -- nulo e `vendedor_nome` preserva a informação.
  if v_vendedor_nome is not null then
    select u.id into v_vendedor_user_id
      from auth.users u
     where lower(regexp_replace(
             coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
             '\s+', ' ', 'g'
           )) = lower(regexp_replace(v_vendedor_nome, '\s+', ' ', 'g'))
        or lower(split_part(
             coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
             ' ', 1
           )) = lower(regexp_replace(v_vendedor_nome, '\s+', ' ', 'g'))
        or lower(split_part(u.email, '@', 1)) = lower(regexp_replace(v_vendedor_nome, '\s+', ' ', 'g'))
     order by u.created_at
     limit 1;
  end if;

  -- Contato: documento é a chave forte. CNPJ tem coluna própria; CPF e
  -- documentos legados vivem em `source_metadata.mercos.documento`. Nome
  -- exato vem antes do telefone: número compartilhado não pode sequestrar o
  -- pedido de outro cliente (o caso AUTO PEÇAS SANTOS -> AUTO MECANICA FUCK).
  if v_doc_digitos ~ '^\d{14}$' then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org and cnpj = v_doc_digitos
     order by created_at
     limit 1;
  end if;
  if v_contact_id is null and v_doc_digitos <> '' then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and regexp_replace(
             coalesce(source_metadata->'mercos'->>'documento', ''),
             '\D', '', 'g'
           ) = v_doc_digitos
     order by created_at
     limit 1;
  end if;
  if v_contact_id is null then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and lower(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g')) = v_nome_normalizado
     order by created_at
     limit 1;
  end if;
  if v_contact_id is null and v_telefone <> '' then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and (
         regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') = v_telefone
         -- O mesmo telefone pode estar gravado em E.164 (+55...) de uma
         -- importação anterior; comparar só os dígitos finais evita o
         -- `uniq_contacts_org_phone` no insert.
         or right(regexp_replace(coalesce(phone_number, ''), '\D', '', 'g'), length(v_telefone)) = v_telefone
       )
     order by created_at
     limit 1;
  end if;

  if v_contact_id is null then
    insert into public.contacts (
      organization_id, name, display_name, fantasia, cnpj, phone_number,
      cidade, uf, source, source_metadata, created_by_user_id
    ) values (
      p_org, v_nome, v_nome, v_fantasia,
      case when v_doc_digitos ~ '^\d{14}$' then v_doc_digitos else null end,
      case
        when length(v_telefone) between 10 and 11 then '+55' || v_telefone
        when v_telefone <> '' then '+' || v_telefone
        else null
      end, v_cidade, v_uf, 'mercos',
      jsonb_build_object(
        'mercos', jsonb_build_object(
          'documento', v_documento,
          'cidade', v_cidade,
          'telefone', v_telefone
        )
      ),
      null
    ) returning id into v_contact_id;
    v_cliente_novo := true;
  end if;

  insert into public.commercial_orders (
    organization_id, numero, contact_id, cliente_nome, cliente_documento,
    vendedor_user_id, vendedor_nome,
    status, origem, moeda, subtotal_cents, desconto_cents, frete_cents,
    total_cents, condicao_pagamento, created_at, updated_at,
    modalidade_frete, parcelas, exige_nf, created_by, mercos_observacoes
  ) values (
    p_org, v_numero, v_contact_id, left(v_nome, 300), v_documento,
    v_vendedor_user_id, left(v_vendedor_nome, 200),
    v_status, 'mercos', 'BRL', v_subtotal, 0, v_frete,
    v_total, v_condicao, v_criado_em, now(),
    'retirada', '[]'::jsonb, false, null, v_obs
  ) returning id into v_order_id;

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
      raise exception 'item % sem código e sem descrição', v_posicao;
    end if;

    v_quantidade := greatest(1, round(coalesce(nullif(v_item->>'quantidade', '')::numeric, 1))::integer);
    v_item_subtotal := coalesce(nullif(v_item->>'subtotal_cents', '')::bigint, 0);
    v_preco := coalesce(
      nullif(v_item->>'preco_unit_cents', '')::bigint,
      case when v_quantidade > 0 then v_item_subtotal / v_quantidade else 0 end
    );

    v_produto_id := null;
    select id into v_produto_id
      from public.catalog_products
     where organization_id = p_org and codigo::text = v_codigo
     limit 1;

    insert into public.commercial_order_items (
      organization_id, order_id, product_id, produto_codigo, produto_nome,
      quantidade, preco_unit_cents, desconto_pct, subtotal_cents, posicao
    ) values (
      p_org, v_order_id, v_produto_id, v_codigo, left(v_descricao, 300),
      v_quantidade, v_preco, 0, v_item_subtotal, v_posicao
    );
    v_itens_novos := v_itens_novos + 1;
  end loop;

  insert into public.commercial_order_counters (organization_id, ultimo_numero, updated_at)
  values (p_org, v_numero, now())
  on conflict (organization_id) do update
    set ultimo_numero = greatest(public.commercial_order_counters.ultimo_numero, excluded.ultimo_numero),
        updated_at = now();

  return jsonb_build_object(
    'status', 'inserted',
    'numero', v_numero,
    'order_id', v_order_id,
    'items', v_itens_novos,
    'customer_created', v_cliente_novo,
    'vendedor_nome', v_vendedor_nome,
    'vendedor_user_id', v_vendedor_user_id
  );
end;
$$;

revoke execute on function public.fn_importar_pedido_mercos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_importar_pedido_mercos(uuid, jsonb) to service_role;


-- A REVISÃO --------------------------------------------------------------------

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
  v_obs text;
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

  -- ─── Pago e entregue no ERP: é ENTREGA, não dado comercial ───────────────
  --
  -- Vem antes das travas de propósito. A observação "Pago e ja entregue" diz
  -- que o vendedor entregou e recebeu o dinheiro; isso fechar o pedido em
  -- `entregue` é registrar a entrega que já aconteceu, não reescrever dado
  -- fiscal. Por isso vale mesmo com nota emitida — a nota pode ter saído e a
  -- entrega vir depois.
  --
  -- Nunca regride: pedido já `entregue` ou `cancelado` segue intocado.
  v_obs := nullif(regexp_replace(trim(coalesce(p_pedido->>'mercos_observacoes', '')), '\s+', ' ', 'g'), '');
  if public.fn_mercos_pago_e_entregue(v_obs) and v_order.status not in ('entregue', 'cancelado') then
    if not p_aplicar then
      return jsonb_build_object(
        'status', 'conferir', 'numero', v_numero, 'order_id', v_order.id,
        'mudancas', jsonb_build_array(jsonb_build_object(
          'campo', 'status', 'de', v_order.status, 'para', 'entregue'))
      );
    end if;

    update public.commercial_orders
       set status = 'entregue',
           mercos_observacoes = coalesce(v_obs, mercos_observacoes),
           updated_at = now(),
           mercos_sincronizado_em = now(),
           mercos_ultima_mudanca = jsonb_build_object(
             'em', now(),
             'campos', jsonb_build_array(jsonb_build_object(
               'campo', 'status', 'de', v_order.status, 'para', 'entregue'))
           )
     where id = v_order.id;

    select so.shipment_id, s.status
      into v_shipment_id, v_shipment_status
      from public.shipment_orders so
      join public.shipments s on s.id = so.shipment_id
     where so.order_id = v_order.id
     limit 1;

    if v_shipment_id is not null and v_shipment_status in ('montando', 'em_rota') then
      update public.shipment_orders
         set reconferir_em = now(),
             reconferir_motivo = 'Pedido ' || v_numero || ' está pago e entregue no Mercos — foi entregue fora da carga.',
             updated_at = now()
       where order_id = v_order.id;
    end if;

    return jsonb_build_object(
      'status', 'atualizado', 'numero', v_numero, 'order_id', v_order.id,
      'mudancas', jsonb_build_array(jsonb_build_object(
        'campo', 'status', 'de', v_order.status, 'para', 'entregue')),
      'carga', case
        when v_shipment_id is null then null
        else jsonb_build_object('shipment_id', v_shipment_id, 'status', v_shipment_status,
                                'reconferir', v_shipment_status in ('montando', 'em_rota'))
      end
    );
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
  if coalesce(v_order.mercos_observacoes, '') is distinct from coalesce(v_obs, '') then
    v_mudancas := v_mudancas || jsonb_build_array(jsonb_build_object(
      'campo', 'mercos_observacoes', 'de', v_order.mercos_observacoes, 'para', v_obs));
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
         mercos_observacoes = v_obs,
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
