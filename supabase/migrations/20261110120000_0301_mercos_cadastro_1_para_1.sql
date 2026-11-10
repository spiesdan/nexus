-- 0301 — CADASTRO DO MERCOS É O CADASTRO DO CRM: UM PRA UM.
--
-- O importador arquivado (`docs/legacy/mercos-scrape/importar-mercos.ts`) criou
-- o mesmo cliente mais de uma vez: inseria o lote inteiro sem registrar no mapa
-- de deduplicação os contatos recém-criados, então variações de espaço/caixa do
-- mesmo nome viravam fichas distintas. Medido em 10/11/2026 nesta instalação:
--
--   * 12.590 contatos com a tag `mercos`;
--   * 8.850 deles duplicados, sem pedido e sem conversa;
--   * 1.873 grupos de mesmo nome + mesma cidade (só 7 com documento
--     conflitante — CNPJ/CPF diferente, que NÃO podem ser fundidos);
--   * 636 com a segunda tag `mercos:pedido-sem-cadastro`.
--
-- O que esta migration faz, e por quê:
--
-- 1. O cadastro é o do Mercos, 1:1. `fn_importar_pedido_mercos` passa a casar
--    o contato por documento (CNPJ, CPF por `cpf_hash`) ANTES de nome e
--    telefone, completa o que faltar no cadastro existente e só cria ficha
--    quando o cliente realmente não existe. Contato mesclado ou anonimizado
--    não é reaproveitado.
--
-- 2. Uma tag só: `mercos`. A `mercos:pedido-sem-cadastro` sai do código e dos
--    dados — ela marcava um "stub", conceito que deixa de existir quando a
--    ficha criada é o próprio cadastro do cliente no ERP.
--
-- 3. `fn_mercos_fundir_duplicados` funde os grupos históricos com a regra do
--    dono: mesmo nome (normalizado, sem acento/pontuação/sufixo societário) e
--    mesma cidade; documento diferente = clientes diferentes, ficam os dois.
--    Nada é apagado: o perdedor vira `is_merged_into` do vencedor, como a 0198
--    já faz com o nono dígito, e pedidos/conversas/leads são remarcados.
--
-- Idempotente: create or replace + updates que na segunda passada casam zero
-- linhas + fusão que não encontra mais grupos.

-- ── 1 · NOME NORMALIZADO (a mesma régua do importador legado) ───────────────
--
-- `contacts.name` chega do ERP com acento, pontuação e sufixo societário; o
-- mesmo cliente aparece como "MECANICA  GORDO", "Mecânica Gordo" e
-- "MECANICA GORDO LTDA". A chave de comparação precisa ser a mesma para os
-- três. Sem `unaccent`: o baseline não instala a extensão, e um self-host
-- fresco não pode depender dela. `translate` cobre o português.
create or replace function public.fn_mercos_nome(p_nome text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            translate(
              lower(btrim(coalesce(p_nome, ''))),
              'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
              'aaaaaaeeeeiiiiooooouuuucnyy'
            ),
            '[^a-z0-9 ]', ' ', 'g'
          ),
          '\s+', ' ', 'g'
        ),
        '\y(ltda|eireli|epp|me|cia)\y', ' ', 'g'
      )
    ),
    ''
  );
$$;

revoke execute on function public.fn_mercos_nome(text) from public, anon, authenticated;
grant execute on function public.fn_mercos_nome(text) to service_role;


-- ── 2 · A TAG ÚNICA ─────────────────────────────────────────────────────────
--
-- A segunda tag sai de TODOS os contatos, inclusive dos grupos que a fusão
-- abaixo não vai tocar (documento conflitante). `mercos` é garantida — é o
-- marcador único de "este cadastro existe no Mercos".
update public.contacts
   set tags = array_remove(tags, 'mercos:pedido-sem-cadastro'),
       updated_at = now()
 where tags @> array['mercos:pedido-sem-cadastro']::text[];

update public.contacts
   set tags = array_append(tags, 'mercos'),
       updated_at = now()
 where source = 'mercos'
   and not (tags @> array['mercos']::text[]);

-- `stub` dizia "esta ficha foi criada só para o pedido não ficar órfão". Com o
-- cadastro vindo do ERP, a ficha É o cliente — o marcador perdeu o sentido.
update public.contacts
   set source_metadata = source_metadata #- '{mercos,stub}',
       updated_at = now()
 where source_metadata->'mercos' ? 'stub';


