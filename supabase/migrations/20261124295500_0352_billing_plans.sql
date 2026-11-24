-- 0352 — PLANO NO BANCO, não no código (decisão do dono, 24/11/2026).
--
-- Valor: R$ 1.699,00 (169900 centavos), BRL, descrição "Servidor,
-- hospedagem, domínio e inteligência artificial".
--
-- PREMISSA REGISTRADA: intervalo MENSAL. Se o dono decidir anual ou outro,
-- é UPDATE nesta linha — nenhuma constante em TypeScript.
--
-- `stripe_price_id` é a ÚNICA referência ao Price quando a conta Stripe for
-- conectada. O STRIPE_PRICE_ID do .env deixa de ser fonte: quando esta coluna
-- está preenchida, valor e descrição vêm do Price no Stripe.

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null,
  valor_cents bigint not null check (valor_cents >= 0),
  moeda text not null default 'BRL',
  intervalo text not null default 'mensal',
  stripe_price_id text unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.billing_plans enable row level security;
drop policy if exists billing_plans_leitura on public.billing_plans;
create policy billing_plans_leitura on public.billing_plans
  for select using (ativo or public.fn_is_platform_admin());

insert into public.billing_plans (nome, descricao, valor_cents, moeda, intervalo)
select 'Nexus', 'Servidor, hospedagem, domínio e inteligência artificial', 169900, 'BRL', 'mensal'
where not exists (select 1 from public.billing_plans where nome = 'Nexus');
