-- 0270 — FOCO DE PRODUTO no checkpoint do turno (intenção de compra estruturada).
--
-- O caso da vassoura: turno 1 lista "vassoura de pelo, vassoura de nylon,
-- vassourão"; turno 2 ("qual vocês têm?") respondeu SÓ o cabo avulso. O resumo
-- textual existia, mas a intenção de compra não tinha campo próprio — e
-- pergunta de continuação sem termo de produto rebuscava do zero.
--
-- `foco_produto` guarda o que o turno fechou como assunto de produto:
-- {termo, categoria}. NULL = o turno não tratou de produto (ou o modelo não
-- declarou) — e a abertura só injeta o bloco quando há valor, então turnos sem
-- produto não pagam token por ausência. Sem CHECK de shape: a validação é o
-- Zod de lib/agent-engine/agent/inbound-turn.ts, como `declaracao` (0110).
alter table lead_checkpoints
  add column if not exists foco_produto jsonb;

comment on column lead_checkpoints.foco_produto is
  'Intenção de produto fechada no turno: {termo, categoria}. NULL = sem assunto '
  'de produto. Lido na abertura para preservar intenção em pergunta de continuação.';