-- ── 2b · O DOCUMENTO PODE FICAR NA FICHA MESCLADA ───────────────────────────
--
-- `contacts_org_cnpj_key` é o único índice único de contatos que NÃO filtra
-- `is_merged_into` (CPF, e-mail, telefone e identidade de WhatsApp filtram).
-- Sem o filtro, fundir duas fichas em que só o PERDEDOR tem CNPJ estoura
-- `23505`: o vencedor recebe o documento e o perdedor continua com ele.
--
-- A ficha mesclada é um ponteiro (`is_merged_into` aponta para o vencedor), e
-- manter o documento nela é o que preserva a rastreabilidade da fusão. O
-- índice passa a valer para cadastros vivos, como os irmãos.
drop index if exists public.contacts_org_cnpj_key;
create unique index if not exists contacts_org_cnpj_key
  on public.contacts (organization_id, cnpj)
  where cnpj is not null and is_merged_into is null;


-- ── 3 · FUSÃO DOS DUPLICADOS HISTÓRICOS ─────────────────────────────────────
--
-- Regra do dono: mesmo nome + mesmo CNPJ/CPF funde; mesmo nome com documento
-- diferente mantém os dois. A cidade entra como piso de segurança — "Mecânica
-- Gordo" em duas cidades pode ser dois clientes; cidade ausente acompanha a
-- única cidade do grupo.
--
-- O vencedor é o mais completo: com documento > com pedido > com conversa >
-- mais antigo. Os perdedores não são apagados: viram `is_merged_into`, e todas
-- as referências (pedidos, conversas, leads, filas) passam a apontar para o
-- vencedor — é a mesma mecânica da 0198.
--
-- `p_aplicar=false` devolve o plano sem tocar em nada (usado no teste de
-- invariante e disponível para medir antes de rodar).
create or replace function public.fn_mercos_fundir_duplicados(
  p_org uuid,
  p_aplicar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupos integer := 0;
  v_grupos_doc integer := 0;
  v_contatos_bloqueados integer := 0;
  v_perdedores integer := 0;
  v_tabela record;
begin
  if p_org is null then
    raise exception 'organizacao obrigatoria';
  end if;

  drop table if exists pg_temp._mercos_dup;
  create temp table _mercos_dup on commit drop as
  with base as (
    select c.id,
           c.organization_id,
           public.fn_mercos_nome(coalesce(c.name, c.display_name, '')) as nome,
           nullif(lower(btrim(coalesce(c.cidade, ''))), '') as cidade,
           coalesce(
             nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), ''),
             nullif(regexp_replace(
               coalesce(c.source_metadata->'mercos'->>'documento', ''), '\D', '', 'g'
             ), ''),
             c.cpf_hash
           ) as doc,
           c.created_at,
           exists (
             select 1 from public.commercial_orders o
              where o.contact_id = c.id and o.organization_id = c.organization_id
           ) as tem_pedido,
           exists (
             select 1 from public.conversations v
              where v.contact_id = c.id and v.organization_id = c.organization_id
           ) as tem_conversa
      from public.contacts c
     where c.organization_id = p_org
       and c.is_merged_into is null
       and c.is_anonymized = false
       and (c.source = 'mercos' or c.tags @> array['mercos']::text[])
       and public.fn_mercos_nome(coalesce(c.name, c.display_name, '')) is not null
  ),
  -- Quantas cidades o NOME tem na organização. A cidade em branco acompanha a
  -- única cidade do nome; nome que aparece em duas cidades é separado POR
  -- cidade — o "Mecânica Gordo" de Canoinhas não é o de Itaiópolis.
  cidades_do_nome as (
    select organization_id,
           nome,
           count(distinct cidade) filter (where cidade is not null) as cidades,
           min(cidade) filter (where cidade is not null) as cidade_unica
      from base
     group by organization_id, nome
  ),
  chave as (
    select b.*,
           case
             when b.cidade is not null then b.cidade
             when n.cidades = 1 then n.cidade_unica
             else ''
           end as cidade_chave
      from base b
      join cidades_do_nome n using (organization_id, nome)
  ),
  grupos as (
    select organization_id,
           nome,
           cidade_chave,
           count(*) as total,
           count(distinct doc) filter (where doc is not null) as docs
      from chave
     group by organization_id, nome, cidade_chave
  ),
  ranque as (
    select c.*,
           g.total,
           g.docs,
           row_number() over (
             partition by c.organization_id, c.nome, c.cidade_chave
             order by (c.doc is not null) desc,
                      c.tem_pedido desc,
                      c.tem_conversa desc,
                      c.created_at asc,
                      c.id asc
           ) as posicao
      from chave c
      join grupos g using (organization_id, nome, cidade_chave)
  )
  select r.*,
         -- Documento diferente no mesmo grupo = clientes diferentes: o grupo
         -- inteiro fica de fora. Não dá para saber de quem são as fichas sem
         -- documento, e chutar aqui seria criar cliente no lugar do outro.
         (r.docs <= 1) as fundivel,
         first_value(r.id) over (
           partition by r.organization_id, r.nome, r.cidade_chave
           order by r.posicao
         ) as vencedor_id
    from ranque r
   where r.total > 1;

  select count(distinct (nome, cidade_chave)) into v_grupos
    from pg_temp._mercos_dup where fundivel;
  select count(*) into v_perdedores
    from pg_temp._mercos_dup where fundivel and posicao > 1;
  select count(distinct (nome, cidade_chave)) into v_grupos_doc
    from pg_temp._mercos_dup where not fundivel;
  select count(*) into v_contatos_bloqueados
    from pg_temp._mercos_dup where not fundivel;

  if not p_aplicar then
    return jsonb_build_object(
      'aplicado', false,
      'grupos', v_grupos,
      'contatos_a_fundir', v_perdedores,
      'grupos_com_documento_conflitante', v_grupos_doc,
      'contatos_mantidos_por_documento', v_contatos_bloqueados
    );
  end if;

  -- 3a · o perdedor aponta para o vencedor.
  update public.contacts c
     set is_merged_into = d.vencedor_id,
         merged_at = now(),
         updated_at = now()
    from pg_temp._mercos_dup d
   where c.id = d.id
     and d.fundivel
     and d.posicao > 1
     and c.is_merged_into is null;

  -- 3b · conflitos de unicidade antes de remarcar as referências.
  --
  -- Conversa 1:1 por sessão: se vencedor e perdedor têm conversa na MESMA
  -- sessão do mesmo canal, a do perdedor some (as mensagens são remarcadas
  -- logo abaixo). Sem isto, `uniq_conversations_1to1_per_contact_session`
  -- estoura no update e a fusão inteira morre.
  --
  -- Cada bloco é condicional à existência da tabela: num baseline fresco
  -- (`campaign_recipients` nasce em instalação nova pelo schema do produto,
  -- não pelo baseline do repo) a operação deve simplesmente não acontecer —
  -- e a descoberta do catálogo (3c) cuida das que existirem. Condicionar em
  -- runtime é o que torna a migration idempotente num piso que não tem tudo.
  if to_regclass('public.conversations') is not null then
    delete from public.conversations v
     using pg_temp._mercos_dup d
     where v.contact_id = d.id
       and d.fundivel and d.posicao > 1
       and exists (
         select 1 from public.conversations w
          where w.contact_id = d.vencedor_id
            and w.organization_id = v.organization_id
            and w.channel_session_id is not distinct from v.channel_session_id
            and w.group_chat_id is not distinct from v.group_chat_id
       );
  end if;

  if to_regclass('public.campaign_recipients') is not null then
    delete from public.campaign_recipients r
     using pg_temp._mercos_dup d
     where r.contact_id = d.id
       and d.fundivel and d.posicao > 1
       and exists (
         select 1 from public.campaign_recipients w
          where w.campaign_id = r.campaign_id and w.contact_id = d.vencedor_id
       );
  end if;

  if to_regclass('public.contact_field_proposals') is not null then
    delete from public.contact_field_proposals p
     using pg_temp._mercos_dup d
     where p.contact_id = d.id
       and p.status = 'pending'
       and d.fundivel and d.posicao > 1
       and exists (
         select 1 from public.contact_field_proposals w
          where w.contact_id = d.vencedor_id
            and w.organization_id = p.organization_id
            and w.campo = p.campo
            and w.status = 'pending'
       );
  end if;

  if to_regclass('public.lead_state') is not null then
    delete from public.lead_state l
     using pg_temp._mercos_dup d
     where l.contact_id = d.id
       and d.fundivel and d.posicao > 1
       and exists (
         select 1 from public.lead_state w
          where w.contact_id = d.vencedor_id
            and w.organization_id = l.organization_id
       );
  end if;

  if to_regclass('public.followup_enrollments') is not null then
    update public.followup_enrollments e
       set status = 'cancelled',
           cancel_reason = 'contato_mesclado_mercos',
           next_eval_at = null,
           updated_at = now()
      from pg_temp._mercos_dup d
     where e.contact_id = d.id
       and e.status in ('active', 'waiting_reply', 'paused_handoff', 'paused_manual')
       and d.fundivel and d.posicao > 1;
  end if;

  if to_regclass('public.automatic_sales_queue') is not null then
    update public.automatic_sales_queue q
       set status = 'failed',
           rejection_reason = 'contato_mesclado_mercos',
           updated_at = now()
      from pg_temp._mercos_dup d
     where q.contact_id = d.id
       and q.status in ('queued', 'contacting', 'contacted', 'responded',
                        'qualified_lead', 'opportunity')
       and d.fundivel and d.posicao > 1;
  end if;

  -- 3c · todas as referências passam a apontar para o vencedor.
  --
  -- Descoberta pelo catálogo, não por lista fixa: tabela nova que referencie
  -- `contacts` entra sozinha. A exceção é por tabela — restrição própria que
  -- não deu para resolver acima deixa a linha no cadastro mesclado em vez de
  -- derrubar a fusão inteira.
  for v_tabela in
    select conrelid::regclass as tabela, a.attname as coluna
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.confrelid = 'public.contacts'::regclass
       and c.contype = 'f'
       and c.conrelid <> 'public.contacts'::regclass
       and array_length(c.conkey, 1) = 1
  loop
    begin
      execute format(
        'update %s t set %I = d.vencedor_id
           from pg_temp._mercos_dup d
          where t.%I = d.id
            and d.fundivel and d.posicao > 1',
        v_tabela.tabela, v_tabela.coluna, v_tabela.coluna
      );
    exception when unique_violation then
      null; -- a linha do perdedor fica no cadastro mesclado; nada é apagado
    end;
  end loop;

  -- 3d · o vencedor herda o que o perdedor tinha e ele não tinha.
  --
  -- Nunca sobrescreve dado já preenchido: o cadastro é do Mercos, mas quem
  -- opera a tela também escreve nele. Telefone e e-mail só migram quando o
  -- número/endereço está livre — os índices únicos parciais por organização
  -- continuam valendo para contatos vivos.
  with vencedores as (
    select distinct d.vencedor_id
      from pg_temp._mercos_dup d
     where d.fundivel and d.posicao > 1
  ),
  dados as (
    select v.vencedor_id,
           (select c2.cnpj from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.cnpj is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as cnpj,
           (select c2.cpf_hash from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.cpf_hash is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as cpf_hash,
           (select c2.cpf_encrypted from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.cpf_encrypted is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as cpf_encrypted,
           (select c2.fantasia from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.fantasia is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as fantasia,
           (select c2.ie from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.ie is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as ie,
           (select c2.tipo_pessoa from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.tipo_pessoa is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as tipo_pessoa,
           (select c2.logradouro from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.logradouro is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as logradouro,
           (select c2.numero_end from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.numero_end is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as numero_end,
           (select c2.complemento from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.complemento is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as complemento,
           (select c2.bairro from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.bairro is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as bairro,
           (select c2.cidade from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.cidade is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as cidade,
           (select c2.uf from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.uf is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as uf,
           (select c2.cep from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.cep is not null
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as cep,
           (select c2.phone_number from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.phone_number is not null
               and not exists (
                 select 1 from public.contacts x
                  where x.organization_id = c2.organization_id
                    and x.phone_number = c2.phone_number
                    and x.is_merged_into is null
                    and x.id <> v.vencedor_id
               )
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as phone,
           (select c2.email from pg_temp._mercos_dup d2
              join public.contacts c2 on c2.id = d2.id
             where d2.vencedor_id = v.vencedor_id and d2.fundivel
               and c2.email is not null
               and not exists (
                 select 1 from public.contacts x
                  where x.organization_id = c2.organization_id
                    and lower(btrim(x.email)) = lower(btrim(c2.email))
                    and x.is_merged_into is null
                    and x.id <> v.vencedor_id
               )
             order by (d2.posicao = 1) desc, c2.created_at limit 1) as email,
           (select array(
                     select distinct t
                       from public.contacts c3, unnest(c3.tags) t
                      where c3.id in (
                        select d3.id from pg_temp._mercos_dup d3
                         where d3.vencedor_id = v.vencedor_id and d3.fundivel
                      )
                        and t <> 'mercos:pedido-sem-cadastro'
                    union
                    select 'mercos'
                   )) as tags,
           (select c4.source_metadata->'mercos'
              from pg_temp._mercos_dup d4
              join public.contacts c4 on c4.id = d4.id
             where d4.vencedor_id = v.vencedor_id and d4.fundivel
               and c4.source_metadata ? 'mercos'
             order by (d4.posicao = 1) desc, c4.created_at
             limit 1) as meta_mercos
      from vencedores v
  )
  update public.contacts w
     set cnpj = coalesce(w.cnpj, dados.cnpj),
         cpf_hash = coalesce(w.cpf_hash, dados.cpf_hash),
         cpf_encrypted = coalesce(w.cpf_encrypted, dados.cpf_encrypted),
         fantasia = coalesce(w.fantasia, dados.fantasia),
         ie = coalesce(w.ie, dados.ie),
         tipo_pessoa = coalesce(w.tipo_pessoa, dados.tipo_pessoa),
         logradouro = coalesce(w.logradouro, dados.logradouro),
         numero_end = coalesce(w.numero_end, dados.numero_end),
         complemento = coalesce(w.complemento, dados.complemento),
         bairro = coalesce(w.bairro, dados.bairro),
         cidade = coalesce(w.cidade, dados.cidade),
         uf = coalesce(w.uf, dados.uf),
         cep = coalesce(w.cep, dados.cep),
         phone_number = coalesce(w.phone_number, dados.phone),
         email = coalesce(w.email, dados.email),
         tags = dados.tags,
         source_metadata = coalesce(w.source_metadata, '{}'::jsonb)
           || jsonb_build_object(
                'mercos',
                coalesce(w.source_metadata->'mercos', '{}'::jsonb)
                || coalesce(dados.meta_mercos, '{}'::jsonb)
              ),
         updated_at = now()
    from dados
   where w.id = dados.vencedor_id;

  -- 3e · a tag única também no vencedor (o perdedor pode ser o único com ela).
  update public.contacts w
     set tags = array_append(w.tags, 'mercos'),
         updated_at = now()
    from pg_temp._mercos_dup d
   where w.id = d.vencedor_id
     and d.posicao = 1
     and d.fundivel
     and not (w.tags @> array['mercos']::text[]);

  return jsonb_build_object(
    'aplicado', true,
    'grupos', v_grupos,
    'contatos_fundidos', v_perdedores,
    'grupos_com_documento_conflitante', v_grupos_doc,
    'contatos_mantidos_por_documento', v_contatos_bloqueados
  );
end;
$$;

revoke execute on function public.fn_mercos_fundir_duplicados(uuid, boolean) from public, anon, authenticated;
grant execute on function public.fn_mercos_fundir_duplicados(uuid, boolean) to service_role;


-- ── 4 · A IMPORTAÇÃO PASSA A CASAR O CADASTRO DO MERCOS ─────────────────────
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


-- ── 5 · A REVISÃO TAMBÉM COMPLETA O CADASTRO ────────────────────────────────
--
-- O pedido revisado traz o cadastro atual do ERP. Se o documento apareceu
-- depois da primeira importação, é ele que fecha o 1:1 — e a tag única é
-- garantida aqui também (contato antigo que ainda não tinha `mercos`).
-- O corpo é o da 0298, com os campos do cadastro acrescentados.

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


-- ── 6 · APLICA NOS DADOS QUE JÁ EXISTEM ─────────────────────────────────────
--
-- Instalação fresca não tem contato: a chamada não encontra grupo e não faz
-- nada. Numa base que já importou, funde os grupos históricos uma vez. Rodar
-- de novo é no-op — depois da primeira passada não existe mais perdedor.
do $$
declare
  v_org uuid;
begin
  for v_org in
    select distinct organization_id
      from public.contacts
     where is_merged_into is null
       and (source = 'mercos' or tags @> array['mercos']::text[])
  loop
    perform public.fn_mercos_fundir_duplicados(v_org, true);
  end loop;
end $$;
