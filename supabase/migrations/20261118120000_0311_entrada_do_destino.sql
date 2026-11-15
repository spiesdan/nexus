-- ─────────────────────────────────────────────────────────────────────────────
-- 0311 — A ENTRADA DO ENDEREÇO (endereço sem número)
--
-- Medido na base de produção em 15/11/2026: 49 destinos, 31 com número, 12
-- `S/N` e 6 com o campo vazio — 37% da operação não tem número de casa. Sem
-- número, nenhum geocodificador devolve a porta: o Nominatim cai para a rua, o
-- bairro ou o centro da cidade, e o pino erra por centenas de metros ou por
-- quilômetros. A tela ainda oferecia "Tentar de novo", que não pode funcionar
-- por construção — não existe número para achar.
--
-- A saída é a única honesta: quem sabe onde é a entrada é quem já foi lá. A
-- marcação deixa de ser "pino manual" (um par lat/lng indistinguível de um
-- geocode bom) e vira ENTRADA, com autor, data, referência textual ("portão
-- azul") e confirmação de quem entregou.
--
-- endereco_entradas (nova) — a MEMÓRIA do endereço:
--   * `endereco_normalizado` é a chave: o mesmo endereço digitado de novo em
--     outra carga reaproveita a entrada, então marcar uma vez resolve para
--     sempre. Sem isto, o trabalho se repete toda semana no mesmo cliente.
--   * `confirmacoes` conta quantas entregas confirmaram "é aqui" — a marcação
--     do escritório é um chute bem informado; o motorista na porta é prova.
--
-- shipment_destinations ganha:
--   * `entrada_id`              — qual entrada foi usada neste destino
--   * `entrada_confirmada_em`   — quando o motorista confirmou na entrega
--   * `entrada_confirmada_por`  — quem confirmou
--
-- `geo_fonte = 'entrada'` passa a ser o valor gravado quando o pino vem de uma
-- entrada marcada (antes era `manual`, confundido com correção de geocode).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.endereco_entradas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  /** Chave estável do endereço (sem acento, sem pontuação, sem CEP). */
  endereco_normalizado text not null,
  /** O endereço como estava quando a entrada foi marcada — para o operador reconhecer. */
  endereco text,
  latitude double precision not null,
  longitude double precision not null,
  /** "portão azul", "entrada pelos fundos" — o que o mapa não conta. */
  referencia text,
  marcado_por uuid references auth.users (id) on delete set null,
  marcado_em timestamptz not null default now(),
  /** Quantas entregas confirmaram que o ponto é a entrada. */
  confirmacoes integer not null default 0,
  confirmado_em timestamptz,
  confirmado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint endereco_entradas_org_chave_unica unique (organization_id, endereco_normalizado),
  constraint endereco_entradas_latitude_valida check (latitude between -90 and 90),
  constraint endereco_entradas_longitude_valida check (longitude between -180 and 180),
  constraint endereco_entradas_confirmacoes_nao_negativas check (confirmacoes >= 0)
);

alter table public.endereco_entradas enable row level security;

drop policy if exists endereco_entradas_select on public.endereco_entradas;
create policy endereco_entradas_select on public.endereco_entradas
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists endereco_entradas_insert on public.endereco_entradas;
create policy endereco_entradas_insert on public.endereco_entradas
  for insert with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  );

drop policy if exists endereco_entradas_update on public.endereco_entradas;
create policy endereco_entradas_update on public.endereco_entradas
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

-- Memória de operação não se apaga por papel: perder a entrada de um endereço
-- é perder trabalho de campo que ninguém consegue reconstruir.
revoke all on public.endereco_entradas from anon;
grant select, insert, update on public.endereco_entradas to authenticated;
grant all on public.endereco_entradas to service_role;

comment on table public.endereco_entradas is
  'Entrada do endereço marcada por quem conhece o local (0311). Chave = endereço normalizado, para reaproveitar entre cargas. Existe porque 37% dos destinos não têm número e nenhum geocodificador devolve a porta.';

comment on column public.endereco_entradas.referencia is
  'O que o mapa não conta: "portão azul", "entrada pelos fundos". Lida pelo motorista antes de chegar.';

comment on column public.endereco_entradas.confirmacoes is
  'Quantas entregas confirmaram "é aqui". Marcação do escritório é estimativa; confirmação do motorista é prova.';

alter table public.shipment_destinations
  add column if not exists entrada_id uuid references public.endereco_entradas (id) on delete set null;

alter table public.shipment_destinations
  add column if not exists entrada_confirmada_em timestamptz;

alter table public.shipment_destinations
  add column if not exists entrada_confirmada_por uuid references auth.users (id) on delete set null;

create index if not exists shipment_destinations_entrada_idx
  on public.shipment_destinations (entrada_id)
  where entrada_id is not null;

comment on column public.shipment_destinations.entrada_id is
  'Entrada marcada de onde este pino veio (0311). NULL = pino geocodificado ou nunca marcado.';

comment on column public.shipment_destinations.entrada_confirmada_em is
  'Quando o motorista confirmou na porta que o ponto é a entrada. NULL = ainda não confirmado.';
