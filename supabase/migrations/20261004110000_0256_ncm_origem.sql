-- ============================================================================
-- 0256 - NCM_ORIGEM NO PRODUTO (quem escolheu o NCM: sugestao ou pessoa)
--
-- A busca automatica de NCM pelo nome (rota nova `products/ncm-sugestao`,
-- alimentada pela tabela IBPT da org da 0254) preenche o campo sozinha. Sem
-- marca de origem o fiscal nao tem como saber DEPOIS quais codigos a maquina
-- escolheu: o campo fica identico ao digitado a mao, e a revisao de nota nao
-- tem por onde comecar.
--
-- `NULL` = linha anterior a esta coluna (produto cadastrado antes da busca
-- existir) ou sem NCM. A coluna NAO muda dado nenhum: preencher continua
-- sendo ato da pessoa (a sugestao so escreve no formulario, e so grava quando
-- salva) - a regra da 0216 ("a emissao lista os produtos sem NCM em vez de
-- presumir") continua valendo: esta coluna REGISTRA a escolha, nao faz ela.
--
-- CHECK com vocabulario espelhado em TS (`OrigemDoNcm`, lib/schemas/produtos.ts)
-- e par novo em tests/invariants/vocabulario-banco-x-typescript.test.ts.
-- ============================================================================

alter table public.catalog_products
  drop constraint if exists catalog_products_ncm_origem_check;

alter table public.catalog_products
  add column if not exists ncm_origem text;

alter table public.catalog_products
  add constraint catalog_products_ncm_origem_check
  check (ncm_origem is null or ncm_origem in ('sugerido', 'manual'));

comment on column public.catalog_products.ncm_origem is
  'Quem escolheu o NCM: ''sugerido'' = busca automatica pela tabela IBPT da org, ''manual'' = digitado por pessoa. NULL = legado (anterior a esta coluna) ou sem NCM.';
