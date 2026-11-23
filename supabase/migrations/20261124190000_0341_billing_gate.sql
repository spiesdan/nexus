-- 0341 — GATE DE SUSPENSÃO POR COBRANÇA (somente leitura).
--
-- O flag `organizations.suspended_reason = 'billing'` é escrito pelo job de
-- cobrança (que SÓ suspende tenant com fatura vencida e sem pagamento). Aqui a
-- função apenas responde se a org ativa está nesse estado — sem desligar app,
-- sem apagar dado e sem afetar outra organização. O kill-switch vive em TS
-- (BILLING_GATE_ENABLED), não no banco, para poder ser desligado sem migration.

create or replace function public.fn_billing_gate_bloqueia(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organizations o
     where o.id = p_org
       and o.status = 'suspended'
       and o.suspended_reason = 'billing'
  );
$$;

revoke execute on function public.fn_billing_gate_bloqueia(uuid) from public, anon;
grant execute on function public.fn_billing_gate_bloqueia(uuid) to authenticated, service_role;
