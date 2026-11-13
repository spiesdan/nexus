-- ─────────────────────────────────────────────────────────────────────────────
-- 0308 — O DESTINO DA ENTREGA (prompt §2)
--
-- Até aqui, endereço e coordenada de uma entrega vinham do CADASTRO DO
-- CONTATO. A consequência medida: dois pedidos do mesmo cliente para endereços
-- diferentes (o caso "Mercado Central: Rua A, 100 e Rua B, 500") viravam duas
-- paradas na lista, mas compartilhavam o mesmo pino no mapa — corrigir um
-- movia o outro. E mexer no cadastro do cliente movia, em silêncio, o destino
-- de uma carga já planejada.
--
-- Esta migration cria a identidade do DESTINO, com snapshot:
--
--   * `shipment_destinations` é por (organização, chave). A chave é o endereço
--     efetivo do pedido no instante em que ele entra na carga — mudou o
--     endereço, muda a chave, nasce outro destino, e a entrega antiga continua
--     apontando para o destino antigo.
--   * `shipment_orders.destination_id` liga cada pedido da carga ao seu
--     destino. `shipment_orders` continua sendo a parada (não há entidade
--     paralela); o destino é quem carrega o endereço e a coordenada.
--   * A geocodificação e o pino manual passam a gravar AQUI, não em `contacts`.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.shipment_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- O cliente do destino. NULL = entrega avulsa (pedido sem contato): a chave
  -- cai no nome normalizado, como `agruparParadas` já fazia.
  contact_id uuid references public.contacts (id) on delete set null,

  -- Identidade estável: `<contact_id|avulso:nome>::<endereço>`. É o que
  -- impede dois endereços do mesmo cliente de colapsarem num pino só.
  chave text not null,

  -- ── Snapshot do endereço no momento da inclusão na carga ──────────────────
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,

  -- ── Resultado da geocodificação (muda com o tempo; o endereço não) ───────
  latitude double precision,
  longitude double precision,
  geo_status text not null default 'pendente',
  geo_fonte text,
  geo_precisao_m double precision,
  geo_em timestamptz,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Estados do prompt §3. `ok` cobre confirmado e aproximado (a precisão está em
-- `geo_fonte`/`geo_precisao_m`); os demais são falha declarada, nunca chute.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shipment_destinations_geo_status_valido'
  ) then
    alter table public.shipment_destinations
      add constraint shipment_destinations_geo_status_valido
      check (geo_status in ('pendente', 'ok', 'nao_encontrado', 'ambiguo', 'erro'));
  end if;
end $$;

create unique index if not exists shipment_destinations_chave_key
  on public.shipment_destinations (organization_id, chave);

create index if not exists shipment_destinations_org_geo_idx
  on public.shipment_destinations (organization_id, geo_status);

alter table public.shipment_orders
  add column if not exists destination_id uuid
  references public.shipment_destinations (id) on delete set null;

create index if not exists shipment_orders_destination_idx
  on public.shipment_orders (destination_id);

alter table public.shipment_destinations enable row level security;

drop policy if exists shipment_destinations_select on public.shipment_destinations;
create policy shipment_destinations_select on public.shipment_destinations
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists shipment_destinations_insert on public.shipment_destinations;
create policy shipment_destinations_insert on public.shipment_destinations
  for insert with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
    )
  );

-- O endereço é snapshot e não se reescreve; o update existe para a
-- geocodificação e o pino manual gravarem coordenada, fonte e estado.
drop policy if exists shipment_destinations_update on public.shipment_destinations;
create policy shipment_destinations_update on public.shipment_destinations
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

-- Sem delete por papel: destino de carga é histórico. A remoção da carga não
-- apaga o destino (ele pode servir a outra carga); a organização, sim, leva
-- tudo junto por cascade.
revoke all on public.shipment_destinations from anon;
grant select, insert, update on public.shipment_destinations to authenticated;
grant all on public.shipment_destinations to service_role;

comment on table public.shipment_destinations is
  'Destino de entrega com snapshot (prompt §2): endereço efetivo do pedido no momento em que entrou na carga. Mudança posterior no cadastro do cliente NÃO altera esta linha — cria outro destino. Coordenada e estado da geocodificação moram aqui, não em contacts.';

