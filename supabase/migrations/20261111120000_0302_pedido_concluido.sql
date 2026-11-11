-- ============================================================================
-- 0302 — O PEDIDO CONCLUÍDO NO ERP ENTRA NA EXPEDIÇÃO
--
-- O problema medido em 11/11/2026: o Mercos marca **Concluído** quando a venda
-- fecha, e a tradução (`workers/mercos/status.mjs`) levava isso para
-- `faturado`. `faturado` é o status que a Expedição lia — então funcionava por
-- acidente. Só que `faturado` também é o status de quem TEM NOTA: a tela dizia
-- "Faturado" para pedido sem NF-e nenhuma, e o faturamento real ficava sem
-- vocabulário próprio.
--
-- A correção separa os dois fatos, que são fatos diferentes:
--
--   Concluído no ERP   → `concluido`  venda fechada, mercadoria no depósito,
--                                     sem nota emitida. Embarca.
--   Faturado no ERP    → `faturado`   nota emitida no ERP (NF-e gerada).
--                                     Embarca.
--   Parcialmente Faturado → `faturado` idem: já existe nota, ainda que parcial.
--
-- A Expedição passa a ler `aprovado`, `concluido` e `faturado` (a lista vive em
-- `lib/schemas/expedicao.ts`, uma só para a tela e para a rota). `expedido` e
-- `entregue` continuam sendo o NOSSO caminho de carga — o ERP não os escreve.
--
-- ─── Por que uma função de status separada ─────────────────────────────────
--
-- `fn_sincronizar_pedido_mercos` (0297/0301) cuida de CONTEÚDO — cliente,
-- endereço, itens/totais — e de propósito não mexe no ciclo: status é decisão
-- nossa, e sobrescrever apagaria trabalho feito aqui. Mas a tradução antiga
-- gravou `faturado` em quem não tinha nota, e isso precisa ser corrigido para
-- os pedidos que já existem — não só para os novos. Por isso a função própria,
-- chamada pela revisão do worker DEPOIS da sincronização.
--
-- As travas, todas devolvidas como `bloqueado`/`ignorado` com motivo nomeado:
--
--   * só corrige status ABERTO de venda: `aprovado`, `faturado`, `concluido`.
--     `expedido`, `entregue` e `cancelado` são o nosso ciclo e não se reescrevem;
--   * nota emitida (nossa tabela fiscal) → `nota_emitida`: se existe NF-e,
--     `faturado` está certo e o ERP não manda nisso;
--   * pedido em carga → `pedido_em_carga`: quem embarcou não muda de status
--     por leitura de ERP;
--   * o ERP só promove para estado de venda (`aprovado`/`faturado`/`concluido`).
--     `rascunho`/`em_analise` não regridem pedido aprovado; `cancelado` e
--     `expedido` do ERP não são aplicados — cancelamento é decisão nossa.
--
-- Idempotente: `drop constraint if exists` + `create or replace`, e a segunda
-- passada cai no ramo `sem_mudanca`.
-- ============================================================================

-- ─── 1 · O vocabulário do ciclo ganha `concluido` ───────────────────────────
--
-- CHECK recriado, não alterado: o Postgres não tem `alter constraint ... check`.
-- O `drop` é seguro porque a constraint nasceu com este nome na 0208 e nenhuma
-- linha existente pode violar a lista nova (só cresce).
alter table public.commercial_orders
  drop constraint if exists commercial_orders_status_valido;
alter table public.commercial_orders
  add constraint commercial_orders_status_valido check (
    status in ('rascunho', 'em_analise', 'aprovado', 'faturado', 'concluido', 'expedido', 'entregue', 'cancelado')
  );

comment on column public.commercial_orders.status is
  'Ciclo comercial: rascunho → em_analise → aprovado → faturado (NF-e) / concluido (venda fechada no ERP, sem nota) → expedido → entregue. cancelado encerra.';

