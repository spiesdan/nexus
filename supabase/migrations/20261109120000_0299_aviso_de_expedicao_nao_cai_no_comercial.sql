-- 0299 — o aviso de expedição nunca sai pelo número comercial
--
-- O problema medido em 2026-11-09: o número de expedição (WAHA) caiu e o
-- cliente ainda recebeu "seu pedido saiu para entrega" — pelo número
-- COMERCIAL. O fallback existia de propósito ("nunca trocar avisar por outro
-- número por não avisar"), mas ele quebra a separação que o dono pediu: a conta
-- comercial passou a ver no inbox avisos de expedição que não são dela.
--
-- A regra agora é dura: aviso de rota só sai pelo número marcado como
-- `metadata.finalidade = 'expedicao'`. Se ele não existe ou não está `WORKING`,
-- o aviso FICA NA FILA e é entregue quando o número voltar. Nada de expedição
-- pelo comercial, nem como último recurso.
--
-- Por que uma tabela e não `messages.status='queued'`: o caminho de envio já
-- grava `queued` quando a sessão não está pronta, mas NÃO existe drenagem desse
-- estado — a linha ficaria parada para sempre. E reenviar uma linha `queued`
-- exigiria reimplementar o envio num segundo lugar, que é exatamente onde os
-- guardrails divergem. A fila guarda o FATO ("este pedido precisa do aviso"),
-- com `unique (shipment_id, order_id)` impedindo dois avisos para o mesmo
-- pedido; quando o número volta, o mesmo caminho canônico de envio é chamado.
create table if not exists public.shipment_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  order_id uuid not null references public.commercial_orders(id) on delete cascade,

  -- pendente = esperando o número; enviando = um tick pegou; enviado = saiu;
  -- falhou = tentou com o número no ar e o envio não passou (terminal).
  status text not null default 'pendente',
  attempts integer not null default 0,

  message_id uuid references public.messages(id) on delete set null,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,

  constraint shipment_notices_status_valido check (
    status in ('pendente', 'enviando', 'enviado', 'falhou')
  ),
  constraint shipment_notices_attempts_nao_negativo check (attempts >= 0),
  constraint shipment_notices_carga_pedido_unico unique (shipment_id, order_id)
);

comment on table public.shipment_notices is
  'Fila durável do aviso "saiu para entrega". O aviso só sai pelo número de expedição; se ele está fora do ar, a linha fica pendente e o cron expedition-notices entrega quando a sessão volta a WORKING. Unique (shipment_id, order_id) impede aviso dobrado.';

create index if not exists shipment_notices_fila_idx
  on public.shipment_notices (organization_id, status, created_at)
  where status in ('pendente', 'enviando');

alter table public.shipment_notices enable row level security;

drop policy if exists shipment_notices_select on public.shipment_notices;
create policy shipment_notices_select on public.shipment_notices
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists shipment_notices_write on public.shipment_notices;
create policy shipment_notices_write on public.shipment_notices
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

revoke all on public.shipment_notices from anon;
grant select, insert, update, delete on public.shipment_notices to authenticated;
grant all on public.shipment_notices to service_role;

drop trigger if exists trg_shipment_notices_updated_at on public.shipment_notices;
create trigger trg_shipment_notices_updated_at
  before update on public.shipment_notices
  for each row execute function public.fn_set_updated_at();
