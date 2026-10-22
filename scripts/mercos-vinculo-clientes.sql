-- Backfill único (21/10/2026): religa os pedidos Mercos ao cliente canônico.
--
-- A importação antiga criava um contato por pedido quando não achava CNPJ, e
-- telefone compartilhado sequestrava pedido de outro cliente. A regra da 0281
-- é documento -> nome normalizado -> telefone; este script aplica a mesma
-- regra aos 11.491 pedidos já existentes. Cria contato só para quem não tem
-- NENHUMA correspondência (30 pedidos na medição).
--
-- Rodar em transação única: se o insert ou o update falhar, nada muda.
begin;

create temp table _mercos_pedidos on commit drop as
select o.id as order_id,
       o.organization_id,
       o.numero,
       o.cliente_nome,
       o.contact_id,
       regexp_replace(coalesce(o.cliente_documento, ''), '\D', '', 'g') as doc,
       lower(regexp_replace(o.cliente_nome, '\s+', ' ', 'g')) as nome
  from public.commercial_orders o
 where o.organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
   and o.origem = 'mercos';

create index on _mercos_pedidos (doc);
create index on _mercos_pedidos (nome);

create temp table _cnpj_map on commit drop as
select distinct on (cnpj) cnpj, id
  from public.contacts
 where organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
   and cnpj is not null
 order by cnpj, created_at, id;

create temp table _doc_map on commit drop as
select distinct on (doc) doc, id
  from (
    select id, created_at,
           regexp_replace(coalesce(source_metadata->'mercos'->>'documento', ''), '\D', '', 'g') as doc
      from public.contacts
     where organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
  ) x
 where doc <> ''
 order by doc, created_at, id;

create temp table _nome_map on commit drop as
select distinct on (nome) nome, id
  from (
    select id, created_at,
           lower(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g')) as nome
      from public.contacts
     where organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
  ) x
 where nome <> ''
 order by nome, created_at, id;

-- Contatos que não existem de forma nenhuma. Um por documento (os 30 pedidos
-- são 25 documentos). O nome fica como veio; o worker novo já grava a razão
-- social limpa.
insert into public.contacts (
  organization_id, name, display_name, cnpj, phone_number,
  source, source_metadata, created_by_user_id
)
select distinct on (p.doc)
       p.organization_id,
       left(p.cliente_nome, 300),
       left(p.cliente_nome, 300),
       p.doc,
       null,
       'mercos',
       jsonb_build_object('mercos', jsonb_build_object('documento', p.doc, 'backfill', true)),
       null
  from _mercos_pedidos p
 where p.doc ~ '^\d{14}$'
   and not exists (select 1 from _cnpj_map m where m.cnpj = p.doc)
   and not exists (select 1 from _doc_map m where m.doc = p.doc)
   and not exists (select 1 from _nome_map m where m.nome = p.nome)
 order by p.doc, p.numero;

-- Remonta os mapas com os contatos recém-criados.
drop table _cnpj_map;
drop table _doc_map;
drop table _nome_map;

create temp table _cnpj_map on commit drop as
select distinct on (cnpj) cnpj, id
  from public.contacts
 where organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
   and cnpj is not null
 order by cnpj, created_at, id;

create temp table _doc_map on commit drop as
select distinct on (doc) doc, id
  from (
    select id, created_at,
           regexp_replace(coalesce(source_metadata->'mercos'->>'documento', ''), '\D', '', 'g') as doc
      from public.contacts
     where organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
  ) x
 where doc <> ''
 order by doc, created_at, id;

create temp table _nome_map on commit drop as
select distinct on (nome) nome, id
  from (
    select id, created_at,
           lower(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g')) as nome
      from public.contacts
     where organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
  ) x
 where nome <> ''
 order by nome, created_at, id;

with canonico as (
  select p.order_id,
         coalesce(cm.id, dm.id, nm.id) as contact_id
    from _mercos_pedidos p
    left join _cnpj_map cm on p.doc ~ '^\d{14}$' and cm.cnpj = p.doc
    left join _doc_map dm on p.doc <> '' and dm.doc = p.doc
    left join _nome_map nm on nm.nome = p.nome
)
update public.commercial_orders o
   set contact_id = c.contact_id
  from canonico c
 where o.id = c.order_id
   and c.contact_id is not null
   and o.contact_id is distinct from c.contact_id;

commit;
