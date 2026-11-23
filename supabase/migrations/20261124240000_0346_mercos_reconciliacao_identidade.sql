-- 0346 — RECONCILIAÇÃO POR IDENTIDADE (correção do que a medição do dono mostrou).
--
-- Medido em 23/11/2026: numa amostra de 394 detalhes, o único "ausente por
-- número" era o pedido 19639 — vazio, 0 itens (não é perda). As perdas reais
-- são as 4 COLISÕES (19669..19672): o número existe no banco, mas com OUTRO
-- cliente. Comparar só número daria "zero ausentes" com 4 pedidos perdidos.
--
-- A reconciliação passa a decidir pela LISTA, cruzando número + identidade,
-- e precisa de quatro situações no artefato, não duas.

alter table public.mercos_reconciliacoes
  drop constraint if exists mercos_reconciliacoes_situacao_check;

alter table public.mercos_reconciliacoes
  add constraint mercos_reconciliacoes_situacao_check
  check (situacao in ('ausente','importado','colisao','ignorado_sem_itens'));

-- Identidade dos dois lados da colisão e a data em que o pedido perdido entrou.
alter table public.mercos_reconciliacoes
  add column if not exists cliente_documento text,
  add column if not exists cliente_local_nome text,
  add column if not exists resolvido_em timestamptz;
