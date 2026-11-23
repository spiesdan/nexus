-- 0337 — ORÇAMENTO POR CAMPANHA E GASTO DE MÍDIA LANÇADO À MÃO.
--
-- Dois componentes de gasto (prospecção e verba de mídia Meta) precisam de
-- orçamento próprio por campanha, somado ao limite mensal da organização que
-- já existe em `prospecting_settings.orcamento_mensal_cents`.
--
-- O gasto de PROSPECÇÃO é real: vem do consumo medido. O de MÍDIA é LANÇAMENTO
-- MANUAL até existir Marketing API — nenhuma importação, nenhum "gasto
-- simulado" vira fato. A tela dirá isso, e a tabela guarda autor + observação
-- para o lançamento ser auditável.
--
-- Nada destrutivo: duas colunas aditivas e uma tabela nova com RLS por org.

alter table public.prospecting_campaigns
  add column if not exists orcamento_prospeccao_cents integer,
  add column if not exists orcamento_midia_cents integer;

create table if not exists public.prospecting_campaign_spend (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.prospecting_campaigns(id) on delete cascade,
  /** Dia do lançamento — um lançamento por dia/campanha é soma, não substitui. */
  data date not null default current_date,
  valor_cents integer not null check (valor_cents >= 0),
  observacao text,
  autor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospecting_campaign_spend_org_campanha_idx
  on public.prospecting_campaign_spend (organization_id, campaign_id, data desc);

alter table public.prospecting_campaign_spend enable row level security;

drop policy if exists prospecting_campaign_spend_select on public.prospecting_campaign_spend;
create policy prospecting_campaign_spend_select on public.prospecting_campaign_spend
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists prospecting_campaign_spend_write on public.prospecting_campaign_spend;
create policy prospecting_campaign_spend_write on public.prospecting_campaign_spend
  for all using (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'agent')
  )
  with check (
    public.fn_is_platform_admin()
    or public.fn_role_at_least(organization_id, 'agent')
  );

revoke all on public.prospecting_campaign_spend from anon;
grant select, insert, update, delete on public.prospecting_campaign_spend to authenticated;
grant all on public.prospecting_campaign_spend to service_role;

drop trigger if exists trg_prospecting_campaign_spend_updated_at on public.prospecting_campaign_spend;
create trigger trg_prospecting_campaign_spend_updated_at
  before update on public.prospecting_campaign_spend
  for each row execute function public.fn_set_updated_at();

comment on table public.prospecting_campaign_spend is
  'Gasto de mídia LANÇADO MANUALMENTE por campanha (autor, data e observação). Não é gasto real da Marketing API.';