-- ─── 2 · A importação aceita o status novo ─────────────────────────────────
--
-- Cópia integral da 0301 com a lista de status acrescida de `concluido`. É o
-- único ponto do importador que precisava mudar: a tradução do ERP já chega
-- pronta do worker (`pedido.status`).

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
  v_cpf_hash text;
  v_cpf_hash_novo text;
  v_cpf_encrypted bytea;
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
  v_tags text[];
  v_saltos integer := 0;
  v_proximo uuid;
  v_anonimizado boolean := false;
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
  if v_status not in ('rascunho', 'em_analise', 'aprovado', 'faturado', 'concluido', 'expedido', 'entregue', 'cancelado') then
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
  -- O detalhe do ERP manda "Cidade, UF" numa linha só (o worker não separa).
  -- Gravar cru foi o que encheu `contacts.cidade` de "Canoinhas, SC" com
  -- `uf` nulo — a expedição lia a UF errada até a revisão passar.
  v_uf := nullif(upper(trim(coalesce(p_pedido->'cliente'->>'uf', ''))), '');
  if v_uf is not null then
    v_uf := left(v_uf, 2);
  end if;
  if v_cidade ~ '[,/]\s*[A-Za-z]{2}\s*$' then
    v_uf := coalesce(v_uf, upper(right(btrim(v_cidade), 2)));
    v_cidade := regexp_replace(
      btrim(left(btrim(v_cidade), length(btrim(v_cidade)) - 3)),
      '[,/\s]+$', ''
    );
  end if;
  v_fantasia := nullif(trim(coalesce(p_pedido->'cliente'->>'fantasia', '')), '');
  v_nome_normalizado := public.fn_mercos_nome(v_nome);
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

  -- CPF: o app guarda só o hash (sha256 hex dos 11 dígitos) — nunca texto.
  -- A busca usa o hash puro; a gravação só acompanha a cifra at-rest, porque o
  -- CHECK `contacts_cpf_consistency` exige as duas colunas juntas. Instalação
  -- sem chave mestra continua funcionando: o documento fica no metadata.
  if v_doc_digitos ~ '^\d{11}$' then
    v_cpf_hash := encode(extensions.digest(v_doc_digitos, 'sha256'), 'hex');
    begin
      v_cpf_encrypted := public.encrypt_cpf(v_doc_digitos);
      v_cpf_hash_novo := v_cpf_hash;
    exception when others then
      v_cpf_encrypted := null;
      v_cpf_hash_novo := null;
    end;
  end if;

  -- ── O CADASTRO É O DO MERCOS (1:1) ───────────────────────────────────────
  --
  -- Um cliente do ERP, uma ficha aqui. A ordem das chaves é a da identidade,
  -- não a da conveniência:
  --
  --   1. CNPJ (coluna própria) e CPF (`cpf_hash`);
  --   2. o documento que a importação antiga guardou no metadata;
  --   3. nome normalizado (sem acento, pontuação e sufixo societário);
  --   4. telefone.
  --
  -- Nome antes do telefone: número compartilhado não pode sequestrar o pedido
  -- de outro cliente (o caso AUTO PEÇAS SANTOS -> AUTO MECANICA FUCK).
  -- Contato mesclado ou anonimizado não é reaproveitado — a ficha mesclada já
  -- aponta para a vencedora, e a anonimizada não pode receber pedido novo.
  -- CNPJ: o índice único de documento NÃO filtra mesclados (é o único que não
  -- filtra), então a busca tem de olhar a ficha mesclada também — o pedido é
  -- do VENCEDOR dela. As duas fusões anteriores desta base guardam o CNPJ no
  -- perdedor; sem esta volta a importação esbarraria no índice em vez de
  -- reencontrar o cliente.
  if v_doc_digitos ~ '^\d{14}$' then
    select c.id into v_contact_id
      from public.contacts c
     where c.organization_id = p_org
       and c.cnpj = v_doc_digitos
     order by c.created_at
     limit 1;

    -- Segue o ponteiro até a ficha viva. O dado veio de fora e uma cadeia
    -- circular, se um dia existir, não pode pendurar a importação.
    v_saltos := 0;
    while v_contact_id is not null and v_saltos < 8 loop
      select c.is_merged_into, c.is_anonymized
        into v_proximo, v_anonimizado
        from public.contacts c
       where c.id = v_contact_id;
      exit when v_proximo is null;
      v_contact_id := v_proximo;
      v_saltos := v_saltos + 1;
    end loop;

    if v_contact_id is not null and v_anonimizado then
      -- Ficha anonimizada é pseudônimo: não recebe pedido novo. O documento
      -- volta com o pedido, então sai da ficha anonimizada e a importação cria
      -- uma ficha limpa — o CRM não reidrata dado de titular anonimizado.
      update public.contacts
         set cnpj = null, updated_at = now()
       where organization_id = p_org
         and cnpj = v_doc_digitos;
      v_contact_id := null;
    end if;
  end if;
  if v_contact_id is null and v_cpf_hash is not null then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and cpf_hash = v_cpf_hash
       and is_merged_into is null
       and is_anonymized = false
     order by created_at
     limit 1;
  end if;
  if v_contact_id is null and v_doc_digitos <> '' then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and is_merged_into is null
       and is_anonymized = false
       and regexp_replace(
             coalesce(source_metadata->'mercos'->>'documento', ''),
             '\D', '', 'g'
           ) = v_doc_digitos
     order by created_at
     limit 1;
  end if;
  if v_contact_id is null and v_nome_normalizado is not null then
    -- 0301: o fallback por nome não pode cruzar clientes diferentes — mesmo
    -- nome normalizado com CNPJ/CPF divergente é grupo conflitante, e a regra
    -- do dono mantém os dois como cadastros distintos. Só casa quando o
    -- documento bate (ou quando o pedido não trouxe documento algum).
    select id into v_contact_id
      from public.contacts c
     where c.organization_id = p_org
       and c.is_merged_into is null
       and c.is_anonymized = false
       and public.fn_mercos_nome(coalesce(c.name, c.display_name, '')) = v_nome_normalizado
       and (
         v_doc_digitos = ''
         or (v_doc_digitos ~ '^\d{14}$' and c.cnpj = v_doc_digitos)
         or (v_cpf_hash is not null and c.cpf_hash = v_cpf_hash)
         or (v_doc_digitos <> '' and regexp_replace(
               coalesce(c.source_metadata->'mercos'->>'documento', ''),
               '\D', '', 'g'
             ) = v_doc_digitos)
       )
     order by (c.cnpj is not null or c.cpf_hash is not null) desc,
              (coalesce(c.source_metadata->'mercos'->>'documento', '') <> '') desc,
              c.created_at
     limit 1;
  end if;
  if v_contact_id is null and v_telefone <> '' then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and is_merged_into is null
       and is_anonymized = false
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

  v_tags := array['mercos'];

  if v_contact_id is null then
    insert into public.contacts (
      organization_id, name, display_name, fantasia, cnpj, cpf_hash, cpf_encrypted,
      phone_number, cidade, uf, source, source_metadata, tags, created_by_user_id
    ) values (
      p_org, v_nome, v_nome, v_fantasia,
      case when v_doc_digitos ~ '^\d{14}$' then v_doc_digitos else null end,
      v_cpf_hash_novo, v_cpf_encrypted,
      case
        when length(v_telefone) between 10 and 11 then '+55' || v_telefone
        when v_telefone <> '' then '+' || v_telefone
        else null
      end, v_cidade, v_uf, 'mercos',
      jsonb_build_object(
        'mercos', jsonb_build_object(
          'documento', v_documento,
          'cidade', v_cidade,
          'uf', v_uf,
          'telefone', v_telefone,
          'fantasia', v_fantasia
        )
      ),
      v_tags,
      null
    ) returning id into v_contact_id;
    v_cliente_novo := true;
  else
    -- A ficha existe: completa o que o Mercos sabe e o nosso não. Nunca
    -- sobrescreve dado preenchido — o cadastro é o mesmo, mas quem opera a
    -- tela também escreve nele. Telefone só entra quando está livre (índice
    -- único por organização).
    update public.contacts c
       set cnpj = coalesce(c.cnpj, case when v_doc_digitos ~ '^\d{14}$' then v_doc_digitos end),
           cpf_hash = coalesce(c.cpf_hash, v_cpf_hash_novo),
           cpf_encrypted = coalesce(c.cpf_encrypted, v_cpf_encrypted),
           fantasia = coalesce(c.fantasia, v_fantasia),
           cidade = coalesce(c.cidade, v_cidade),
           uf = coalesce(c.uf, v_uf),
           phone_number = coalesce(
             c.phone_number,
             case
               when length(v_telefone) between 10 and 11
                 and not exists (
                   select 1 from public.contacts x
                    where x.organization_id = c.organization_id
                      and x.phone_number = '+55' || v_telefone
                      and x.is_merged_into is null
                      and x.id <> c.id
                 )
               then '+55' || v_telefone
             end
           ),
           tags = (
             select array(
               select distinct t
                 from unnest(c.tags || array['mercos']) t
                where t <> 'mercos:pedido-sem-cadastro'
             )
           ),
           source_metadata = coalesce(c.source_metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'mercos',
                  coalesce(c.source_metadata->'mercos', '{}'::jsonb)
                  || jsonb_strip_nulls(jsonb_build_object(
                       'documento', v_documento,
                       'cidade', v_cidade,
                       'uf', v_uf,
                       'telefone', v_telefone,
                       'fantasia', v_fantasia
                     ))
                ),
           updated_at = now()
     where c.id = v_contact_id
       and c.organization_id = p_org;
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

