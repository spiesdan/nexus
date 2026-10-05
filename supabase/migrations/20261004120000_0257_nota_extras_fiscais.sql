-- ============================================================================
-- 0257 - EXTRAS FISCAIS DA NOTA (transporte, cobranca, adicionais, entrega)
--
-- Paridade com o emissor antigo: alem do que ja vem do pedido e do item, a
-- NF-e carrega grupos que NAO existem no pedido - transportador e volumes,
-- forma de pagamento e duplicatas, informacoes complementares/fisco e local
-- de entrega. Sao dados da EMISSAO, nao do pedido: o pedido pode mudar depois
-- e a nota autorizada nao se reescreve. Por isso moram na propria nota.
--
-- `jsonb` sem CHECK de vocabulario, de proposito: o contrato destas chaves e
-- o schema Zod (`extrasFiscaisSchema`, lib/schemas/fiscal.ts), que ja valida
-- tamanhos, enumeracoes e obrigatoriedade condicional ANTES de gravar. Um
-- CHECK espelhado aqui duplicaria a regra em dois lugares e ficaria obsoleto
-- no primeiro campo novo; os invariantes so exigem par quando existe CHECK
-- (vocabulario-banco-x-typescript) ou quando a coluna jsonb e lida por chaves
-- com constraint (evidencia-jsonb-chaves) - nenhum dos dois se aplica.
--
-- NULL = nota emitida antes desta coluna (ou reemissao de pedido sem extras).
-- Nenhuma linha de dado e tocada. Coluna nova em tabela que ja existe: RLS e
-- grants sao por tabela, entao RLS intocada.
-- ============================================================================

alter table public.invoices
  add column if not exists extras_fiscais jsonb;

comment on column public.invoices.extras_fiscais is
  'Grupos da emissao que nao vem do pedido: transporte (modalidade de frete, transportador, volumes), cobranca (forma de pagamento, parcelas, vencimentos), adicionais (infCpl/infAdFisco) e local de entrega. NULL = sem extras. Contrato validado em lib/schemas/fiscal.ts (extrasFiscaisSchema).';
