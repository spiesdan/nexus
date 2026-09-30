-- ============================================================================
-- 0246 — VENDA AUTOMÁTICA DIÁRIA (spec docs/specs/18-spec-venda-automatica.md)
--
-- Campanha diária de prospecção por cidade + categorias, consumindo o Radar
-- (business_prospects) como FONTE — a descoberta continua sendo do módulo de
-- prospecção; nada aqui chama provider externo.
--
-- Três tabelas, todas org-scoped com RLS molde 0204/0221:
--   automatic_sales_campaigns — configuração (cidade, categorias, cota diária,
--     janela de horário, oferta vinda do catálogo real, follow-ups, dono);
--   automatic_sales_queue     — a fila por dia (uma linha por prospect da
--     campanha, status da jornada, interesse estruturado, follow-up);
--   automatic_sales_events    — timeline imutável (§22 do spec).
--
-- O contato/empresa NÃO ganha tabela própria: contact_id → contacts e
-- prospect_id → business_prospects. Origem do lead = contacts.source
-- 'RADAR_AUTOMATICO' (coluna aberta) + tag 'venda-automatica'.
--
-- Travas de duplicidade (§15):
--   * uq_queue_campanha_prospect — uma linha por prospect em cada campanha;
--   * uq_queue_contato_ativo     — NUNCA duas campanhas em andamento para o
--     mesmo contato ao mesmo tempo (parcial: só status ativos);
--   * cota diária é contada pela aplicação sobre status que entraram em
--     CONTACTING no dia (novos contatos), com o dia gravado na linha.
--
-- Idempotência de worker duplicado: as transições de status são UPDATE
-- condicional na aplicação (0 linhas = outro worker venceu); o índice único
-- acima faz o insert concorrente falhar em vez de duplicar.
-- ============================================================================

create table if not exists public.automatic_sales_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  nome text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),

  -- Uma campanha = uma cidade por vez (§17); uf só rotula.
  cidade text not null,
  uf text,
  categorias text[] not null default '{}',

  -- Cota de NOVOS contatos por dia (§6): follow-ups não entram na conta.
  limite_diario integer not null
    check (limite_diario >= 1 and limite_diario <= 500),
  janela_inicio time not null default '09:00',
  janela_fim time not null default '17:30',

  -- Oferta: ids de catalog_products (§7 — a IA só enxerga o catálogo real).
  -- Sem FK por ser array; a aplicação valida pertencimento à org.
  oferta_produtos uuid[] not null default '{}',
  perfil_abordagem text,

  -- Escalonamento de follow-up (§14): 24h → 48h → encerra (2= padrão do spec).
  followup_horas smallint[] not null default '{24,48}',
  followup_textos text[] not null default '{}',

  responsavel_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automatic_sales_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.automatic_sales_campaigns(id) on delete cascade,

  prospect_id uuid references public.business_prospects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,

  -- O dia da cota a que a linha pertence (data no fuso da org, gravada pelo worker).
  dia date not null,

  -- §5: a jornada, em minúsculas (vocabulário da casa).
  status text not null default 'discovered'
    check (status in (
      'discovered', 'qualified', 'queued', 'contacting', 'contacted',
      'responded', 'qualified_lead', 'opportunity', 'order',
      'no_response', 'not_interested', 'invalid_contact', 'failed'
    )),
  -- §11: classificação de interesse estruturada no banco.
  interest_level text
    check (interest_level is null or interest_level in ('alto', 'medio', 'baixo', 'recusou')),

  followup_count smallint not null default 0
    check (followup_count >= 0),
  proximo_followup_at timestamptz,
  ultima_mensagem_at timestamptz,
  rejection_reason text,

  -- Snapshot mínimo da empresa para a fila exibir sem join (o prospect pode
  -- sumir); NÃO é cópia de cadastro — nome/categoria/cidade/telefone.
  snapshot jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automatic_sales_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.automatic_sales_campaigns(id) on delete cascade,
  queue_id uuid references public.automatic_sales_queue(id) on delete cascade,

  -- Vocabulário livre validado na aplicação (§22); payload carrega o detalhe.
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Duplicidade: uma linha por prospect em cada campanha, para sempre.
create unique index if not exists uq_automatic_sales_queue_campanha_prospect
  on public.automatic_sales_queue (campaign_id, prospect_id)
  where prospect_id is not null;