-- ─── 3 · Corrigir o status de pedido que já existe ─────────────────────────
--
-- Chamada pela revisão do worker (`workers/mercos/main.mjs`) logo depois de
-- `fn_sincronizar_pedido_mercos`. Não cria pedido e não toca em conteúdo: só
-- alinha `commercial_orders.status` com o que o ERP afirma HOJE, dentro das
-- travas descritas no cabeçalho.
create or replace function public.fn_aplicar_status_mercos(
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
  v_status_erp text;
  v_order public.commercial_orders;
  v_tem_nota boolean := false;
  v_em_carga boolean := false;
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

  v_status_erp := nullif(trim(coalesce(p_pedido->>'status', '')), '');
  if v_status_erp is null
     or v_status_erp not in ('rascunho', 'em_analise', 'aprovado', 'faturado',
                             'concluido', 'expedido', 'entregue', 'cancelado') then
    return jsonb_build_object(
      'status', 'ignorado', 'numero', v_numero, 'motivo', 'status_do_erp_desconhecido'
    );
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

  -- Só estado ABERTO de venda. `expedido`/`entregue`/`cancelado` são o nosso
  -- caminho de carga e o encerramento — o ERP não volta atrás neles.
  if v_order.status not in ('aprovado', 'faturado', 'concluido') then
    return jsonb_build_object(
      'status', 'ignorado', 'numero', v_numero, 'order_id', v_order.id,
      'motivo', 'status_do_crm_fora_do_alcance'
    );
  end if;

  -- O ERP só promove para estado de venda. Rascunho/em análise não regridem
  -- pedido aprovado; cancelado e expedido do ERP não são aplicados aqui —
  -- cancelar é decisão nossa e embarcar é da nossa carga.
  if v_status_erp not in ('aprovado', 'faturado', 'concluido') then
    return jsonb_build_object(
      'status', 'ignorado', 'numero', v_numero, 'order_id', v_order.id,
      'motivo', 'erp_sem_estado_de_venda'
    );
  end if;

  if v_order.status = v_status_erp then
    return jsonb_build_object(
      'status', 'sem_mudanca', 'numero', v_numero, 'order_id', v_order.id
    );
  end if;

  -- Nota emitida: `faturado` deixou de ser leitura do ERP e virou fato fiscal.
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

  -- Pedido em carga: quem embarcou não muda de status por leitura de ERP. Na
  -- prática o status já seria `expedido` (barrado acima); a checagem existe
  -- para o caso de a carga existir e o status ter ficado para trás.
  select exists (
    select 1 from public.shipment_orders so where so.order_id = v_order.id
  ) into v_em_carga;

  if v_em_carga then
    return jsonb_build_object(
      'status', 'bloqueado', 'numero', v_numero, 'order_id', v_order.id,
      'motivo', 'pedido_em_carga'
    );
  end if;

  update public.commercial_orders
     set status = v_status_erp,
         updated_at = now(),
         mercos_sincronizado_em = now(),
         -- Soma à mudança que a sincronização acabou de gravar na mesma
         -- execução: a ficha mostra conteúdo E status, não um no lugar do outro.
         mercos_ultima_mudanca = jsonb_build_object(
           'em', now(),
           'campos', coalesce(mercos_ultima_mudanca->'campos', '[]'::jsonb)
                     || jsonb_build_array(jsonb_build_object(
                          'campo', 'status', 'de', v_order.status, 'para', v_status_erp))
         )
   where id = v_order.id;

  return jsonb_build_object(
    'status', 'atualizado',
    'numero', v_numero,
    'order_id', v_order.id,
    'mudancas', jsonb_build_array(jsonb_build_object(
      'campo', 'status', 'de', v_order.status, 'para', v_status_erp))
  );
end;
$$;

revoke execute on function public.fn_aplicar_status_mercos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_aplicar_status_mercos(uuid, jsonb) to service_role;
