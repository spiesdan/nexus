-- ============================================================================
-- 0301 — O PEDIDO DO MERCOS LEVA O ENDERECO (e o stub do cadastro o guarda)
--
-- ─── O defeito, medido no banco (pedido 19432 da IZABELA HOFFMANN IATCZAK LTDA)
--
-- O importador (`fn_importar_pedido_mercos`, chamado pelo worker `mercos` a
-- cada linha do JSONL que o coletor escreve) gravava o `commercial_orders` SEM
-- `endereco_entrega`. O campo não estava no INSERT — a função lia a cidade e o
-- UF do `cliente` do pedido, mas nunca compunha o endereço completo (logradouro,
-- número, bairro, CEP, cidade, UF) e o descartava.
--
-- Resultado medido: pedido 19432 chegou com `endereco_entrega = NULL`, mesmo com
-- endereço no cadastro real da mesma cliente (cadastro da raspagem de clientes,
-- com endereço completo), e o pedido foi atendido pelo contato-STUB — criado no
-- caminho "pedido sem cadastro" — que só grava cidade/UF. Duplicação do cliente:
-- cadastro real + stub, com o pedido apontando para o stub.
--
-- ─── O que esta migration muda
--
--   1. `v_endereco` passa a ser composto do payload do pedido (endereço,
--      número, bairro, CEP, cidade, UF — com fallback para chaves alternativas).
--   2. O INSERT do `commercial_orders` passa a gravar `endereco_entrega`.
--   3. O INSERT do contato no caminho de stub passa a gravar o endereço completo
--      (logradouro, número, complemento, bairro, CEP, cidade, UF) — para que o
--      próximo stub nasça com endereço, e não apenas com cidade/UF.
--
-- Aditiva e idempotente em relação a dado: nenhum dado é reescrito aqui — a
-- correção é que o próximo pedido importado passa a carregar o endereço.
-- ============================================================================

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
  v_endereco text;
  v_logradouro text;
  v_numero_end text;
  v_complemento text;
  v_bairro text;
  v_cep text;
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

  -- Endereço do cliente no pedido: logradouro, número, bairro, CEP, cidade e
  -- UF. O `cliente` do pedido é onde o coletor grava o endereço completo; as
  -- chaves alternativas cobrem o formato do ERP. Vazio quando o pedido não tem
  -- endereço (ex.: retirada em loja) — nesse caso o campo fica NULL.
  v_logradouro := nullif(trim(coalesce(p_pedido->'cliente'->>'endereco', p_pedido->>'endereco', '')), '');
  v_numero_end := nullif(trim(coalesce(p_pedido->'cliente'->>'numero', p_pedido->>'numero', '')), '');
  v_complemento := nullif(trim(coalesce(p_pedido->'cliente'->>'complemento', p_pedido->>'complemento', '')), '');
  v_bairro := nullif(trim(coalesce(p_pedido->'cliente'->>'bairro', p_pedido->>'bairro', '')), '');
  v_cep := nullif(trim(coalesce(p_pedido->'cliente'->>'cep', p_pedido->>'cep', '')), '');
  v_endereco := nullif(
    btrim(
      concat_ws(
        ', ',
        v_logradouro,
        v_numero_end,
        v_complemento,
        v_bairro,
        v_cep,
        v_cidade,
        v_uf
      )
    ),
    ''
  );

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
    -- Stub do pedido sem cadastro: nasce com o endereço completo vindo do próprio
    -- pedido (o mesmo que vira `endereco_entrega`). Sem isto o stub só gravava
    -- cidade/UF e o próximo pedido da mesma empresa nasceria sem endereço.
    insert into public.contacts (
      organization_id, name, display_name, fantasia, cnpj, phone_number,
      cidade, uf, source, source_metadata, created_by_user_id,
      logradouro, numero_end, complemento, bairro, cep
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
      null,
      v_logradouro, v_numero_end, v_complemento, v_bairro, v_cep
    ) returning id into v_contact_id;
    v_cliente_novo := true;
  end if;

  insert into public.commercial_orders (
    organization_id, numero, contact_id, cliente_nome, cliente_documento,
    vendedor_user_id, vendedor_nome,
    status, origem, moeda, subtotal_cents, desconto_cents, frete_cents,
    total_cents, condicao_pagamento, created_at, updated_at,
    modalidade_frete, parcelas, exige_nf, created_by, mercos_observacoes,
    endereco_entrega
  ) values (
    p_org, v_numero, v_contact_id, left(v_nome, 300), v_documento,
    v_vendedor_user_id, left(v_vendedor_nome, 200),
    v_status, 'mercos', 'BRL', v_subtotal, 0, v_frete,
    v_total, v_condicao, v_criado_em, now(),
    'retirada', '[]'::jsonb, false, null, v_obs,
    v_endereco
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
