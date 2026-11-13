-- ─────────────────────────────────────────────────────────────────────────────
-- 0309 — Address Recovery Engine (prompt §9)
--
-- Recuperação inteligente de endereços para o roteirizador. O endereço
-- originalmente informado pelo vendedor NUNCA é sobrescrito em silêncio:
-- cada correção gera outro destino e fica historizado.
--
-- shipment_destinations (0308) ganha:
--   * endereco_original    — o que o vendedor digitou (imutável)
--   * endereco_normalizado — normalização aplicada (sem perda do original)
--   * endereco_recuperado  — o que saiu da recuperação (nulo até ser recuperado)
--   * recuperacao_status   — nao_tentada|encontrado|recuperado|ambiguo|nao_encontrado|erro
--   * confianca            — pontuação 0–1 (numeric(4,3))
--   * metodo               — original|normalizado|digitos|componentes|photon|manual
--   * provedor             — nominatim|photon|manual
--   * recuperado_em        — quando a recuperação foi concluída/confirmada
--
-- shipment_destination_recoveries (nova): histórico append-only de cada
-- tentativa, para auditoria e reversão. Nada é apagado.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.shipment_destinations
  add column if not exists endereco_original text;

alter table public.shipment_destinations
  add column if not exists endereco_normalizado text;

alter table public.shipment_destinations
  add column if not exists endereco_recuperado text;

alter table public.shipment_destinations
  add column if not exists recuperacao_status text not null default 'nao_tentada';

alter table public.shipment_destinations
  add column if not exists confianca numeric(4,3);

alter table public.shipment_destinations
  add column if not exists metodo text;

alter table public.shipment_destinations
  add column if not exists provedor text;

alter table public.shipment_destinations
  add column if not exists recuperado_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shipment_destinations_recuperacao_status_valido'
  ) then
    alter table public.shipment_destinations
      add constraint shipment_destinations_recuperacao_status_valido
      check (recuperacao_status in (
        'nao_tentada', 'encontrado', 'recuperado', 'ambiguo', 'nao_encontrado', 'erro'
      ));
  end if;
end $$;

create index if not exists shipment_destinations_recuperacao_idx
  on public.shipment_destinations (organization_id, recuperacao_status);

create table if not exists public.shipment_destination_recoveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  destination_id uuid not null references public.shipment_destinations (id) on delete cascade,
  tentativa integer not null,           -- 1 original / 2 normalizada / 3 digitos / 4 componentes / 5 photon
  provedor text not null,               -- nominatim | photon | manual
  consulta text,                        -- o que foi enviado ao provedor (sem dado pessoal sensível)
  candidato jsonb,                      -- endereço, lat, lng, precisão, fonte bruta
  confianca numeric(4,3),
  motivo text,                          -- por que foi aceito, rejeitado ou deixado ambíguo
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null
);

create index if not exists shipment_destination_recoveries_dest_idx
  on public.shipment_destination_recoveries (destination_id, tentativa);

alter table public.shipment_destination_recoveries enable row level security;

drop policy if exists shipment_destination_recoveries_select on public.shipment_destination_recoveries;
create policy shipment_destination_recoveries_select on public.shipment_destination_recoveries
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists shipment_destination_recoveries_insert on public.shipment_destination_recoveries;
create policy shipment_destination_recoveries_insert on public.shipment_destination_recoveries
  for insert with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  );

-- Histórico nunca se apaga: não há delete por papel.
revoke all on public.shipment_destination_recoveries from anon;
grant select, insert on public.shipment_destination_recoveries to authenticated;
grant all on public.shipment_destination_recoveries to service_role;

-- Atualizar shipment_destinations também exige agent+ (geocodificação, pino manual,
-- confirmação/rejeição/reversão de recuperação).
drop policy if exists shipment_destinations_update_0309 on public.shipment_destinations;
create policy shipment_destinations_update_0309 on public.shipment_destinations
  for update using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  );

grant select, insert, update on public.shipment_destinations to authenticated;
grant all on public.shipment_destinations to service_role;

comment on table public.shipment_destinations is
  'Destino de entrega com snapshot (0308) e recuperação (0309). endereco_original é imutável; endereco_recuperado é o que saiu do Address Recovery Engine.';

comment on column public.shipment_destinations.endereco_original is
  'Endereço informado pelo vendedor no pedido. Nunca é sobrescrito em silêncio.';

comment on column public.shipment_destinations.recuperacao_status is
  'nao_tentada|encontrado|recuperado|ambiguo|nao_encontrado|erro. Apenas o motor de recuperação e o operador mudam este estado.';

comment on column public.shipment_destinations.confianca is
  'Pontuação 0–1 da última recuperação bem-sucedida. Vetos duros (UF/CEP/município divergente) vencem qualquer pontuação.';

comment on table public.shipment_destination_recoveries is
  'Histórico append-only do Address Recovery Engine. Uma linha por tentativa; nunca se apaga. Base da auditoria e da reversão.';

-- ─── Backfill: destinos já existentes ────────────────────────────────────────
--
-- `endereco_original` recebe o endereço que já estava no snapshot (não há
-- outro registro dele; a partir daqui ele é imutável).
--
-- `recuperacao_status` NÃO vira 'nao_tentada' para quem já tem pino: uma carga
-- em andamento com endereços geocodificados não pode passar a bloquear a
-- otimização só porque a coluna nasceu. `encontrado` significa "já resolvido"
-- — o motor não reconsulta e o gate libera. Só quem está sem coordenada (ou
-- sem geo_status ok) fica pendente de recuperação.
update public.shipment_destinations
   set endereco_original = coalesce(endereco_original, endereco)
 where endereco_original is null;

update public.shipment_destinations
   set recuperacao_status = case
     when latitude is not null and longitude is not null and geo_status = 'ok' then 'encontrado'
     when geo_status = 'nao_encontrado' then 'nao_encontrado'
     when geo_status = 'erro' then 'erro'
     else 'nao_tentada'
   end
 where recuperacao_status = 'nao_tentada'
   and (latitude is not null and longitude is not null and geo_status = 'ok');