-- §15: nunca duas campanhas EM ANDAMENTO para o mesmo contato. Parcial de
-- propósito — um contato encerrado (no_response/not_interested/…) não proíbe
-- uma futura abordagem de outra campanha.
create unique index if not exists uq_automatic_sales_queue_contato_ativo
  on public.automatic_sales_queue (organization_id, contact_id)
  where contact_id is not null
    and status in ('queued', 'contacting', 'contacted', 'responded',
                   'qualified_lead', 'opportunity');

-- Cota do dia e painéis (§6/§16).
create index if not exists idx_automatic_sales_queue_campanha_dia
  on public.automatic_sales_queue (campaign_id, dia, status);
create index if not exists idx_automatic_sales_queue_org_dia
  on public.automatic_sales_queue (organization_id, dia, status);

-- Follow-ups vencendo (§14) — só os que aguardam resposta.
create index if not exists idx_automatic_sales_queue_followup
  on public.automatic_sales_queue (proximo_followup_at)
  where proximo_followup_at is not null and status = 'contacted';

-- Campanhas ativas para o tick do worker.
create index if not exists idx_automatic_sales_campaigns_org_status
  on public.automatic_sales_campaigns (organization_id, status)
  where status = 'active';

-- Timeline por campanha (mais recente primeiro) e por item da fila.
create index if not exists idx_automatic_sales_events_campanha
  on public.automatic_sales_events (campaign_id, created_at desc);
create index if not exists idx_automatic_sales_events_fila
  on public.automatic_sales_events (queue_id, created_at asc);

drop trigger if exists trg_automatic_sales_campaigns_updated_at on public.automatic_sales_campaigns;
create trigger trg_automatic_sales_campaigns_updated_at
  before update on public.automatic_sales_campaigns
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_automatic_sales_queue_updated_at on public.automatic_sales_queue;
create trigger trg_automatic_sales_queue_updated_at
  before update on public.automatic_sales_queue
  for each row execute function public.fn_set_updated_at();

alter table public.automatic_sales_campaigns enable row level security;
alter table public.automatic_sales_queue enable row level security;
alter table public.automatic_sales_events enable row level security;

drop policy if exists automatic_sales_campaigns_select on public.automatic_sales_campaigns;
create policy automatic_sales_campaigns_select on public.automatic_sales_campaigns
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists automatic_sales_campaigns_write on public.automatic_sales_campaigns;
create policy automatic_sales_campaigns_write on public.automatic_sales_campaigns
  for all using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists automatic_sales_queue_select on public.automatic_sales_queue;
create policy automatic_sales_queue_select on public.automatic_sales_queue
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists automatic_sales_queue_write on public.automatic_sales_queue;
create policy automatic_sales_queue_write on public.automatic_sales_queue
  for all using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists automatic_sales_events_select on public.automatic_sales_events;
create policy automatic_sales_events_select on public.automatic_sales_events
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists automatic_sales_events_insert on public.automatic_sales_events;
create policy automatic_sales_events_insert on public.automatic_sales_events
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

revoke all on public.automatic_sales_campaigns from anon;
revoke all on public.automatic_sales_queue from anon;
revoke all on public.automatic_sales_events from anon;
grant select, insert, update, delete on public.automatic_sales_campaigns to authenticated;
grant select, insert, update, delete on public.automatic_sales_queue to authenticated;
grant select, insert on public.automatic_sales_events to authenticated;
grant all on public.automatic_sales_campaigns to service_role;
grant all on public.automatic_sales_queue to service_role;
grant all on public.automatic_sales_events to service_role;

comment on table public.automatic_sales_campaigns is
  'Campanhas de Venda Automática: cidade + categorias + cota diária + janela + oferta do catálogo (spec 18).';
comment on table public.automatic_sales_queue is
  'Fila diária da Venda Automática: uma linha por prospect da campanha, com jornada, interesse e follow-up (spec 18).';
comment on table public.automatic_sales_events is
  'Timeline imutável da Venda Automática: descoberta → seleção → envio → resposta → conversão (spec 18 §22).';
