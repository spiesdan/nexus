-- 0272_emit_event_guarda_organizacao_inexistente
--
-- O QUE MUDOU
--
-- `public.emit_event()` passa a devolver NULL em vez de tentar gravar quando a
-- organização do evento não existe mais. É a MESMA guarda que
-- `fn_audit_log_row()` já tem no ramo DELETE, e a mesma justificativa dela:
-- registro de um tenant que está indo embora não tem consumidor.
--
-- POR QUE ISSO EXISTE (medido em 2026-10-18 na instalação do usuário)
--
-- Apagar uma organização que tivesse agente de IA com lead atribuído **falhava
-- com erro de FK**:
--
--   ERROR: insert or update on table "event_log" violates foreign key
--          constraint "event_log_organization_id_fkey"
--   DETAIL: Key (organization_id)=(16f950b8-…) is not present in table "organizations".
--   CONTEXT: emit_event() … fn_log_event() … fn_emit_event_on_lead_change()
--            … fn_liberar_leads_do_agente() … DELETE FROM ONLY "public"."ai_agents"
--
-- A cadeia é: apagar a organização dispara o CASCADE em `ai_agents`, cujo
-- gatilho BEFORE DELETE zera `crm_leads.owner_agent_id` (para não deixar
-- `owner_kind='ai'` apontando para agente nulo), o UPDATE no lead dispara
-- `fn_emit_event_on_lead_change`, que chama `emit_event`, que tenta INSERT em
-- `event_log` — e a organização **já foi removida** dentro do mesmo cascade.
--
-- Ou seja: a organização é indeponível. A exclusão é impossível, e o defeito é
-- silencioso no caminho do produto porque hoje só dois arquivos do repo apagam
-- organização (`tests/prova-org-fresca-clinica.ts` e
-- `tests/e2e/mfa-opcional.spec.ts`), nenhum deles de produto — até a tela de
-- "excluir tenant" que um dia existir nascer quebrada.
--
-- POR QUE A GUARDA FICA AQUI, E NÃO EM CADA GATILHO
--
-- `emit_event` é o único funil: `fn_log_event` e todos os gatilhos que
-- emitem evento passam por ela. Consertar aqui cobre o caminho inteiro de uma
-- vez, e é o mesmo desenho que a auditoria já adotou — as duas tabelas
-- (`event_log` e `api_audit_log`) têm a mesma trava, então as duas precisam da
-- mesma defesa.
--
-- O QUE NÃO MUDA
--
-- `emit_event` continua levantando exceção quando `organization_id` é NULO e
-- não dá para deduzir a organização, e continua exigindo papel de membro ativo
-- para quem chama autenticado. A guarda é só para "essa organização não existe
-- (mais)".

create or replace function public.emit_event(
  p_event_type   text,
  p_entity_kind  text,
  p_entity_id    uuid,
  p_payload      jsonb default '{}'::jsonb,
  p_metadata     jsonb default '{}'::jsonb,
  p_organization_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_event_id uuid;
begin
  v_org_id := p_organization_id;
  if v_org_id is null then
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;

  if auth.uid() is not null
     and not public.fn_role_at_least(v_org_id, 'viewer') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'emit_event: caller must be an active member of the organization';
  end if;

  -- A organização está indo embora (CASCADE em curso). Registrar evento de um
  -- tenant que deixa de existir não tem consumidor — e a FK de `event_log`
  -- reprova o INSERT, o que abortava a exclusão da organização inteira.
  --
  -- Só depois da checagem de papel: quem chamou autenticado tem que ser
  -- recusado por falta de papel, não absorvido por esta guarda. Um bug que
  -- emita evento para uma organização que nunca existiu some em silêncio — e o
  -- sintoma disso é um evento que nunca chega, que é bem mais difícil de
  -- enxergar do que uma exceção.
  if not exists (select 1 from public.organizations where id = v_org_id) then
    return null;
  end if;

  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) is
  'Grava um evento no event_log. Devolve NULL quando a organização não existe mais (exclusão em curso): o registro não teria consumidor e a FK reprovaria o INSERT.';