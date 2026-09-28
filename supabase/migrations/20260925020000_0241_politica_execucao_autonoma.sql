-- ============================================================================
-- 0241 — POLÍTICA DE EXECUÇÃO AUTÔNOMA (NEXUS FASE 10, §35)
--
-- Aprovar sem executar deixava o vendedor autônomo no papel: faltava dizer
-- ONDE a execução pode acontecer e COM qual fluxo. Esta tabela é a política
-- explícita por org (uma linha por org):
--   nivel_maximo            — teto de autonomia (0–6, default 1: recomenda);
--   executar_followup       — permite matricular follow-up de decisão aprovada;
--   default_flow_pointer_id — o fluxo publicado usado na matrícula (sem ele,
--                             não há o que executar — nunca inventado).
-- Sem linha, valem os defaults seguros (nada executa). RLS molde 0221
-- (leitura membro, escrita manager+). Apêndice no fim do baseline.
-- ============================================================================

create table if not exists public.ai_execution_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  nivel_maximo integer not null default 1 check (nivel_maximo >= 0 and nivel_maximo <= 6),
  executar_followup boolean not null default false,
  default_flow_pointer_id uuid references public.followup_flow_pointers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_execution_policies enable row level security;

drop policy if exists ai_execution_policies_select on public.ai_execution_policies;
create policy ai_execution_policies_select on public.ai_execution_policies
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists ai_execution_policies_write on public.ai_execution_policies;
create policy ai_execution_policies_write on public.ai_execution_policies
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.ai_execution_policies from anon;
grant select, insert, update, delete on public.ai_execution_policies to authenticated;
grant all on public.ai_execution_policies to service_role;

drop trigger if exists trg_ai_execution_policies_updated_at on public.ai_execution_policies;
create trigger trg_ai_execution_policies_updated_at
  before update on public.ai_execution_policies
  for each row execute function public.fn_set_updated_at();

comment on table public.ai_execution_policies is
  'Política de execução autônoma da org (NEXUS §35): teto de nível, follow-up executável e fluxo padrão. Sem linha, nada executa.';
