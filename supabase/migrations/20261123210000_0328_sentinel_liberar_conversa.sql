-- ============================================================================
-- 0328 — NÍVEL 2, SEGUNDO CASO: liberar claim de conversa parada.
--
-- O webhook em dead-letter foi DESCARTADO como caso corrigível: a tabela
-- `webhook_events_log` é arquivo/forense, não fila de trabalho — mudar
-- `dead` para `pending` não faz ninguém processar, e reenviar o HTTP é ação
-- externa que pode tocar nota/financeiro. Não havia reversão honesta.
--
-- O caso escolhido: conversa `claimed` há 7+ dias sem mensagem. O claim não
-- tem TTL no produto; a conversa some da fila sem ninguém ver. Liberar devolve
-- para `open`/sem responsável; reverter restaura o responsável SOMENTE se
-- ninguém assumiu de novo (CAS em `status='open'` + sem responsável). Se outro
-- agente assumiu, a reversão devolve zero linhas — não rouba a conversa.
--
-- Recusa dura: qualquer outra regra/entidade, inclusive nota, pagamento,
-- recebível e campanha. O corpo da função nunca toca essas tabelas.
-- ============================================================================

create or replace function public.fn_sentinel_liberar_conversa(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_ator uuid,
  p_motivo text,
  p_atendente uuid,
  p_assigned_at timestamptz
)
returns table (
  occurrence_id uuid,
  conversa_id uuid,
  atendente_antes uuid,
  assigned_at_antes timestamptz,
  estado text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ocorrencia public.sentinel_occurrences%rowtype;
  v_conversa public.conversations%rowtype;
begin
  select *
    into v_ocorrencia
    from public.sentinel_occurrences o
   where o.organization_id = p_organization_id
     and o.id = p_occurrence_id
     and o.regra = 'operacao.conversa_claim_parado'
     and o.entidade_tipo = 'conversations'
     and o.estado = 'aprovada'
   for update;

  if not found then
    return;
  end if;

  if coalesce(length(btrim(p_motivo)), 0) < 3 then
    return;
  end if;

  if v_ocorrencia.entidade_id !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;

  select *
    into v_conversa
    from public.conversations c
   where c.organization_id = p_organization_id
     and c.id = v_ocorrencia.entidade_id::uuid
     and c.status = 'claimed'
     and c.assigned_to_user_id = p_atendente
     and c.assigned_at = p_assigned_at
     and c.assigned_at < now() - interval '7 days'
     and (c.last_message_at is null or c.last_message_at < now() - interval '7 days')
   for update;

  if not found then
    return;
  end if;

  update public.conversations
     set status = 'open',
         assigned_to_user_id = null,
         assigned_at = null,
         status_changed_at = now(),
         updated_at = now()
   where id = v_conversa.id
     and organization_id = p_organization_id;

  update public.sentinel_occurrences
     set estado = 'corrigida',
         updated_at = now()
   where id = v_ocorrencia.id
     and organization_id = p_organization_id;

  insert into public.sentinel_occurrence_events (
    organization_id, occurrence_id, tipo, estado_anterior, estado_novo,
    origem, ator_user_id, detalhe
  ) values (
    p_organization_id, v_ocorrencia.id, 'nota', 'aprovada', 'corrigida',
    'usuario', p_ator,
    jsonb_build_object(
      'correcao', 'liberar_conversa',
      'conversa_id', v_conversa.id,
      'atendente_antes', p_atendente,
      'assigned_at_antes', p_assigned_at,
      'status_depois', 'open',
      'motivo', btrim(p_motivo),
      'reversivel', true
    )
  );

  return query
    select v_ocorrencia.id, v_conversa.id, p_atendente, p_assigned_at, 'corrigida'::text;
end;
$fn$;

revoke execute on function public.fn_sentinel_liberar_conversa(
  uuid, uuid, uuid, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.fn_sentinel_liberar_conversa(
  uuid, uuid, uuid, text, uuid, timestamptz
) to service_role;

comment on function public.fn_sentinel_liberar_conversa(
  uuid, uuid, uuid, text, uuid, timestamptz
) is
  'Nível 2 restrito: libera claim de conversa claimed 7+ dias sem mensagem, com motivo, CAS e evento antes/depois. Só service_role.';

create or replace function public.fn_sentinel_reverter_liberacao_conversa(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_ator uuid
)
returns table (
  occurrence_id uuid,
  conversa_id uuid,
  atendente_restaurado uuid,
  estado text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ocorrencia public.sentinel_occurrences%rowtype;
  v_conversa_id uuid;
  v_atendente uuid;
  v_assigned_at timestamptz;
  v_restaurado integer;
begin
  select *
    into v_ocorrencia
    from public.sentinel_occurrences o
   where o.organization_id = p_organization_id
     and o.id = p_occurrence_id
     and o.regra = 'operacao.conversa_claim_parado'
     and o.entidade_tipo = 'conversations'
     and o.estado = 'corrigida'
   for update;

  if not found then
    return;
  end if;

  select
    (e.detalhe->>'conversa_id')::uuid,
    (e.detalhe->>'atendente_antes')::uuid,
    (e.detalhe->>'assigned_at_antes')::timestamptz
    into v_conversa_id, v_atendente, v_assigned_at
    from public.sentinel_occurrence_events e
   where e.organization_id = p_organization_id
     and e.occurrence_id = p_occurrence_id
     and e.tipo = 'nota'
     and e.detalhe->>'correcao' = 'liberar_conversa'
   order by e.created_at desc
   limit 1;

  if v_conversa_id is null then
    return;
  end if;

  -- Reversão honesta: ninguém assumiu de novo. Se assumiu, o claim atual é de
  -- outra pessoa e restaurar o antigo roubaria a conversa.
  update public.conversations
     set status = 'claimed',
         assigned_to_user_id = v_atendente,
         assigned_at = v_assigned_at,
         status_changed_at = now(),
         updated_at = now()
   where id = v_conversa_id
     and organization_id = p_organization_id
     and status = 'open'
     and assigned_to_user_id is null
     and assigned_at is null;

  get diagnostics v_restaurado = row_count;
  if v_restaurado = 0 then
    return;
  end if;

  update public.sentinel_occurrences
     set estado = 'nova',
         updated_at = now()
   where id = v_ocorrencia.id
     and organization_id = p_organization_id;

  insert into public.sentinel_occurrence_events (
    organization_id, occurrence_id, tipo, estado_anterior, estado_novo,
    origem, ator_user_id, detalhe
  ) values (
    p_organization_id, v_ocorrencia.id, 'reaberta', 'corrigida', 'nova',
    'usuario', p_ator,
    jsonb_build_object(
      'reversao', 'liberar_conversa',
      'conversa_id', v_conversa_id,
      'atendente_restaurado', v_atendente
    )
  );

  return query
    select v_ocorrencia.id, v_conversa_id, v_atendente, 'nova'::text;
end;
$fn$;

revoke execute on function public.fn_sentinel_reverter_liberacao_conversa(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_sentinel_reverter_liberacao_conversa(uuid, uuid, uuid)
  to service_role;

comment on function public.fn_sentinel_reverter_liberacao_conversa(uuid, uuid, uuid) is
  'Reverte a liberação SOMENTE se ninguém assumiu (open, sem responsável); senão zero linhas. Só service_role.';
