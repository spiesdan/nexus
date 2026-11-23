-- 0338 — UMA EMPRESA PODE ESTAR EM VÁRIAS CAMPANHAS (MEMBRESIA).
--
-- Desde a 0277, `prospecting_campaign_reserva_unica` impedia que a mesma
-- empresa entrasse em duas campanhas (`prospect_ids && new.prospect_ids` →
-- 23505 `prospect_em_outra_campanha`). Isso bloqueia o fluxo pedido pelo dono:
-- empresa já contatada ou já em outra campanha TEM que poder entrar na nova,
-- com mensagem de retomada em vez do template de primeiro contato.
--
-- A exclusividade vira MEMBRESIA: `prospecting_campaign_prospects` guarda o
-- vínculo, único por (campanha, prospect). O que continua proibido é:
--   1. dois envios para o mesmo prospect NA MESMA campanha —
--      `prospecting_sends_campanha_prospect_unico` (0277) permanece;
--   2. duas campanhas ativas disparando para o mesmo número no mesmo dia —
--      `pacing_ledger` + `disparo.ts`/`agendado.ts` permanecem.
-- Nenhuma regra comercial nova é inventada aqui. Contatos de recuperação
-- (`contato_ids`) seguem exclusivos: fora do escopo desta fatia.
--
-- Aditiva: cria tabela, backfill do que já existe e reescreve só o ramo de
-- prospects do trigger. Nenhum dado é apagado.

create table if not exists public.prospecting_campaign_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.prospecting_campaigns(id) on delete cascade,
  prospect_id uuid not null references public.business_prospects(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint prospecting_campaign_prospects_unico unique (campaign_id, prospect_id)
);

create index if not exists prospecting_campaign_prospects_org_prospect_idx
  on public.prospecting_campaign_prospects (organization_id, prospect_id);

alter table public.prospecting_campaign_prospects enable row level security;

drop policy if exists prospecting_campaign_prospects_select on public.prospecting_campaign_prospects;
create policy prospecting_campaign_prospects_select on public.prospecting_campaign_prospects
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists prospecting_campaign_prospects_write on public.prospecting_campaign_prospects;
create policy prospecting_campaign_prospects_write on public.prospecting_campaign_prospects
  for all using (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'agent')
  )
  with check (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'agent')
  );

revoke all on public.prospecting_campaign_prospects from anon;
grant select, insert, update, delete on public.prospecting_campaign_prospects to authenticated;
grant all on public.prospecting_campaign_prospects to service_role;

comment on table public.prospecting_campaign_prospects is
  'Membros de cada campanha (0338). Um prospect pode estar em várias campanhas; o envio único por campanha continua em prospecting_sends.';

-- O envio passa a ser ÚNICO POR CAMPANHA, não mais por organização. O índice
-- org-wide da 0277 impedia justamente o recontato pedido pelo dono (empresa
-- já mandada mensagem entra na nova com texto de retomada). Continua valendo
-- o unique (campaign_id, prospect_id) e o espaçamento do pacing_ledger.
drop index if exists public.prospecting_sends_org_prospect_unico;

-- Backfill: o que já estava em prospect_ids vira membresia, sem duplicar.
insert into public.prospecting_campaign_prospects (organization_id, campaign_id, prospect_id)
select c.organization_id, c.id, membro.prospect_id
from public.prospecting_campaigns c
cross join lateral unnest(coalesce(c.prospect_ids, '{}'::uuid[])) as membro(prospect_id)
where membro.prospect_id is not null
on conflict (campaign_id, prospect_id) do nothing;

-- Reescreve o trigger: o ramo de prospects sai; o de contatos fica.
create or replace function public.prospecting_campaign_reserva_unica()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conflito_id uuid;
  conflito_nome text;
begin
  -- 0338: prospect em outras campanhas É permitido. A proteção é por ENVIO
  -- (unique de prospecting_sends por campanha) e pelo pacing global do número.
  if new.contato_ids is not null and cardinality(new.contato_ids) > 0 then
    select c.id, c.nome into conflito_id, conflito_nome
    from public.prospecting_campaigns c
    where c.organization_id = new.organization_id
      and c.id is distinct from new.id
      and c.contato_ids && new.contato_ids
    limit 1;
    if conflito_id is not null then
      raise exception 'contato_em_outra_campanha'
        using errcode = '23505',
          detail = format(
            'O contato já está reservado na campanha %s (%s).', conflito_id, conflito_nome
          ),
          hint = 'Remova o contato da outra campanha antes de adicioná-lo a esta.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.prospecting_campaign_reserva_unica() is
  'Desde 0338 só protege contatos de recuperação. Prospects podem estar em várias campanhas; o envio único por campanha é prospecting_sends_campanha_prospect_unico.';

revoke execute on function public.prospecting_campaign_reserva_unica() from public, anon, authenticated;
grant execute on function public.prospecting_campaign_reserva_unica() to service_role;
