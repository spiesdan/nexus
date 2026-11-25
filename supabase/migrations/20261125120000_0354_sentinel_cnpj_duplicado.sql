-- 0354 — CLIENTE DUPLICADO POR CNPJ, COM A IE EM JOGO
--
-- ─── Por que esta view existe ──────────────────────────────────────────────
--
-- A view irmã (`sentinel_contatos_duplicados`) agrupa por `email_normalized`.
-- Isso cobre captação e cadastro manual, e não cobre o caso que **parou uma
-- nota em produção** em 25/11/2026: o pedido 19733 apontava para uma ficha de
-- `ACOMINA SOLUCOES EM MINERACAO LTDA` **sem Inscrição Estadual**, enquanto a
-- outra ficha do mesmo CNPJ tinha a IE desde 23/11 — e o CNPJ tem IE ativa em
-- SC. A SEFAZ recusou com `232 — IE do destinatário não informada`.
--
-- Duas fichas do mesmo CNPJ não são só dado duplicado: elas **divergem em
-- campo fiscal**. Uma ganha endereço novo, a outra não; uma tem IE, a outra
-- não. Quem aponta para a incompleta emite nota errada.
--
-- ─── O que ela NÃO faz ─────────────────────────────────────────────────────
--
-- Não funde nada. Fundir cadastro apaga histórico, consentimento e pedido, e a
-- decisão do dono é explícita: duplicado se **mostra**, não se resolve sozinho.
-- A view só diz onde estão as fichas e se a IE/UF diverge entre elas.
--
-- `security_invoker = true` mantém a RLS de `contacts`.

create or replace view public.sentinel_contatos_cnpj_duplicados
with (security_invoker = true)
as
select
  c.organization_id,
  regexp_replace(c.cnpj, '[^0-9]', '', 'g') as cnpj,
  count(*)::integer as total,
  (array_agg(c.id order by c.created_at))[1:20] as ids,
  -- "(sem)" entra na contagem de propósito: "uma ficha tem IE e a outra não"
  -- é exatamente a divergência que impede a nota de sair.
  count(distinct coalesce(nullif(btrim(c.ie), ''), '(sem)'))::integer as ies_distintas,
  count(distinct coalesce(nullif(btrim(c.uf), ''), '(sem)'))::integer as ufs_distintas
from public.contacts c
where c.cnpj is not null
  and length(regexp_replace(c.cnpj, '[^0-9]', '', 'g')) = 14
  and c.is_anonymized = false
  and c.is_merged_into is null
group by c.organization_id, regexp_replace(c.cnpj, '[^0-9]', '', 'g')
having count(*) > 1;

revoke all on public.sentinel_contatos_cnpj_duplicados from anon;
grant select on public.sentinel_contatos_cnpj_duplicados to authenticated;
grant select on public.sentinel_contatos_cnpj_duplicados to service_role;

comment on view public.sentinel_contatos_cnpj_duplicados is
  'Clientes com o mesmo CNPJ (14 dígitos) na organização, com quantas IEs e UFs distintas aparecem entre as fichas. Agregado para o detector; não funde nada.';
