-- 0343 — COBRANÇA SAAS DO NEXUS (somente modo de teste).
--
-- Oito tabelas prefixadas billing_*, uma por responsabilidade: cliente,
-- assinatura, fatura, checkout, avisos D-3/D-2/D-1, eventos do webhook,
-- verificações pendentes (Stripe fora) e suspensão/reativação. Nenhuma
-- mistura com pagamentos de tenant (commercial-orders/invoices/financeiro).
-- Produção: to_regclass confirmou que NENHUMA billing_* existe.
--
-- RLS: leitura por organization_id via fn_user_org_ids()/plataforma.
-- Sem policy de INSERT/UPDATE/DELETE para authenticated: escrita só service
-- role, que bypassa RLS e filtra organization_id de fonte confiável na rota.

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, stripe_customer_id)
);

alter table public.billing_customers enable row level security;

drop policy if exists "tenant_isolation_billing_customers_all" on public.billing_customers;
create policy "tenant_isolation_billing_customers_all" on public.billing_customers for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.billing_customers(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, stripe_subscription_id)
);

alter table public.billing_subscriptions enable row level security;

drop policy if exists "tenant_isolation_billing_subscriptions_all" on public.billing_subscriptions;
create policy "tenant_isolation_billing_subscriptions_all" on public.billing_subscriptions for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.billing_subscriptions(id) on delete cascade,
  stripe_invoice_id text not null unique,
  numero text,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null,
  due_at timestamptz,
  status text not null,
  paid_at timestamptz,
  hosted_invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, stripe_invoice_id)
);

alter table public.billing_invoices enable row level security;

drop policy if exists "tenant_isolation_billing_invoices_all" on public.billing_invoices;
create policy "tenant_isolation_billing_invoices_all" on public.billing_invoices for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

create table if not exists public.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_session_id text not null unique,
  status text not null,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.billing_checkout_sessions enable row level security;

drop policy if exists "tenant_isolation_billing_checkout_sessions_all" on public.billing_checkout_sessions;
create policy "tenant_isolation_billing_checkout_sessions_all" on public.billing_checkout_sessions for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

create table if not exists public.billing_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  etapa smallint not null check (etapa in (3,2,1)),
  canal text not null,
  enviado_em timestamptz,
  resultado text not null,
  detalhe text,
  criado_em timestamptz not null default now(),
  unique (invoice_id, etapa)
);

alter table public.billing_notices enable row level security;

drop policy if exists "tenant_isolation_billing_notices_all" on public.billing_notices;
create policy "tenant_isolation_billing_notices_all" on public.billing_notices for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  organization_id uuid references public.organizations(id) on delete cascade,
  tipo text not null,
  payload_hash text not null,
  fora_de_ordem boolean not null default false,
  processado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

alter table public.billing_events enable row level security;

drop policy if exists "tenant_isolation_billing_events_all" on public.billing_events;
create policy "tenant_isolation_billing_events_all" on public.billing_events for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

create table if not exists public.billing_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  referencia_id uuid,
  proxima_tentativa timestamptz not null default now(),
  tentativas integer not null default 0,
  ultimo_erro text,
  resolvido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_verifications enable row level security;

drop policy if exists "tenant_isolation_billing_verifications_all" on public.billing_verifications;
create policy "tenant_isolation_billing_verifications_all" on public.billing_verifications for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

create table if not exists public.billing_suspensions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  estado text not null check (estado in ('suspensa','reativada')),
  motivo text not null,
  autor text not null,
  evento_id uuid references public.billing_events(id) on delete set null,
  criado_em timestamptz not null default now()
);

alter table public.billing_suspensions enable row level security;

drop policy if exists "tenant_isolation_billing_suspensions_all" on public.billing_suspensions;
create policy "tenant_isolation_billing_suspensions_all" on public.billing_suspensions for select using (
  public.fn_is_platform_admin()
  or organization_id in (select public.fn_user_org_ids())
);

comment on table public.billing_notices is 'Avisos D-3/D-2/D-1 por fatura; unique(invoice_id, etapa) impede reenvio.';
comment on table public.billing_events is 'Eventos do webhook Stripe; stripe_event_id único é a idempotência.';
