-- 0259 - RBAC de `crm_lead_risk_decisions`: escrita só para manager+
--
-- A 0258 criou a tabela com a policy `for all` de tenantisolation — só
-- tenancy, sem `fn_role_at_least`. O gate "0150 — a dívida de RBAC não cresce"
-- (`tests/invariants/rbac-config-ia-canais.test.ts`) reprova tabela NOVA que
-- entra assim: a dívida known-good é de antes, entrada nova não é.
--
-- E não é dívida reescrita à toa: quem escreve esta tabela é o motor de decisão
-- com `service_role` (que bypassa RLS), mas o MESMO endpoint que o radar lê é
-- alcançável pelo PostgREST com o JWT do usuário. Um `agent` da organização
-- escrevendo `acao = 'encerrar'` no próprio lead — sem passar por tela, sem
-- audit — é exatamente o furo que a 0181 fechou no acervo.
--
-- Mesma forma da 0254 (`fiscal_ibpt`): leitura por tenancy (quem vê o lead vê a
-- decisão), escrita exigindo manager+ ou platform admin.

drop policy if exists tenant_isolation_crm_lead_risk_decisions_all on public.crm_lead_risk_decisions;
drop policy if exists crm_lead_risk_decisions_select on public.crm_lead_risk_decisions;

create policy crm_lead_risk_decisions_select
  on public.crm_lead_risk_decisions
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists crm_lead_risk_decisions_write on public.crm_lead_risk_decisions;
create policy crm_lead_risk_decisions_write
  on public.crm_lead_risk_decisions
  for all using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );