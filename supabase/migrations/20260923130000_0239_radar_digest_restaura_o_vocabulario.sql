-- ============================================================================
-- 0239 — A 0237 encolheu o vocabulário; este forward-fix o restaura inteiro.
--
-- A 0237 acrescentou `radar_digest` reconstruindo a constraint a partir de uma
-- lista velha de 10 valores, e derrubou 13 kinds canônicos do baseline
-- (budget_warning, capabilities_missing, channel_number_alert,
-- channel_template_review, conhecimento_nao_indexado,
-- contact_proposal_expired, followup_dead, message_send_stuck,
-- midia_nao_lida, next_action_ambiguous, promise_unfulfilled,
-- reactivation_expired, risk_backlog_seeded) — medido pelo gate
-- `tests/unit/migrations-nao-encolhem-vocabulario.test.ts`.
--
-- Num banco onde a 0237 foi aplicada por cima (quem usa `supabase db push`,
-- isto é, a cadeia de migrations), os INSERTs desses kinds passam a violar a
-- constraint e o operador NUNCA VÊ o aviso — o mesmo desfecho muda da 0129,
-- só que numa outra porta: o sintoma some em silêncio.
--
-- O baseline.sql também não sabia de `radar_digest`: a 0237 só mexeu na
-- migration. O bloco ÚNICO do baseline ganhou a linha junto (regra do bloco
-- único da issue #159), então os dois caminhos terminam na MESMA lista.
--
-- A lista abaixo é a do baseline, verbatim. Quem acrescentar um `kind` novo
-- daqui em diante mexe nos DOIS lugares: o bloco único do baseline e a última
-- migration que reconstrói a constraint — e é o gate
-- `tests/unit/kind-check-migration-x-baseline.test.ts` que reprova quando as
-- duas listas divergem.
-- ============================================================================

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'qr_rescan', 'job_dead', 'event_dead', 'budget_exceeded', 'handoff',
    'promotion_review', 'judge_unaligned', 'followup_dead', 'snooze_expired',
    'next_action_ambiguous', 'risk_backlog_seeded', 'reactivation_expired',
    'capabilities_missing', 'message_send_stuck', 'midia_nao_lida',
    'channel_template_review', 'channel_number_alert', 'promise_unfulfilled',
    'contact_proposal_expired', 'budget_warning', 'conhecimento_nao_indexado',
    'radar_digest', 'other'
  ));