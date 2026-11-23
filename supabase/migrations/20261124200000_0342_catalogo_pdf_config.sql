-- 0342 — CONFIGURAÇÃO DO CATÁLOGO EM PDF (SELEÇÃO, ORDEM E LOGO PRÓPRIO).
--
-- O PDF é gerado em memória a cada prévia/download; nada é persistido dele.
-- O que precisa sobreviver ao F5 é a CONFIGURAÇÃO daquele catálogo: quais
-- produtos entraram, a ordem revisitada das categorias e o caminho da LOGO DO
-- CATÁLOGO (distinta da logo permanente do tenant).
--
-- Uma config por organização. Todo filtro vem da sessão na rota; a RLS é a
-- segunda camada. O storage é o bucket público existente `product-images`,
-- com caminho não-enumerável e prefixo por organização.
create table if not exists public.product_catalog_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null default 'Catálogo',
  logo_path text,
  /** Só liga com dados empresariais reais e revisados na tela. */
  incluir_contracapa boolean not null default false,
  produto_ids uuid[] not null default '{}',
  ordem_categorias text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_catalog_exports_org_unico unique (organization_id)
);

create index if not exists product_catalog_exports_org_idx
  on public.product_catalog_exports (organization_id);

alter table public.product_catalog_exports enable row level security;

drop policy if exists product_catalog_exports_select on public.product_catalog_exports;
create policy product_catalog_exports_select on public.product_catalog_exports
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists product_catalog_exports_write on public.product_catalog_exports;
create policy product_catalog_exports_write on public.product_catalog_exports
  for all using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.product_catalog_exports from anon;
grant select, insert, update, delete on public.product_catalog_exports to authenticated;
grant all on public.product_catalog_exports to service_role;

drop trigger if exists trg_product_catalog_exports_updated_at on public.product_catalog_exports;
create trigger trg_product_catalog_exports_updated_at
  before update on public.product_catalog_exports
  for each row execute function public.fn_set_updated_at();

comment on table public.product_catalog_exports is
  'Configuração do catálogo PDF por organização: seleção de produtos, ordem revisada das categorias e logo próprio. O PDF não é persistido.';
