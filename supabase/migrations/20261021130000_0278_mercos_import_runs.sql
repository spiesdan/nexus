-- 0278 — A IMPORTAÇÃO DO MERCOS VIRA UM TRABALHO VISÍVEL.
--
-- O importador antigo era um script local, fora do produto: rodava uma vez,
-- gravava JSONL e ninguém via se falhou. Agora ele é uma rotina do CRM, com
-- botão na tela de Pedidos e um tick diário às 17h. Esta tabela é o estado
-- dessa rotina: quem pediu, quando começou, o que entrou e o que falhou.
--
-- Por que uma linha por EXECUÇÃO, e não um booleano:
--   * o botão precisa responder "já está rodando?" sem lock em memória (o app
--     pode ter mais de uma instância);
--   * o resumo precisa sobreviver ao restart do worker;
--   * o histórico responde "o que a rotina das 17h fez ontem?" — a pergunta
--     que um cron silencioso nunca responde.
--
-- O índice parcial `where status in ('queued','running')` é a trava de
-- concorrência: duas campanhas/duas abas/um cron + um clique não podem abrir
-- duas importações da mesma organização. A segunda recebe o conflito e lê a
-- que já está em curso.
create table if not exists public.mercos_import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'queued',
  origem text not null default 'manual',
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  orders_new integer not null default 0,
  orders_skipped integer not null default 0,
  items_new integer not null default 0,
  customers_new integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercos_import_runs_status_valido check (
    status in ('queued', 'running', 'success', 'partial', 'error')
  ),
  constraint mercos_import_runs_origem_valida check (origem in ('manual', 'cron')),
  constraint mercos_import_runs_contadores_nao_negativos check (
    orders_new >= 0 and orders_skipped >= 0 and items_new >= 0 and customers_new >= 0
  )
);

create unique index if not exists mercos_import_runs_uma_ativa
  on public.mercos_import_runs (organization_id)
  where status in ('queued', 'running');

create index if not exists mercos_import_runs_org_created_idx
  on public.mercos_import_runs (organization_id, created_at desc);

alter table public.mercos_import_runs enable row level security;

drop policy if exists mercos_import_runs_select on public.mercos_import_runs;
create policy mercos_import_runs_select on public.mercos_import_runs
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

revoke all on public.mercos_import_runs from anon;
grant select on public.mercos_import_runs to authenticated;
grant all on public.mercos_import_runs to service_role;

drop trigger if exists trg_mercos_import_runs_updated_at on public.mercos_import_runs;
create trigger trg_mercos_import_runs_updated_at
  before update on public.mercos_import_runs
  for each row execute function public.fn_set_updated_at();

-- ─── Reivindicar uma execução (o worker é o único consumidor) ───────────────
-- `for update skip locked` é o que impede dois workers de pegarem a mesma
-- linha. O UPDATE de recuperação antes é a rede de segurança para o worker
-- que morreu no meio: sem ele, uma execução `running` órfã bloqueia o índice
-- único parcial para sempre, e o botão passa a responder "já está rodando"
-- para uma rotina que não existe mais.
create or replace function public.fn_claim_mercos_import_run()
returns setof public.mercos_import_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mercos_import_runs
     set status = 'error',
         finished_at = now(),
         updated_at = now(),
         errors = errors || jsonb_build_array(
           jsonb_build_object(
             'motivo', 'worker_interrompido',
             'detalhe', 'execução running sem sinal do worker por mais de 45 minutos'
           )
         )
   where status = 'running'
     and started_at < now() - interval '45 minutes';

  return query
    update public.mercos_import_runs r
       set status = 'running',
           started_at = now(),
           updated_at = now()
     where r.id = (
       select id
         from public.mercos_import_runs
        where status = 'queued'
        order by created_at
        limit 1
        for update skip locked
     )
    returning r.*;
end;
$$;

revoke execute on function public.fn_claim_mercos_import_run() from public, anon, authenticated;
grant execute on function public.fn_claim_mercos_import_run() to service_role;

-- ─── Importar UM pedido (idempotente por número) ───────────────────────────
-- Uma função por pedido, e não uma transação com os 572: um pedido com HTML
-- quebrado não pode derrubar os outros 571. O worker chama em sequência e
-- conta inserted/skipped/divergent.
--
-- A soma dos itens é conferida AQUI de novo. O coletor já conferiu, mas entre
-- coletar e gravar passa processo, e a função é a última porta antes de um
-- número errado virar faturamento.
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

  -- Contato: CNPJ é a chave forte (unique por org). Sem CNPJ, telefone; sem
  -- telefone, nome exato. Se nada casar, nasce o cliente — o pedido precisa
  -- de um contact_id para a ficha 360° não ficar órfã.
  if v_doc_digitos ~ '^\d{14}$' then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org and cnpj = v_doc_digitos
     limit 1;
  end if;
  if v_contact_id is null and v_telefone <> '' then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') = v_telefone
     order by created_at
     limit 1;
  end if;
  if v_contact_id is null then
    select id into v_contact_id
      from public.contacts
     where organization_id = p_org
       and lower(coalesce(name, '')) = lower(v_nome)
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
      nullif(v_telefone, ''), v_cidade, v_uf, 'mercos',
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
    status, origem, moeda, subtotal_cents, desconto_cents, frete_cents,
    total_cents, condicao_pagamento, created_at, updated_at,
    modalidade_frete, parcelas, exige_nf, created_by
  ) values (
    p_org, v_numero, v_contact_id, left(v_nome, 300), v_documento,
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
    'customer_created', v_cliente_novo
  );
end;
$$;

revoke execute on function public.fn_importar_pedido_mercos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_importar_pedido_mercos(uuid, jsonb) to service_role;
