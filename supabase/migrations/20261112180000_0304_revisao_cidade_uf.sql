-- ============================================================================
-- 0304 — A UF QUE O MERCOS NÃO MANDA NÃO É MUDANÇA
--
-- O aviso "Mudou no Mercos" na parada existe para uma coisa: o pedido mudou
-- DEPOIS de embarcar e o pátio precisa conferir. Em 12/11/2026 ele aparecia
-- em 17 das 19 paradas da carga 40, e em 107 pedidos da organização — sempre
-- com a MESMA mudança registrada:
--
--   {"campo":"cidade","de":"GENERAL CARNEIRO, Paraná/PR","para":"GENERAL CARNEIRO, Paraná"}
--
-- A cidade é a mesma dos dois lados. O que "mudou" foi a UF: o cadastro tem
-- `uf = PR` e o payload do ERP nunca traz `uf` — o worker extrai a linha
-- "<cidade>, <estado>" da tela e manda tudo dentro de `cidade`, com o estado
-- por EXTENSO ("Bituruna, Paraná"), não por sigla.
--
-- Duas consequências medidas:
--
--   1. a revisão comparava `uf` do cadastro com NULL e marcava mudança em
--      todo pedido, a cada revisão — o aviso virava ruído e o pátio parava de
--      confiar nele;
--   2. como só reconhecia sigla de duas letras, a cidade não era separada: a
--      revisão GRAVAVA "BITURUNA, Paraná" dentro de `contacts.cidade` do
--      cadastro. Além de feio na expedição, o município é a chave do código
--      IBGE na emissão da NF-e (`lib/fiscal/municipio-ibge.ts`) — cidade com
--      o estado colado é nome que não casa.
--
-- O que muda:
--
--   · `fn_separar_cidade_uf(texto)` — uma régua só, usada pela importação E
--     pela revisão: separa "Cidade, SC", "Cidade, Paraná" e "Cidade/SC" em
--     cidade + UF; devolve `uf = null` quando o fim não é estado conhecido.
--   · `fn_uf_do_estado(texto)` — a lista dos 27, aceitando sigla ou nome, com
--     ou sem acento.
--   · o diff só compara UF quando o ERP MANDOU UF (e o cadastro já tinha uma).
--     Preencher UF vazia não é mudança para o pátio: o cadastro é atualizado
--     abaixo do diff e a carga não precisa reconferir.
--   · o cadastro é comparado já normalizado, então "Bituruna, Paraná" + uf PR
--     é igual a "Bituruna" + uf PR — a primeira revisão depois desta migration
--     limpa o que a anterior sujou, sem marcar mudança.
--
-- O que NÃO muda: a regra do aviso continua a mesma (cliente, endereço,
-- itens/totais). Item, quantidade e preço continuam avisando — é o que o pátio
-- precisa ver.
-- ============================================================================

