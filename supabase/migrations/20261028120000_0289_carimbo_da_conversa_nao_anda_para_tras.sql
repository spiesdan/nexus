-- ============================================================================
-- 0289 — O carimbo da conversa não anda para TRÁS.
--
-- `fn_mark_conversation_message` escrevia `last_message_at = p_at` sem
-- comparar. Enquanto toda mensagem chegava na ordem, o valor só subia. Em
-- reentrega atrasada — a fila do WhatsApp devolvendo o que ficou preso numa
-- reconexão, um retry do WAHA, um backfill de histórico — a mensagem é ANTIGA,
-- e o carimbo levava a conversa para o passado. Como a lista do inbox ordena
-- por `last_message_at`, o resultado na tela é "as conversas não estão em
-- ordem de tempo": uma conversa que estava no topo some para o meio, com a
-- prévia trocada por um texto velho.
--
-- A regra correta é monótona:
--   · `last_message_at`, `last_inbound_at` e `last_outbound_at` só avançam
--     (`greatest`; em Postgres GREATEST ignora NULL, então o primeiro carimbo
--     continua funcionando numa conversa nova);
--   · a prévia só é substituída se a mensagem for a mais nova — uma mensagem
--     antiga não pode reescrever o resumo do que acabou de ser dito.
--
-- Os CONTADORES não mudam: mensagem de entrada ainda soma não-lida e de saída
-- ainda zera, porque isso descreve o que chegou, não quando chegou.
-- ============================================================================

create or replace function public.fn_mark_conversation_message(
  p_conv uuid, p_direction text, p_preview text, p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    -- CASE avaliado sobre a linha ANTIGA (é assim que o UPDATE do Postgres
    -- funciona): as três colunas de tempo enxergam o valor anterior mesmo
    -- estando no mesmo SET.
    last_message_preview = case
      when last_message_at is null or p_at >= last_message_at then p_preview
      else last_message_preview
    end,
    last_message_at  = greatest(last_message_at,  p_at),
    last_inbound_at  = case
      when p_direction = 'inbound'  then greatest(last_inbound_at,  p_at)
      else last_inbound_at
    end,
    last_outbound_at = case
      when p_direction = 'outbound' then greatest(last_outbound_at, p_at)
      else last_outbound_at
    end,
    unread_count_for_assignee = case
      when p_direction = 'inbound'  then unread_count_for_assignee + 1
      when p_direction = 'outbound' then 0
      else unread_count_for_assignee
    end,
    updated_at = now()
  where id = p_conv;

  update public.contacts c
     set last_activity_at = greatest(coalesce(c.last_activity_at, '-infinity'::timestamptz), p_at)
    from public.conversations v
   where v.id = p_conv
     and c.id = v.contact_id;
end; $$;

comment on function public.fn_mark_conversation_message is
  'Atualiza agregados da conversa (inbound incrementa unread; outbound zera), carimba contacts.last_activity_at e NUNCA deixa last_message_at/last_inbound_at/last_outbound_at andarem para trás — reentrega atrasada não reordena a lista.';

notify pgrst, 'reload schema';
