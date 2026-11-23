-- 0347 — COBERTURA DA RECONCILIAÇÃO como resultado consultável.
--
-- A reconciliação que não olhou todos os números NÃO pode dizer "zero
-- ausentes". O censo do coletor declara quantos pedidos a lista tinha; a
-- rodada grava quantos foram lidos, quantas linhas eram ilegíveis e por que
-- uma rodada é `incompleta`. A tela lê a ÚLTIMA rodada pelo mesmo endpoint
-- das colisões.

create table if not exists public.mercos_reconciliacoes_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id text not null,
  censo_esperado integer,
  censo_lido integer not null default 0,
  linhas_ilegiveis integer not null default 0,
  registros_sem_data integer not null default 0,
  ausentes integer not null default 0,
  colisoes integer not null default 0,
  ignorados_sem_item integer not null default 0,
  importados integer not null default 0,
  status text not null default 'incompleta'
    check (status in ('completa','incompleta')),
  motivos text[] not null default '{}',
  verificado boolean not null default false,
  declaracao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organization_id, run_id)
);

alter table public.mercos_reconciliacoes_runs enable row level security;
drop policy if exists tenant_isolation_reconc_runs_all on public.mercos_reconciliacoes_runs;
create policy tenant_isolation_reconc_runs_all on public.mercos_reconciliacoes_runs
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

create index if not exists mercos_reconc_runs_org_atualizada_idx
  on public.mercos_reconciliacoes_runs (organization_id, atualizado_em desc);
