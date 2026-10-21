-- 0281 — vendedor do pedido Mercos + vínculo com o cliente já cadastrado
--
-- Duas faltas medidas em 21/10/2026, depois de 11.491 pedidos importados:
--
--   1. `commercial_orders.vendedor_user_id` existia, mas a RPC nunca o
--      preenchia. O detalhe do Mercos traz "Vendedor" e a lista traz
--      "emitido por <nome>"; nenhum dos dois era lido. O pedido entrava sem
--      dono, e o filtro "meus pedidos" não achava nada.
--   2. O contato era procurado por CNPJ (14 dígitos), depois TELEFONE, e só
--      então nome. Telefone ganhava de nome e vinculava o pedido ao cliente
--      errado quando o número era compartilhado. CPF (11 dígitos) não tinha
--      lookup nenhum, então cada pedido de pessoa física criava um contato
--      novo — 1.960 nomes duplicados.
--
-- A ordem agora é: documento (CNPJ/CPF) -> nome exato normalizado -> telefone.
-- O nome bruto do vendedor também fica em `vendedor_nome`, porque nem todo
-- emissor do Mercos é usuário do CRM ("VENDEDOR JB" é o caso real): o UUID
-- pode ser nulo, mas o nome de quem tirou o pedido não pode desaparecer.
alter table public.commercial_orders
  add column if not exists vendedor_nome text;

comment on column public.commercial_orders.vendedor_nome is
  'Nome do vendedor como veio do canal de origem (Mercos). Preserva o emissor mesmo quando ele não é usuário do CRM.';

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
    modalidade_frete, parcelas, exige_nf, created_by
  ) values (
    p_org, v_numero, v_contact_id, left(v_nome, 300), v_documento,
    v_vendedor_user_id, left(v_vendedor_nome, 200),
    v_status, 'mercos', 'BRL', v_subtotal, 0, v_frete,
    v_total, v_condicao, v_criado_em, now(),
    'retirada', '[]'::jsonb, false, null
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
