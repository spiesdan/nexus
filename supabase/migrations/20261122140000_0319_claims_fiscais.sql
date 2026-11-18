-- 0319 — CLAIMS DE OPERAÇÃO FISCAL: manifestar e cancelar não transmitem duas vezes.
--
-- Medido em 18/11/2026:
--   * `POST /fiscal-entradas/[id]/manifestar` chamava a SEFAZ antes de qualquer
--     trava. Dois cliques simultâneos transmitiam o mesmo evento 210210 duas
--     vezes (a SEFAZ costuma recusar o segundo como duplicidade; o app grava a
--     recusa como erro e a timeline fica suja).
--   * `POST /invoices/[id]/cancel` de nota AUTORIZADA também transmitia antes
--     de travar. Dois cancelamentos concorrentes podiam gerar dois eventos
--     110111.
--
-- As duas operações precisam de um claim que dure SÓ a transmissão: o job
-- fiscal já tem claim (`fiscal_jobs`), mas manifestação e cancelamento não são
-- jobs. Duas colunas `timestamptz` resolvem sem tabela nova:
--
--   UPDATE ... SET claim = now()
--    WHERE id = ? AND (claim IS NULL OR claim < now() - interval '5 min')
--
-- O UPDATE condicional é atômico: a segunda transação espera a primeira e
-- reavalia o WHERE (0 linhas). O TTL de 5 min é recuperação de processo morto:
-- passado o teto, a operação pode ser reivindicada de novo. Nenhum status é
-- alterado pelo claim — a linha continua `autorizada`/`nova` enquanto transmite.
--
-- Nenhuma policy/grant muda: quem já escreve a linha (agent+ para entrada,
-- agent+ para nota) continua escrevendo; as colunas são internas.

alter table public.fiscal_entradas
  add column if not exists manifestacao_em_andamento_em timestamptz;

alter table public.invoices
  add column if not exists cancelamento_em_andamento_em timestamptz;

comment on column public.fiscal_entradas.manifestacao_em_andamento_em is
  'Claim da transmissão de manifestação (0318). NULL = livre; preenchido = transmissão em curso. Passado 5 min, pode ser reivindicado de novo (processo morto).';
comment on column public.invoices.cancelamento_em_andamento_em is
  'Claim da transmissão de cancelamento (0318). NULL = livre; preenchido = transmissão em curso. Passado 5 min, pode ser reivindicado de novo (processo morto).';
