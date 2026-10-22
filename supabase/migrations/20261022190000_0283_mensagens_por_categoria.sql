-- 0283 — mensagens de campanha por categoria
--
-- O operador reescrevia as três mensagens em toda campanha, mesmo quando o
-- recorte era o mesmo de sempre ("oficina mecânica", "restaurante"). Pior: o
-- texto bom de uma campanha antiga ficava preso nela — não havia onde ver,
-- reaproveitar ou corrigir "o que a gente manda para oficina".
--
-- Agora o estilo de mensagens pertence à CATEGORIA, na organização: configura
-- uma vez, a campanha nasce com ele, e o texto continua salvo na campanha
-- (`prospecting_campaigns.mensagens`) para que editar a campanha não altere o
-- padrão nem o histórico do que já foi enviado.
--
-- `categoria` é a chave canônica da biblioteca (`categorias[].busca`), não o
-- rótulo traduzido: rótulo muda com o idioma, chave não.
create table if not exists public.prospecting_message_presets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  categoria text not null,
  -- Até três variações; o produto roda em rotação. Vazio = categoria sem
  -- padrão, e a campanha volta a pedir o texto à mão (falha visível).
  mensagens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospecting_message_presets_categoria_unica
    unique (organization_id, categoria)
);

create index if not exists prospecting_message_presets_org_idx
  on public.prospecting_message_presets (organization_id);

drop trigger if exists prospecting_message_presets_updated_at
  on public.prospecting_message_presets;
create trigger prospecting_message_presets_updated_at
  before update on public.prospecting_message_presets
  for each row execute function public.fn_set_updated_at();

alter table public.prospecting_message_presets enable row level security;

drop policy if exists prospecting_message_presets_select on public.prospecting_message_presets;
create policy prospecting_message_presets_select on public.prospecting_message_presets
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- Escrever o padrão é ato de gestão: muda o que TODA campanha nova daquela
-- categoria vai dizer. Atendente usa (lê), gerente edita.
drop policy if exists prospecting_message_presets_write on public.prospecting_message_presets;
create policy prospecting_message_presets_write on public.prospecting_message_presets
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

grant select, insert, update, delete on public.prospecting_message_presets to authenticated;
grant all on public.prospecting_message_presets to service_role;
