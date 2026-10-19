-- 0273_prospeccao_agendada
--
-- O QUE MUDOU
--
-- A prospecção passa a ter RELÓGIO. O disparo de hoje é um POST síncrono que
-- segura a requisição por ~50 minutos (`prospects/disparar`, `esperar()` +
-- `enviarPlano()`) — não cabe ali "das 7 às 12, 13 às 19, de 19/10 a 23/10,
-- uma por minuto". Agendamento precisa de um TICK de cron que mande UMA
-- mensagem por minuto, dentro da janela, no período, e pare sozinho.
--
-- `prospecting_campaigns` ganha o que a agenda precisa:
--   prospect_ids  — a LISTA FECHADA escolhida na tela. Sem ela o tick não sabe
--                   a quem mandar (o filtro não é fonte de verdade: a seleção é).
--   mensagens     — as variações (1..5) que hoje só existem no formulário
--                   efêmero; sem coluna, o tick perderia a rotação anti-ban.
--   espaco_ms     — o ritmo entre duas mensagens (60s = uma por minuto).
--   limite_diario — a cota do DIA (a janela é do RELÓGIO; não são a mesma coisa).
--   data_inicio/data_fim — o PERÍODO ("do dia 19/10 ao 23/10").
--   janelas       — VÁRIAS por dia ([{"inicio":"07:00","fim":"12:00"}, ...]).
--   agendada_em   — marca que a campanha está agendada (o tick filtra por ela).
--   ultimo_envio_at — carimbo do último envio da campanha (espaçamento no banco).
--
-- E nasce `public.prospecting_sends`: o LEDGER que torna o tick idempotente e
-- conta a cota do dia. A unique (campaign_id, prospect_id) é o que impede que
-- dois ticks sobrepostos (cron atrasado, contêiner duplicado) mandem duas vezes
-- para a mesma empresa — a mesma defesa do `automatic_sales_queue` (0269).
--
-- SEM FUNÇÃO NOVA: não há grant de função a fazer. A tabela é tenant-aware,
-- então levamos a MESMA policy de `prospecting_campaigns` (select por tenancy,
-- escrita com agent+), o revoke da anon e os grants.

alter table public.prospecting_campaigns
  add column if not exists prospect_ids uuid[] not null default '{}';

alter table public.prospecting_campaigns
  add column if not exists mensagens text[] not null default '{}';

alter table public.prospecting_campaigns
  add column if not exists espaco_ms integer not null default 60000;

alter table public.prospecting_campaigns
  add column if not exists limite_diario integer not null default 50;

alter table public.prospecting_campaigns
  add column if not exists data_inicio date;

alter table public.prospecting_campaigns
  add column if not exists data_fim date;

alter table public.prospecting_campaigns
  add column if not exists janelas jsonb not null default '[]'::jsonb;

alter table public.prospecting_campaigns
  add column if not exists agendada_em timestamptz;

alter table public.prospecting_campaigns
  add column if not exists ultimo_envio_at timestamptz;

-- Os CHECKs são a defesa do WORKER contra uma linha gravada por caminho torto
-- (a validação da tela é o Zod; o banco é a última linha).
alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_espaco_faixa;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_espaco_faixa
  check (espaco_ms >= 1000 and espaco_ms <= 60000);

alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_limite_faixa;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_limite_faixa
  check (limite_diario >= 1 and limite_diario <= 500);

alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_janelas_array;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_janelas_array
  check (jsonb_typeof(janelas) = 'array');

alter table public.prospecting_campaigns
  drop constraint if exists prospecting_campaigns_periodo_valido;
alter table public.prospecting_campaigns
  add constraint prospecting_campaigns_periodo_valido
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio);

-- ─── O ledger de envios ─────────────────────────────────────────────────────

create table if not exists public.prospecting_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.prospecting_campaigns(id) on delete cascade,
  prospect_id uuid not null references public.business_prospects(id) on delete cascade,
  -- Qual variação saiu (base 0). Guardado para a rotação CONTINUAR de onde
  -- parou: `enviadosDaCampanha % mensagens.length`, não 0 a cada tick.
  mensagem_indice smallint not null default 0,
  message_id text,
  enviado_em timestamptz not null default now(),
  -- A defesa de idempotência: um prospect só entra uma vez por campanha.
  constraint prospecting_sends_campanha_prospect_unico unique (campaign_id, prospect_id)
);

create index if not exists prospecting_sends_org_campanha_idx
  on public.prospecting_sends (organization_id, campaign_id, enviado_em);

alter table public.prospecting_sends enable row level security;

drop policy if exists prospecting_sends_select on public.prospecting_sends;
create policy prospecting_sends_select on public.prospecting_sends
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists prospecting_sends_write on public.prospecting_sends;
create policy prospecting_sends_write on public.prospecting_sends
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

revoke all on public.prospecting_sends from anon;
grant select, insert, update, delete on public.prospecting_sends to authenticated;
grant all on public.prospecting_sends to service_role;

comment on table public.prospecting_sends is
  'Ledger de envios agendados: uma linha por (campanha, prospect). Idempotência do tick + cota do dia.';

comment on column public.prospecting_campaigns.janelas is
  'Janelas do dia (jsonb array de {inicio,fim} HH:MM). Lista vazia = sem restrição de horário.';

comment on column public.prospecting_campaigns.agendada_em is
  'Quando o agendamento foi confirmado. NULL = campanha não agendada (o tick não a pega).';
