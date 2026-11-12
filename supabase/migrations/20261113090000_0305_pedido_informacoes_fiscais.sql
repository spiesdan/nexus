-- ============================================================================
-- 0305 — O CAMPO QUE A NF-E VAI LER COMO INFORMAÇÃO COMPLEMENTAR (infCPL)
--
-- A tela de detalhes do pedido ganhou o campo "Informações Fiscais" — e ele é
-- o texto que a emissão grava no infCpl da NF-e (o campo "Informações
-- Complementares" / dados adicionais da DANFE).
--
-- Medido nesta sessão (12/11/2026): o operador digitava a ordem de compra no
-- campo livre do pedido, mas o caminho de fonte da emissão era frágil — o
-- texto do pedido podia ser a observação interna, o Mercos ou o texto da
-- venda. O campo dedicado `informacoes_fiscais` nasce com isso: a fonte
-- oficial da informação fiscal que a nota complementa.
--
-- Precedência na emissão (`lib/fiscal/emitir-nota.ts`): o novo campo vence;
-- o `observacoes` legado continua como fallback (pedidos antigos não foram
-- migrados — a leitura continua funcionando sem re-escrita em massa).
-- ============================================================================

-- O texto que a emissão leva como informacoes_complementares (infCpl) da
-- NF-e — ex.: "Ordem de compra 22550". Até 2000 chars, mesmo limite do campo
-- livre que substituiu (o zod da emissão aplica `INF_CPL_MAX`).
alter table public.commercial_orders add column if not exists informacoes_fiscais text;

comment on column public.commercial_orders.informacoes_fiscais is
  'Informações Fiscais do pedido: o texto que a emissão grava como informacoes_complementares (infCpl) da NF-e — ex.: ordem de compra. O campo editável que alimentava o mesmo infCpl era `observacoes`; a emissão passa a ler primeiro este campo e cair no legado quando vazio.';
