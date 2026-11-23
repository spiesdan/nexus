-- 0344 — SÉRIE LOCAL SEPARADA E COLISÕES MERCOS VISÍVEIS (decisão do dono).
--
-- Quatro pedidos LOCAIS (19669..19672, com nota emitida) colidiram com números
-- do Mercos em 17/11; a importação os pulou como `numero_ja_existe` e o dado
-- MORREU — só o contador `orders_skipped` sabia, misturando com re-leitura.
-- NÃO renumedamos nada: a série local passa a nascer em 900000 e a colisão
-- vira linha visível em `mercos_colisoes`, com os dois clientes nomeados.

-- Contador exclusivo de pedido LOCAL. Os 28 pedidos existentes ficam onde
-- estão (renumerar quebraria documento fiscal já emitido).
update public.commercial_order_counters
   set ultimo_numero = greatest(ultimo_numero, 900000), updated_at = now()
 where ultimo_numero < 900000;

create or replace function public.fn_proximo_numero_pedido(p_org uuid)
returns integer
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_numero integer;
begin
  if (auth.jwt() ->> 'role') <> 'service_role'
     and not exists (select 1 from public.fn_user_org_ids() where fn_user_org_ids = p_org)
     and not public.fn_is_platform_admin() then
    raise exception 'pedido_numero_org_invalida' using errcode = '42501';
  end if;

  insert into public.commercial_order_counters (organization_id, ultimo_numero, updated_at)
  values (p_org, 900000, now())
  on conflict (organization_id)
  do update set ultimo_numero = greatest(
                 public.commercial_order_counters.ultimo_numero + 1, 900000
               ),
                updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

alter function public.fn_proximo_numero_pedido(uuid) owner to postgres;
revoke execute on function public.fn_proximo_numero_pedido(uuid) from public, anon;
grant execute on function public.fn_proximo_numero_pedido(uuid) to authenticated, service_role;

-- Identidade dupla: `numero` é o número que o operador vê; `numero_mercos` é a
-- chave de importação. Nulo nos 11.979 pedidos já importados (preservados).
alter table public.commercial_orders
  add column if not exists numero_mercos integer;

-- Backfill de importados antigos: a coluna é nova, então os 11.979 pedidos já
-- vindos do Mercos não tinham `numero_mercos`. Idempotente e nunca sobrescreve
-- um valor existente (caso da colisão recuperada).
update public.commercial_orders
   set numero_mercos = numero
 where origem = 'mercos'
   and numero_mercos is null;

create unique index if not exists commercial_orders_org_numero_mercos_key
  on public.commercial_orders (organization_id, numero_mercos)
  where numero_mercos is not null;

create table if not exists public.mercos_colisoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  numero_mercos integer not null,
  cliente_mercos_nome text,
  pedido_local_id uuid references public.commercial_orders(id) on delete set null,
  cliente_local_nome text,
  valor_cents bigint not null default 0,
  visto_em timestamptz not null default now(),
  resolvido_em timestamptz,
  pedido_importado_id uuid references public.commercial_orders(id) on delete set null,
  unique (organization_id, numero_mercos)
);

alter table public.mercos_colisoes enable row level security;
drop policy if exists tenant_isolation_mercos_colisoes_all on public.mercos_colisoes;
create policy tenant_isolation_mercos_colisoes_all on public.mercos_colisoes
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

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
  v_numero_mercos integer;
  v_numero_local integer;
  v_nome_mercos text;
  v_local_cliente_nome text;
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
  v_endereco jsonb;
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
  v_numero_mercos := v_numero;
  if v_numero is null or v_numero <= 0 then
    raise exception 'numero do pedido invalido';
  end if;

  -- Idempotência: a identidade do pedido do Mercos é `numero_mercos`, NÃO
  -- `numero` (que pode ser realocado para a série local em caso de colisão).
  v_nome_mercos := nullif(trim(coalesce(
    p_pedido->>'cliente_nome', p_pedido->'cliente'->>'razao', '')), '');
  select id into v_order_id
    from public.commercial_orders
   where organization_id = p_org and numero_mercos = v_numero_mercos
   limit 1;
  if v_order_id is not null then
    return jsonb_build_object(
      'status', 'skipped', 'numero', v_numero_mercos,
      'motivo', 'ja_importado',
      'cliente_mercos_nome', coalesce(v_nome_mercos, ''),
      'order_id', v_order_id
    );
  end if;

  -- Colisão com número LOCAL (decisão do dono: série local separada em
  -- 900000). Não sobrescreve e não renumera o pedido local — ele pode ter
  -- nota emitida. O pedido do Mercos ENTRA com número da série local e fica
  -- identificado por `numero_mercos`; a colisão vira LINHA visível.
  select id, cliente_nome into v_order_id, v_local_cliente_nome
    from public.commercial_orders
   where organization_id = p_org and numero = v_numero_mercos
   limit 1;
  if v_order_id is not null then
    insert into public.mercos_colisoes (
      organization_id, numero_mercos, cliente_mercos_nome,
      pedido_local_id, cliente_local_nome, valor_cents
    ) values (
      p_org, v_numero_mercos, coalesce(v_nome_mercos, ''),
      v_order_id, v_local_cliente_nome,
      coalesce(nullif(p_pedido->>'total_cents', '')::bigint, 0)
    )
    on conflict (organization_id, numero_mercos) do nothing;

    v_numero_local := public.fn_proximo_numero_pedido(p_org);
    v_numero := v_numero_local;
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
  -- O detalhe do ERP manda "Cidade, UF" numa linha só (o worker não separa);
  -- o estado pode vir por sigla ("Canoinhas, SC") ou por nome ("Bituruna,
  -- Paraná"). `fn_separar_cidade_uf` é a mesma régua da revisão — um lugar só
  -- decide o que é cidade e o que é UF, senão a importação grava "Bituruna,
  -- Paraná" em `contacts.cidade` e a revisão acha que mudou.
  v_cidade := nullif(trim(coalesce(p_pedido->'cliente'->>'cidade', '')), '');
  v_uf := nullif(upper(trim(coalesce(p_pedido->'cliente'->>'uf', ''))), '');
  if v_uf is not null then
    v_uf := left(v_uf, 2);
  end if;
  if v_cidade is not null then
    v_endereco := public.fn_separar_cidade_uf(v_cidade);
    v_cidade := nullif(v_endereco->>'cidade', '');
    v_uf := coalesce(v_uf, nullif(upper(v_endereco->>'uf'), ''));
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
    organization_id, numero, numero_mercos, contact_id, cliente_nome, cliente_documento,
    vendedor_user_id, vendedor_nome,
    status, origem, moeda, subtotal_cents, desconto_cents, frete_cents,
    total_cents, condicao_pagamento, created_at, updated_at,
    modalidade_frete, parcelas, exige_nf, created_by, mercos_observacoes
  ) values (
    p_org, v_numero, v_numero_mercos, v_contact_id, left(v_nome, 300), v_documento,
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

  update public.mercos_colisoes
     set pedido_importado_id = v_order_id
   where organization_id = p_org and numero_mercos = v_numero_mercos;

  return jsonb_build_object(
    'status', 'inserted',
    'numero', v_numero,
    'numero_mercos', v_numero_mercos,
    'colisao', (v_numero_local is not null),
    'cliente_mercos_nome', coalesce(v_nome_mercos, ''),
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
