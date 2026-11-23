-- 0339 — FOLLOW-UP DE RETOMADA 48h, UM POR (CAMPANHA, PROSPECT).
--
-- Regra do dono: para quem não respondeu ao primeiro envio, agendar UM
-- follow-up 48h depois. Cancelar se respondeu, pediu opt-out, a conversa foi
-- encerrada por opt-out ou o prospect foi excluído. O unique garante que
-- reexecutar o tick não crie uma segunda linha; `tentativas` tem teto e o
-- motivo do cancelamento/erro é gravado — nenhuma fila muda sem próximo passo.
--
-- O TEXTO não vive aqui: o preset configurável mora em
-- `prospecting_message_presets` (categoria `retomada`). Fora da janela de 24h
-- da Meta, o envio usa template aprovado — a decisão é pura em
-- `lib/prospeccao/retomada.ts`. Nenhum nome de marca/tenant é hardcoded.
create table if not exists public.prospecting_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.prospecting_campaigns(id) on delete cascade,
  prospect_id uuid not null references public.business_prospects(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'cancelado', 'falhou')),
  agendado_em timestamptz not null,
  tentativas integer not null default 0 check (tentativas >= 0),
  ultimo_erro text,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospecting_followups_unico unique (campaign_id, prospect_id)
);

create index if not exists prospecting_followups_org_agendado_idx
  on public.prospecting_followups (organization_id, status, agendado_em);

alter table public.prospecting_followups enable row level security;

drop policy if exists prospecting_followups_select on public.prospecting_followups;
create policy prospecting_followups_select on public.prospecting_followups
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists prospecting_followups_write on public.prospecting_followups;
create policy prospecting_followups_write on public.prospecting_followups
  for all using (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'agent')
  )
  with check (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'agent')
  );

revoke all on public.prospecting_followups from anon;
grant select, insert, update, delete on public.prospecting_followups to authenticated;
grant all on public.prospecting_followups to service_role;

drop trigger if exists trg_prospecting_followups_updated_at on public.prospecting_followups;
create trigger trg_prospecting_followups_updated_at
  before update on public.prospecting_followups
  for each row execute function public.fn_set_updated_at();

comment on table public.prospecting_followups is
  'Follow-up único por (campanha, prospect), 48h após o envio inicial. Texto vem de preset; janela da Meta decide texto livre x template aprovado.';
