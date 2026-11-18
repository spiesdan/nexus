-- ============================================================================
-- 0325 — NÍVEL 2 RESTRITO: antecipar UM job de manutenção, com aprovação
-- humana, antes/depois e reversão honesta.
--
-- O caso escolhido é `operacao.job_fila_travado` sobre job `watchdog`
-- **pendente e atrasado**. Não há dinheiro, nota, saldo, pagamento, mensagem
-- ao cliente nem campanha. A ação é mudar `run_after` para agora; a reversão
-- restaura o valor anterior SOMENTE se o job ainda estiver `pending` com o
-- `run_after` que gravamos. Depois de reclamado, reverter seria mentira — e a
-- função devolve zero linhas em vez de fingir.
--
-- O que NÃO é corrigível (recusa dura, no corpo):
--   * qualquer outra regra/entidade — inclusive fiscal e financeiro;
--   * job `running`/`dead` (não há antes/depois reversível);
--   * job `inbound_turn`/`followup_turn`/`flywheel` (o efeito inclui envio
--     externo; a máquina não decide isso);
--   * job que mudou desde o dry-run (o CAS em `run_after` não casa).
--
-- As duas funções fazem job + estado da ocorrência + evento na MESMA transação:
-- não existe janela em que o job mudou e o histórico não sabe.
-- ============================================================================

create or replace function public.fn_sentinel_corrigir_job(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_ator uuid,
  p_antes timestamptz,
  p_depois timestamptz
)
returns table (
  occurrence_id uuid,
  job_id uuid,
  run_after_antes timestamptz,
  run_after_depois timestamptz,
  estado text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ocorrencia public.sentinel_occurrences%rowtype;
  v_job public.job_queue%rowtype;
begin
  select *
    into v_ocorrencia
    from public.sentinel_occurrences o
   where o.organization_id = p_organization_id
     and o.id = p_occurrence_id
     and o.regra = 'operacao.job_fila_travado'
     and o.entidade_tipo = 'job_queue'
     and o.estado = 'aprovada'
   for update;

  if not found then
    return;
  end if;

  -- PG15 não tem `pg_input_is_valid`; o regex evita cast inválido virar 500.
  if v_ocorrencia.entidade_id !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;

  -- Janela do "agora": o dry-run que o gestor revisou não pode ser executado
  -- horas depois com outro significado.
  if p_depois < now() - interval '5 minutes'
     or p_depois > now() + interval '5 minutes' then
    return;
  end if;

  select *
    into v_job
    from public.job_queue j
   where j.organization_id = p_organization_id
     and j.id = v_ocorrencia.entidade_id::uuid
     and j.kind = 'watchdog'
     and j.status = 'pending'
     and j.run_after = p_antes
     and j.run_after < now() - interval '2 hours'
     and j.attempts < j.max_attempts
   for update;

  if not found then
    return;
  end if;

  update public.job_queue
     set run_after = p_depois
   where id = v_job.id
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
      'correcao', 'antecipar_job',
      'job_id', v_job.id,
      'run_after_antes', p_antes,
      'run_after_depois', p_depois,
      'reversivel', true
    )
  );

  return query
    select v_ocorrencia.id, v_job.id, p_antes, p_depois, 'corrigida'::text;
end;
$fn$;

revoke execute on function public.fn_sentinel_corrigir_job(
  uuid, uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.fn_sentinel_corrigir_job(
  uuid, uuid, uuid, timestamptz, timestamptz
) to service_role;

comment on function public.fn_sentinel_corrigir_job(
  uuid, uuid, uuid, timestamptz, timestamptz
) is
  'Nível 2 restrito: antecipa run_after de job watchdog pending atrasado, com CAS no antes e evento antes/depois. Só service_role, atrás do gate de gestor.';

create or replace function public.fn_sentinel_reverter_job(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_ator uuid
)
returns table (
  occurrence_id uuid,
  job_id uuid,
  run_after_restaurado timestamptz,
  estado text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ocorrencia public.sentinel_occurrences%rowtype;
  v_job_id uuid;
  v_antes timestamptz;
  v_depois timestamptz;
  v_restaurado integer;
begin
  select *
    into v_ocorrencia
    from public.sentinel_occurrences o
   where o.organization_id = p_organization_id
     and o.id = p_occurrence_id
     and o.regra = 'operacao.job_fila_travado'
     and o.entidade_tipo = 'job_queue'
     and o.estado = 'corrigida'
   for update;

  if not found then
    return;
  end if;

  select
    (e.detalhe->>'job_id')::uuid,
    (e.detalhe->>'run_after_antes')::timestamptz,
    (e.detalhe->>'run_after_depois')::timestamptz
    into v_job_id, v_antes, v_depois
    from public.sentinel_occurrence_events e
   where e.organization_id = p_organization_id
     and e.occurrence_id = p_occurrence_id
     and e.tipo = 'nota'
     and e.detalhe->>'correcao' = 'antecipar_job'
   order by e.created_at desc
   limit 1;

  if v_job_id is null then
    return;
  end if;

  -- Reversão honesta: o job ainda está pendente E ainda tem o run_after que a
  -- correção gravou. Se o worker já reclamou, não há o que restaurar.
  update public.job_queue
     set run_after = v_antes
   where id = v_job_id
     and organization_id = p_organization_id
     and status = 'pending'
     and run_after = v_depois;

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
      'reversao', 'antecipar_job',
      'job_id', v_job_id,
      'run_after_restaurado', v_antes
    )
  );

  return query
    select v_ocorrencia.id, v_job_id, v_antes, 'nova'::text;
end;
$fn$;

revoke execute on function public.fn_sentinel_reverter_job(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_sentinel_reverter_job(uuid, uuid, uuid)
  to service_role;

comment on function public.fn_sentinel_reverter_job(uuid, uuid, uuid) is
  'Reverte a antecipação SOMENTE se o job segue pending com o run_after gravado; senão zero linhas. Atômico com estado/evento. Só service_role.';
