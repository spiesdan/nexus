-- Backfill do vendedor Mercos (21/10/2026).
--
-- A varredura da lista grava `{numero, vendedor}` em sellers.csv (um cartão
-- por pedido, campo "emitido por"). Este script aplica o nome bruto em
-- `vendedor_nome` e resolve o UUID apenas quando o emissor é usuário do CRM
-- (ANA, EDITH). "VENDEDOR JB" fica com UUID nulo e nome preservado.
begin;

create temp table _sellers (
  numero integer primary key,
  vendedor text
);

\copy _sellers from '/tmp/sellers.csv' with (format csv, header true)

update public.commercial_orders o
   set vendedor_nome = left(s.vendedor, 200),
       vendedor_user_id = coalesce(
         (
           select u.id
             from auth.users u
            where lower(regexp_replace(
                    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
                    '\s+', ' ', 'g'
                  )) = lower(regexp_replace(s.vendedor, '\s+', ' ', 'g'))
               or lower(split_part(
                    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
                    ' ', 1
                  )) = lower(regexp_replace(s.vendedor, '\s+', ' ', 'g'))
               or lower(split_part(u.email, '@', 1)) = lower(regexp_replace(s.vendedor, '\s+', ' ', 'g'))
            order by u.created_at
            limit 1
         ),
         o.vendedor_user_id
       )
  from _sellers s
 where o.organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
   and o.origem = 'mercos'
   and o.numero = s.numero
   and nullif(trim(s.vendedor), '') is not null;

select count(*) as com_vendedor,
       count(*) filter (where vendedor_user_id is not null) as com_usuario
  from public.commercial_orders
 where organization_id = '4bc721ce-157a-41b9-97ae-ba633650859c'
   and origem = 'mercos';

commit;
