-- 0345 — RECONCILIAÇÃO MERCOS × NEXUS, com artefato consultável.
--
-- A contagem `orders_skipped` não prova nada: mistura re-leitura com pedido
-- perdido. Aqui cada número visto no Mercos vira UMA LINHA com situação
-- `ausente` ou `importado`, por `run_id`. Rodar de novo com o MESMO run_id
-- tem de devolver ZERO ausentes — é essa a prova que o dono exige.

create table if not exists public.mercos_reconciliacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id text not null,
  numero_mercos integer not null,
  cliente_nome text,
  valor_cents bigint not null default 0,
  data_pedido timestamptz,
  situacao text not null default 'ausente' check (situacao in ('ausente','importado')),
  pedido_id uuid references public.commercial_orders(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (run_id, numero_mercos)
);

alter table public.mercos_reconciliacoes enable row level security;
drop policy if exists tenant_isolation_mercos_reconciliacoes_all on public.mercos_reconciliacoes;
create policy tenant_isolation_mercos_reconciliacoes_all on public.mercos_reconciliacoes
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

create index if not exists mercos_reconciliacoes_run_situacao_idx
  on public.mercos_reconciliacoes (organization_id, run_id, situacao);
