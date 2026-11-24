-- 0351 — ORDEM DOS EVENTOS DO STRIPE.
--
-- Webhooks podem chegar fora de ordem. Sem a data do evento do lado do ERP
-- não há como recusar um `subscription.updated` antigo que chegou depois de
-- um recente. A coluna é preenchida pelo webhook com `event.created` do
-- Stripe (unix seconds), nunca com `now()`.

alter table public.billing_events
  add column if not exists evento_criado_em timestamptz;

create index if not exists billing_events_org_tipo_criado_idx
  on public.billing_events (organization_id, tipo, evento_criado_em desc);