comment on column public.shipment_destinations.chave is
  'Identidade estável do destino: <contact_id|avulso:nome>::<endereço>. Mesma regra de agrupamento de paradas (lib/rotas/paradas.ts).';

comment on column public.shipment_destinations.geo_fonte is
  'nominatim:numero|nominatim:rua|nominatim:bairro|nominatim:cidade|manual. A tela usa para dizer quando o ponto é aproximado.';

comment on column public.shipment_orders.destination_id is
  'Destino (endereço + coordenada) deste pedido na carga. NULL em carga anterior à migration 0308; nesse caso a leitura cai no cadastro do contato, como antes.';

-- ─── Backfill das cargas abertas ────────────────────────────────────────────
--
-- Reproduz em SQL a prioridade de `_carga.ts`: endereço do pedido com rua,
-- senão o do cadastro. Carga já encerrada não é tocada: o histórico não se
-- reescreve. Nome de avulso normalizado igual a `nomeAvulsoNormalizado`
-- (sem acento, minúsculo, espaço simples) — a chave tem de bater com a que o
-- aplicativo calcula, senão a próxima leitura criaria um destino paralelo.
do $$
declare
  r record;
  v_endereco text;
  v_chave text;
  v_destino uuid;
  v_geo_status text;
begin
  for r in
    select so.id as shipment_order_id,
           so.organization_id,
           co.id as order_id,
           co.contact_id,
           co.cliente_nome,
           co.endereco_entrega,
           c.logradouro, c.numero_end, c.complemento, c.bairro, c.cidade, c.uf, c.cep,
           c.latitude, c.longitude, c.geo_status as contato_geo_status, c.geo_fonte
      from public.shipment_orders so
      join public.commercial_orders co
        on co.id = so.order_id and co.organization_id = so.organization_id
      left join public.contacts c
        on c.id = co.contact_id and c.organization_id = so.organization_id
      join public.shipments s
        on s.id = so.shipment_id and s.organization_id = so.organization_id
     where so.destination_id is null
       and s.finished_at is null
  loop
    -- Endereço efetivo: o do pedido vence; senão, a linha do cadastro. A
    -- checagem de "tem rua" (`linhaComRua`) continua na leitura do aplicativo;
    -- repeti-la aqui só faria o backfill escolher outro endereço — que é pior,
    -- porque o snapshot congelaria o endereço errado.
    v_endereco := nullif(btrim(coalesce(r.endereco_entrega, '')), '');
    if v_endereco is null then
      v_endereco := nullif(
        btrim(concat_ws(', ',
          nullif(btrim(coalesce(r.logradouro, '')), ''),
          nullif(btrim(coalesce(r.numero_end, '')), ''),
          nullif(btrim(coalesce(r.complemento, '')), ''),
          nullif(btrim(coalesce(r.bairro, '')), ''),
          nullif(btrim(concat_ws('/', nullif(btrim(coalesce(r.cidade, '')), ''), nullif(btrim(coalesce(r.uf, '')), ''))), '')
        )),
        ''
      );
    end if;

    v_chave := coalesce(
      r.contact_id::text,
      'avulso:' || btrim(regexp_replace(
        lower(translate(coalesce(r.cliente_nome, '?'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
        '\s+', ' ', 'g'
      ))
    );
    if v_endereco is not null then
      v_chave := v_chave || '::' || v_endereco;
      v_geo_status := case when r.latitude is not null then 'ok' else 'pendente' end;
    else
      v_geo_status := 'nao_encontrado';
    end if;

    insert into public.shipment_destinations (
      organization_id, contact_id, chave, endereco, numero, complemento, bairro,
      cidade, uf, cep, latitude, longitude, geo_status, geo_fonte, geo_em
    ) values (
      r.organization_id, r.contact_id, v_chave, v_endereco, r.numero_end, r.complemento,
      r.bairro, r.cidade, r.uf, r.cep, r.latitude, r.longitude, v_geo_status, r.geo_fonte,
      case when r.latitude is not null then now() else null end
    )
    on conflict (organization_id, chave) do nothing;

    select id into v_destino
      from public.shipment_destinations
     where organization_id = r.organization_id and chave = v_chave
     limit 1;

    if v_destino is not null then
      update public.shipment_orders
         set destination_id = v_destino
       where id = r.shipment_order_id;
    end if;
  end loop;
end $$;
