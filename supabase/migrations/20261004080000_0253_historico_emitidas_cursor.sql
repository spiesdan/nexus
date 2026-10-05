-- 0253 - HISTORICO DAS NOTAS EMITIDAS (cursor da distribuicao DF-e)
--
-- Paridade com o Odivix (wpexportanotasemitidas / historico): importar da
-- SEFAZ o que ja foi emitido, com o certificado A1. A distribuicao DF-e e
-- paginada por NSU - sem cursor proprio por org, cada clique baixaria tudo de
-- novo e a SEFAZ bloquearia o CNPJ por consumo indevido (cStat 656).
--
-- `fiscal_emitidas_cursor` espelha `fiscal_entrada_cursor` (0236): ult_nsu =
-- de onde a proxima rodada comeca, max_nsu = quanto a SEFAZ diz que existe.
-- max_nsu fica na linha para a tela mostrar "NSU atual / maximo" sem chamar a
-- SEFAZ de novo.
--
-- RLS molde 0236: leitura org, escrita agent+ (operacional, mesmo piso da
-- inutilizacao).

create table if not exists public.fiscal_emitidas_cursor (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  ult_nsu bigint not null default 0,
  max_nsu bigint not null default 0,
  atualizado_em timestamptz not null default now()
);

alter table public.fiscal_emitidas_cursor enable row level security;

drop policy if exists fiscal_emitidas_cursor_select on public.fiscal_emitidas_cursor;
create policy fiscal_emitidas_cursor_select on public.fiscal_emitidas_cursor
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists fiscal_emitidas_cursor_write on public.fiscal_emitidas_cursor;
create policy fiscal_emitidas_cursor_write on public.fiscal_emitidas_cursor
  for all using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

revoke all on public.fiscal_emitidas_cursor from anon;
grant select, insert, update, delete on public.fiscal_emitidas_cursor to authenticated;
grant all on public.fiscal_emitidas_cursor to service_role;

comment on table public.fiscal_emitidas_cursor is
  'Cursor da distribuicao DF-e para as NOTAS EMITIDAS por esta org (ult_nsu/max_nsu). Paralelo ao fiscal_entrada_cursor: a importacao do historico continua de onde parou, sem rebaixar tudo e sem gastar o consumo indevido da SEFAZ.';