-- ─── 1 · A UF a partir do nome do estado ────────────────────────────────────
create or replace function public.fn_uf_do_estado(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select case upper(translate(
           btrim(coalesce(p_texto, '')),
           'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
           'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
         ))
    when 'AC' then 'AC' when 'ACRE' then 'AC'
    when 'AL' then 'AL' when 'ALAGOAS' then 'AL'
    when 'AP' then 'AP' when 'AMAPA' then 'AP'
    when 'AM' then 'AM' when 'AMAZONAS' then 'AM'
    when 'BA' then 'BA' when 'BAHIA' then 'BA'
    when 'CE' then 'CE' when 'CEARA' then 'CE'
    when 'DF' then 'DF' when 'DISTRITO FEDERAL' then 'DF'
    when 'ES' then 'ES' when 'ESPIRITO SANTO' then 'ES'
    when 'GO' then 'GO' when 'GOIAS' then 'GO'
    when 'MA' then 'MA' when 'MARANHAO' then 'MA'
    when 'MT' then 'MT' when 'MATO GROSSO' then 'MT'
    when 'MS' then 'MS' when 'MATO GROSSO DO SUL' then 'MS'
    when 'MG' then 'MG' when 'MINAS GERAIS' then 'MG'
    when 'PA' then 'PA' when 'PARA' then 'PA'
    when 'PB' then 'PB' when 'PARAIBA' then 'PB'
    when 'PR' then 'PR' when 'PARANA' then 'PR'
    when 'PE' then 'PE' when 'PERNAMBUCO' then 'PE'
    when 'PI' then 'PI' when 'PIAUI' then 'PI'
    when 'RJ' then 'RJ' when 'RIO DE JANEIRO' then 'RJ'
    when 'RN' then 'RN' when 'RIO GRANDE DO NORTE' then 'RN'
    when 'RS' then 'RS' when 'RIO GRANDE DO SUL' then 'RS'
    when 'RO' then 'RO' when 'RONDONIA' then 'RO'
    when 'RR' then 'RR' when 'RORAIMA' then 'RR'
    when 'SC' then 'SC' when 'SANTA CATARINA' then 'SC'
    when 'SP' then 'SP' when 'SAO PAULO' then 'SP'
    when 'SE' then 'SE' when 'SERGIPE' then 'SE'
    when 'TO' then 'TO' when 'TOCANTINS' then 'TO'
    else null
  end;
$$;

revoke execute on function public.fn_uf_do_estado(text) from public, anon, authenticated;
grant execute on function public.fn_uf_do_estado(text) to service_role;

comment on function public.fn_uf_do_estado(text) is
  'Sigla da UF a partir do nome do estado ou da própria sigla ("Paraná"/"PR" → PR). null = não é estado conhecido.';

-- ─── 2 · Uma régua só para "Cidade, Estado" ─────────────────────────────────
create or replace function public.fn_separar_cidade_uf(p_texto text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := btrim(coalesce(p_texto, ''));
  v_cidade text;
  v_uf text;
begin
  if v = '' then
    return jsonb_build_object('cidade', null, 'uf', null);
  end if;

  if v ~ '[,/]\s*[A-Za-z]{2}\s*$' then
    -- "Canoinhas, SC" / "Canoinhas/SC": sigla de duas letras no fim.
    v_uf := upper(right(v, 2));
    v_cidade := regexp_replace(btrim(left(v, length(v) - 3)), '[,/\s]+$', '');
  else
    v_cidade := v;
    -- "Bituruna, Paraná": estado por extenso depois da última vírgula. Só
    -- tenta com separador: cidade chamada "Paraná" (existe, no RN) não é UF.
    if v ~ '[,/]' then
      v_uf := public.fn_uf_do_estado(regexp_replace(v, '^.*[,/]\s*', ''));
      if v_uf is not null then
        v_cidade := regexp_replace(v, '[,/]\s*[^,/]+$', '');
      end if;
    end if;
  end if;

  return jsonb_build_object('cidade', nullif(btrim(v_cidade), ''), 'uf', v_uf);
end;
$$;

revoke execute on function public.fn_separar_cidade_uf(text) from public, anon, authenticated;
grant execute on function public.fn_separar_cidade_uf(text) to service_role;

comment on function public.fn_separar_cidade_uf(text) is
  'Separa "Cidade, UF" / "Cidade, Estado" / "Cidade/UF" em cidade + UF. Devolve {"cidade": texto|null, "uf": sigla|null}.';

-- ─── 3 · A revisão e a importação usam a régua ──────────────────────────────

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
  v_doc_digitos text;
  v_fantasia text;
  v_condicao text;
  v_cidade text;
  v_uf text;
  v_cidade_atual text;
  v_uf_atual text;
  v_cidade_contato text;
  v_uf_contato text;
  v_endereco jsonb;
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
  v_doc_digitos := regexp_replace(coalesce(v_documento, ''), '\D', '', 'g');
  v_fantasia := nullif(trim(coalesce(p_pedido->'cliente'->>'fantasia', '')), '');
  v_condicao := nullif(trim(coalesce(p_pedido->>'condicao_pagamento', '')), '');
  v_subtotal := coalesce(nullif(p_pedido->>'subtotal_cents', '')::bigint, v_soma);
  v_frete := coalesce(nullif(p_pedido->>'frete_cents', '')::bigint, 0);
  v_vendedor := nullif(trim(coalesce(p_pedido->>'vendedor', '')), '');

  -- O ERP manda a cidade numa linha só e NÃO manda `uf`: o worker extrai
  -- "<cidade>, <estado>" da tela e o estado vem por nome ("Bituruna, Paraná")
  -- ou por sigla ("Canoinhas, SC"). `fn_separar_cidade_uf` é a mesma régua que
  -- a importação usa — um lugar só decide o que é cidade e o que é UF.
  --
  -- Antes da 0304 esta função só reconhecia a sigla de 2 letras: com o nome
  -- do estado, a cidade ficava "Bituruna, Paraná" e `contacts.cidade` era
  -- reescrito com o estado dentro. E como o payload nunca traz `uf`, o diff
  -- comparava a UF do cadastro com NULL e marcava mudança em TODO pedido —
  -- medido em 12/11/2026: 107 pedidos com "cidade" como única mudança, nenhum
  -- item, quantidade ou preço alterado, e a carga 40 com 17 de 19 paradas
  -- avisando "Mudou no Mercos" à toa.
  v_cidade := nullif(trim(coalesce(p_pedido->'cliente'->>'cidade', '')), '');
  v_uf := nullif(trim(coalesce(p_pedido->'cliente'->>'uf', '')), '');
  if v_cidade is not null then
    v_endereco := public.fn_separar_cidade_uf(v_cidade);
    v_cidade := nullif(v_endereco->>'cidade', '');
    v_uf := coalesce(v_uf, nullif(upper(v_endereco->>'uf'), ''));
  end if;
  v_cidade_contato := null;
  v_uf_contato := null;
  if v_order.contact_id is not null then
    select c.cidade, c.uf into v_cidade_contato, v_uf_contato
      from public.contacts c where c.id = v_order.contact_id;
    -- O cadastro é normalizado pela MESMA função: "Bituruna, Paraná" com
    -- uf = PR é o mesmo endereço que "Bituruna" com uf = PR, não mudança.
    v_endereco := public.fn_separar_cidade_uf(coalesce(v_cidade_contato, ''));
    v_cidade_atual := nullif(v_endereco->>'cidade', '');
    v_uf_atual := coalesce(
      nullif(trim(coalesce(v_uf_contato, '')), ''),
      nullif(upper(v_endereco->>'uf'), '')
    );
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
  --
  -- A UF só entra quando o payload MANDOU UF e o cadastro já tinha uma. Sem
  -- isso, o `uf` do cadastro (que o ERP não manda) era comparado com NULL e
  -- todo pedido virava "mudou". Preencher UF vazia também não é mudança para
  -- o pátio: o update abaixo grava a UF e a carga não precisa reconferir.
  if (v_cidade is not null and v_cidade_atual is distinct from v_cidade)
     or (v_uf is not null and v_uf_atual is not null and v_uf_atual is distinct from v_uf) then
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
  --
  -- 0301: a revisão também COMPLETA o cadastro 1:1 — se o documento apareceu
  -- no ERP depois da primeira importação, é ele que fecha o vínculo; a
  -- fantasia entra quando falta; e `mercos:pedido-sem-cadastro` sai da ficha.
  -- Só preenche vazio: dado que o operador escreveu não é sobrescrito.
  if p_aplicar and v_order.contact_id is not null then
    update public.contacts
       set cidade = coalesce(v_cidade, cidade),
           uf = coalesce(upper(v_uf), uf),
           cnpj = coalesce(cnpj, case when v_doc_digitos ~ '^\d{14}$' then v_doc_digitos end),
           fantasia = coalesce(fantasia, v_fantasia),
           tags = (
             select array(
               select distinct t
                 from unnest(tags || array['mercos']) t
                where t <> 'mercos:pedido-sem-cadastro'
             )
           ),
           updated_at = now()
     where id = v_order.contact_id
       and organization_id = p_org
       and (
         cidade is distinct from coalesce(v_cidade, cidade)
         or uf is distinct from coalesce(upper(v_uf), uf)
         or (cnpj is null and v_doc_digitos ~ '^\d{14}$')
         or (fantasia is null and v_fantasia is not null)
         or not (tags @> array['mercos']::text[])
         or tags @> array['mercos:pedido-sem-cadastro']::text[]
       );
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
