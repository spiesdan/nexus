-- =============================================================================
-- INVENTÁRIO DE SCHEMA — uma linha por objeto, comparável entre dois bancos.
-- =============================================================================
-- Saída: TSV `tipo<TAB>objeto`, ordenado. Sem cabeçalho, sem contagem — a
-- contagem é derivada de fora (cut | sort | uniq -c), para que somar e diffar
-- usem a MESMA fonte.
--
-- Usado por scripts/auditoria/replay-migrations.sh para responder à pergunta
-- "o caminho de migrations produz o mesmo schema que o baseline.sql?" sem
-- depender de prosa: dois bancos, o mesmo SELECT, `diff`.
--
-- O que entra: tabelas, partições, views, matviews, sequências, funções (com
-- assinatura), triggers, tipos (enum/domínio/composto), extensões, políticas de
-- RLS e o estado de RLS por tabela.
--
-- O que NÃO entra, de propósito:
--   * objetos de sistema (pg_catalog, information_schema, pg_toast);
--   * objetos PERTENCENTES a uma extensão (deptype='e'): `vector`, `pgcrypto`,
--     `pg_trgm` etc. criam centenas de funções/tipos cujo nome não é nosso. Se a
--     extensão faltar, isso já aparece na linha `extensao` — e o diff fica
--     legível em vez de afogado em ruído de catálogo.
--   * colunas, índices e constraints: o diff de tabela/função/política já diz
--     QUAL objeto divergiu; descer a coluna é o passo seguinte, na mão, sobre o
--     objeto nomeado. Comparar 180 tabelas coluna a coluna produz um diff que
--     ninguém lê e que falha por ordem de coluna.
-- =============================================================================

with ns as (
  select n.oid, n.nspname
  from pg_namespace n
  where n.nspname not like 'pg\_%'
    and n.nspname <> 'information_schema'
),
da_extensao as (
  select classid, objid from pg_depend where deptype = 'e'
)
select tipo, objeto
from (
  select 'tabela'::text as tipo,
         n.nspname || '.' || c.relname as objeto
  from pg_class c
  join ns n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and not exists (
      select 1 from da_extensao d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid
    )

  union all
  select 'view', n.nspname || '.' || c.relname
  from pg_class c
  join ns n on n.oid = c.relnamespace
  where c.relkind in ('v', 'm')
    and not exists (
      select 1 from da_extensao d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid
    )

  union all
  select 'sequencia', n.nspname || '.' || c.relname
  from pg_class c
  join ns n on n.oid = c.relnamespace
  where c.relkind = 'S'
    and not exists (
      select 1 from da_extensao d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid
    )

  union all
  select 'funcao',
         n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p
  join ns n on n.oid = p.pronamespace
  where not exists (
      select 1 from da_extensao d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid
    )

  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join ns n on n.oid = c.relnamespace
  where not t.tgisinternal

  union all
  select 'tipo', n.nspname || '.' || ty.typname
  from pg_type ty
  join ns n on n.oid = ty.typnamespace
  where ty.typtype in ('e', 'd', 'c')
    and ty.typname not like '\_%'
    and not exists (
      select 1 from da_extensao d
      where d.classid = 'pg_type'::regclass and d.objid = ty.oid
    )

  union all
  select 'extensao', e.extname from pg_extension e

  union all
  select 'politica', p.schemaname || '.' || p.tablename || '.' || p.policyname
  from pg_policies p

  union all
  select 'rls_ligado', n.nspname || '.' || c.relname
  from pg_class c
  join ns n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and c.relrowsecurity
) s
order by 1, 2;
