-- 0254 - TABELA IBPT POR ORGANIZACAO (imposto aproximado)
--
-- Paridade com o Odivix (wpconsultaimpostoibpt): a consulta de imposto
-- aproximado da tela de notas. O usuario importa o CSV OFICIAL do IBPT
-- (http://200.161.144.113/ibpt/TabelaIBPTax<UF>.csv) - decidido com o usuario
-- em 2026-10-04: sem API com token, CSV por exercicio.
--
-- Formato CONFIRMADO do arquivo (cabecalho real):
--   codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;estadual;
--   municipal;vigenciainicio;vigenciafim;chave;versao;fonte
-- Separador `;`, descricao entre aspas, datas dd/mm/aaaa, percentuais com
-- ponto decimal (`13.45`). O arquivo e POR UF - a linha do CSV nao tem UF,
-- entao a uf e da importacao (config fiscal da org), nao do arquivo.
--
-- `tipo` (produto|servico) tambem vem da importacao: o NCM (produtos) e o
-- NBS/LC116 (servicos) vem em arquivos diferentes, e a rota de consulta
-- pergunta qual dos dois.
--
-- `vigencia_inicio` entra na unique de proposito: o IBPT republica a tabela
-- por exercicio (o CSV atual vigia 20/09/2026 a 31/10/2026), e reimportar a
-- tabela nova tem de COEXISTIR com a antiga - a consulta escolhe a vigencia
-- que cobre hoje, e o upsert de uma reimportacao do mesmo exercicio atualiza
-- as linhas em vez de duplicar.
--
-- RLS: leitura e escrita separadas de proposito - a consulta e de TODO o
-- time que ve notas (viewer), a importacao e de manager+ (mesmo piso da
-- configuracao fiscal).

create table if not exists public.fiscal_ibpt (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tipo text not null default 'produto' check (tipo in ('produto', 'servico')),
  codigo text not null check (codigo ~ '^\d{1,16}$'),
  ex text not null default '',
  uf text not null check (char_length(uf) = 2),
  descricao text,
  nacional_federal numeric(6,3) not null default 0 check (nacional_federal between 0 and 100),
  importados_federal numeric(6,3) not null default 0 check (importados_federal between 0 and 100),
  estadual numeric(6,3) not null default 0 check (estadual between 0 and 100),
  municipal numeric(6,3) not null default 0 check (municipal between 0 and 100),
  vigencia_inicio date not null,
  vigencia_fim date,
  chave text,
  versao text,
  fonte text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_ibpt_linha_unica unique (organization_id, tipo, codigo, ex, uf, vigencia_inicio)
);

create index if not exists fiscal_ibpt_consulta_idx
  on public.fiscal_ibpt (organization_id, tipo, codigo, uf);

alter table public.fiscal_ibpt enable row level security;

drop policy if exists fiscal_ibpt_select on public.fiscal_ibpt;
create policy fiscal_ibpt_select on public.fiscal_ibpt
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists fiscal_ibpt_write on public.fiscal_ibpt;
create policy fiscal_ibpt_write on public.fiscal_ibpt
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

revoke all on public.fiscal_ibpt from anon;
grant select, insert, update, delete on public.fiscal_ibpt to authenticated;
grant all on public.fiscal_ibpt to service_role;

comment on table public.fiscal_ibpt is
  'Tabela IBPT importada do CSV oficial por esta org (imposto aproximado, paridade Odivix). Linha = (tipo, codigo NCM/NBS, ex, uf) vigente; a consulta pega a vigencia que cobre hoje. Escrita manager+ (importacao), leitura viewer (a mesma que ve notas).';
