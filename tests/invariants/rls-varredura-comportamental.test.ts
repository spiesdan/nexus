import { beforeAll, describe, expect, it } from "vitest";

import {
  SEM_INSERT_PARA_AUTHENTICATED,
  SEM_LEITURA_POR_DESENHO,
  TABELAS_DA_VARREDURA,
} from "./_rls-varredura-tabelas";
import { sql } from "./gov-helpers";

/**
 * F-17 — prova COMPORTAMENTAL de isolamento nas tabelas que eram dívida.
 *
 * ## O que este arquivo resolve
 *
 * `rls-completude-varredura.test.ts` nasceu com uma lista `DEBITO_CONHECIDO` de
 * 73 tabelas tenant-aware com RLS ligada, policy presente e **nenhum** teste
 * `set role authenticated` + contagem cross-org. O cabeçalho daquela varredura é
 * explícito: RLS ligada e policy presente não são isolamento — um predicado
 * sabotado (`... or true`) passa em toda checagem de catálogo. A dívida era
 * real, e o gate só impedia que ela crescesse.
 *
 * Este arquivo fecha a dívida como o próprio texto de lá mandava: semeia uma
 * linha por organização em cada uma das 73 e prova, com o JWT de um admin da
 * org A,
 *
 *   1. LEITURA  — 0 linhas da org B e ≥ 1 da própria org (controle positivo);
 *   2. UPDATE   — 0 linhas da org B (ou recusa) e, quando a policy permite,
 *                 ≥ 1 na própria org;
 *   3. DELETE   — 0 linhas da org B (ou recusa);
 *   4. INSERT   — recusado quando a linha declara a org B, e aceito na própria
 *                 org quando existe caminho de escrita para `authenticated`.
 *
 * ## Por que os quatro eixos, e não só a leitura
 *
 * Os dois incidentes de vazamento medidos neste repositório foram de ESCRITA
 * (`org_guardrail_layers`, migration 0143: um `viewer` desligava a camada
 * anti-jailbreak pelo PostgREST) e de predicado que devolvia a org inteira do
 * vizinho. Um teste só de SELECT teria passado nos dois. O eixo de escrita é o
 * que pega `WITH CHECK` ausente — e é por isso que ele existe aqui, com o
 * controle positivo ao lado: sem ele, "0 linhas afetadas" seria indistinguível
 * de "esta tabela não aceita escrita nenhuma".
 *
 * ## O seed é o contrato da lista
 *
 * `TABELAS_DA_VARREDURA` vem de `_rls-varredura-tabelas.ts` e é semeada no
 * `beforeAll`. Tabela listada sem seed reprova no controle positivo (não há
 * linha da própria org para ler); tabela nova com `organization_id` continua
 * reprovando na varredura de completude até ganhar seed + prova aqui. Não
 * existe caminho em que a lista cresça e a prova não.
 *
 * ## Como o seed funciona sem 73 INSERTs de fixture
 *
 * Cada linha é inserida como `postgres` com `session_replication_role = replica`
 * — os triggers de aplicação (updated_at, validação de org do lead, emissão de
 * evento) não rodam, e o que se mede adiante é a POLICY, não o trigger. As
 * linhas são sintéticas, com UUID fixo de organização e nenhum dado pessoal
 * (LGPD): nada aqui é cópia de produção.
 */

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const USER_A = "aaaaaaaa-1111-4000-8000-000000000001";
const USER_B = "bbbbbbbb-1111-4000-8000-000000000002";

/** Uma linha por tabela, por organização. Ver o cabeçalho: replica mode. */
const SEED = `
  set session_replication_role = replica;

  insert into auth.users (id, email) values
    ('${USER_A}', 'rls-varre-a@invariant.test'),
    ('${USER_B}', 'rls-varre-b@invariant.test')
  on conflict (id) do nothing;

  insert into public.organizations (id, slug, legal_name, display_name) values
    ('${ORG_A}', 'rls-varre-a', 'RLS Varredura A', 'A'),
    ('${ORG_B}', 'rls-varre-b', 'RLS Varredura B', 'B')
  on conflict (id) do nothing;

  insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
    ('${USER_A}', '${ORG_A}', 'admin', now()),
    ('${USER_B}', '${ORG_B}', 'admin', now())
  on conflict do nothing;

  do $seed$
  declare
    v_org uuid;
    v_tag text;
    v_user uuid;
    v_sess uuid;
    v_contact uuid;
    v_conv uuid;
    v_pipe uuid;
    v_stage uuid;
    v_lead uuid;
    v_agent uuid;
    v_agentver uuid;
    v_ks uuid;
    v_kv uuid;
    v_router uuid;
    v_job uuid;
    v_mem uuid;
    v_playbook uuid;
    v_skill uuid;
    v_disc uuid;
    v_promise uuid;
    v_knob uuid;
    v_reentry uuid;
    v_demanda uuid;
  begin
    foreach v_org in array array['${ORG_A}'::uuid, '${ORG_B}'::uuid] loop
      v_tag := case when v_org = '${ORG_A}'::uuid then 'a' else 'b' end;
      v_user := case when v_tag = 'a' then '${USER_A}'::uuid else '${USER_B}'::uuid end;

      -- ── pais (as tabelas que as folhas referenciam) ────────────────────
      insert into public.channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted)
        values (v_org, 'rls-varre-' || v_tag, '\\x00'::bytea) on conflict do nothing;
      select id into v_sess from public.channel_sessions where organization_id = v_org order by created_at limit 1;

      insert into public.contacts (organization_id, display_name)
        values (v_org, 'RLS Varredura Contato ' || v_tag);
      select id into v_contact from public.contacts where organization_id = v_org order by created_at limit 1;

      insert into public.conversations (organization_id, contact_id, channel_session_id)
        values (v_org, v_contact, v_sess);
      select id into v_conv from public.conversations where organization_id = v_org order by created_at limit 1;

      insert into public.crm_pipelines (organization_id, name, slug)
        values (v_org, 'Varredura ' || v_tag, 'varre-' || v_tag) on conflict do nothing;
      select id into v_pipe from public.crm_pipelines where organization_id = v_org order by created_at limit 1;

      insert into public.crm_stages (organization_id, pipeline_id, name, slug, position)
        values (v_org, v_pipe, 'Novo', 'novo', 1000) on conflict do nothing;
      select id into v_stage from public.crm_stages where organization_id = v_org order by created_at limit 1;

      insert into public.crm_leads (organization_id, pipeline_id, stage_id, title)
        values (v_org, v_pipe, v_stage, 'Lead varredura ' || v_tag);
      select id into v_lead from public.crm_leads where organization_id = v_org order by created_at limit 1;

      insert into public.ai_agents (organization_id, name, system_prompt)
        values (v_org, 'Agente varredura ' || v_tag, 'probe');
      select id into v_agent from public.ai_agents where organization_id = v_org order by created_at limit 1;

      insert into public.ai_agent_versions
        (organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id)
        values (v_org, v_agent, 1, 'probe', 'openai', 'gpt-probe', v_sess);
      select id into v_agentver from public.ai_agent_versions where organization_id = v_org order by created_at limit 1;

      insert into public.ai_knowledge_sources (organization_id, source_type)
        values (v_org, 'faq');
      select id into v_ks from public.ai_knowledge_sources where organization_id = v_org order by created_at limit 1;

      insert into public.ai_knowledge_versions (organization_id, version_number)
        values (v_org, 1);
      select id into v_kv from public.ai_knowledge_versions where organization_id = v_org order by created_at limit 1;

      insert into public.ai_routers (organization_id, name, channel_session_id)
        values (v_org, 'Router varredura ' || v_tag, v_sess) on conflict do nothing;
      select id into v_router from public.ai_routers where organization_id = v_org order by created_at limit 1;

      insert into public.job_queue (organization_id, kind)
        values (v_org, 'watchdog');
      select id into v_job from public.job_queue where organization_id = v_org order by created_at limit 1;

      insert into public.org_memory_versions (organization_id, version_number, content)
        values (v_org, 1, 'memoria probe') on conflict do nothing;
      select id into v_mem from public.org_memory_versions where organization_id = v_org order by created_at limit 1;

      insert into public.playbook_versions (organization_id, layer, content)
        values (v_org, 'tenant', 'conteudo probe');
      select id into v_playbook from public.playbook_versions where organization_id = v_org order by created_at limit 1;

      insert into public.skill_versions (organization_id, name, description, body)
        values (v_org, 'skill-' || v_tag, 'probe', 'probe');
      select id into v_skill from public.skill_versions where organization_id = v_org order by created_at limit 1;

      insert into public.disclosure_template_versions (organization_id, body)
        values (v_org, 'probe') returning id into v_disc;

      insert into public.promise_table_versions (organization_id, values)
        values (v_org, '{}'::jsonb) returning id into v_promise;

      insert into public.reentry_knob_versions (organization_id, knobs)
        values (v_org, '{}'::jsonb) returning id into v_knob;

      insert into public.reentry_template_versions (organization_id, variants)
        values (v_org, array['probe']) returning id into v_reentry;

      insert into public.demandas (organization_id, contact_id)
        values (v_org, v_contact) returning id into v_demanda;

      -- ── folhas da dívida ───────────────────────────────────────────────
      insert into public.ai_agent_runs (organization_id, agent_id, agent_version_id)
        values (v_org, v_agent, v_agentver);

      insert into public.ai_budgets (organization_id) values (v_org);

      insert into public.ai_chunks
        (organization_id, knowledge_source_id, kb_version_id, position, content, content_hash, token_count, embedding)
        values (v_org, v_ks, v_kv, 0, 'probe', 'hash-' || v_tag, 1,
                (select array_agg(0.1::real)::vector from generate_series(1,1536)));

      insert into public.ai_faq_items (organization_id, knowledge_source_id, question, answer)
        values (v_org, v_ks, 'pergunta?', 'resposta');

      insert into public.ai_invocations (organization_id, invocation_kind, model, latency_ms)
        values (v_org, 'bot_respond', 'gpt-probe', 1);

      insert into public.ai_provider_credentials
        (organization_id, provider, label, api_key_encrypted, api_key_iv, api_key_tag, api_key_last4)
        values (v_org, 'openai', 'probe', '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, '0000');

      insert into public.ai_purpose_bindings (organization_id, purpose, provider, model_id)
        values (v_org, 'chat', 'openai', 'gpt-probe');

      insert into public.ai_router_members
        (organization_id, router_id, agent_id, intent_name, intent_description)
        values (v_org, v_router, v_agent, 'intent', 'descricao');

      insert into public.agent_cases (organization_id, conversation_id, title, summary, blocker)
        values (v_org, v_conv, 'Caso ' || v_tag, 'resumo', 'nada');

      insert into public.agent_case_events (organization_id, case_id, kind, actor_kind)
        select v_org, id, 'opened', 'system' from public.agent_cases where organization_id = v_org limit 1;

      insert into public.agent_inbox_items (organization_id, kind, title)
        values (v_org, 'other', 'item ' || v_tag);

      insert into public.api_audit_log (organization_id, action)
        values (v_org, 'probe.action');

      insert into public.api_tokens (organization_id, created_by, name, prefix, token_hash)
        values (v_org, v_user, 'token ' || v_tag, 'prb' || v_tag, '\\x00'::bytea);

      insert into public.attendant_availability (organization_id, user_id)
        values (v_org, v_user);

      insert into public.before_send_traces (organization_id, job_id, channel_session_id, trace)
        values (v_org, v_job, v_sess, '{}'::jsonb);

      insert into public.calendar_oauth_nonces (organization_id, user_id, nonce, expira_em)
        values (v_org, v_user, 'nonce-' || v_tag, now() + interval '5 min');

      insert into public.channel_knobs (organization_id, channel_session_id)
        values (v_org, v_sess);

      insert into public.channel_session_health (organization_id, channel_session_id, status)
        values (v_org, v_sess, 'ok');

      insert into public.channel_session_warmup (organization_id, channel_session_id, day)
        values (v_org, v_sess, current_date);

      insert into public.conversation_assignment_events (organization_id, conversation_id, reason)
        values (v_org, v_conv, 'claim');

      insert into public.conversation_notes (organization_id, conversation_id, body)
        values (v_org, v_conv, 'nota');

      -- actor_kind = system porque o CHECK de 'ai' exige evidência (run/trace).
      insert into public.crm_lead_activities (organization_id, lead_id, source_module, type, actor_kind)
        values (v_org, v_lead, 'crm', 'nota', 'system');

      insert into public.crm_lead_links (organization_id, lead_id, target_kind, target_id, link_kind)
        values (v_org, v_lead, 'contact', v_contact, 'principal');

      insert into public.crm_lead_reactivations (organization_id, lead_id, expires_at)
        values (v_org, v_lead, now() + interval '30 days');

      insert into public.crm_lead_risk_states (organization_id, lead_id, bucket, since, cold_hours)
        values (v_org, v_lead, 'em_dia', now() - interval '1 hour', 1);

      insert into public.crm_lead_scores (organization_id, lead_id)
        values (v_org, v_lead);

      insert into public.cron_jobs (organization_id, contact_id, kind, job_kind, next_run_at)
        values (v_org, v_contact, 'at', 'watchdog', now() + interval '1 hour');

      insert into public.demanda_conversas (organization_id, demanda_id, conversation_id)
        values (v_org, v_demanda, v_conv);

      insert into public.disclosure_template_pointers (organization_id, version_id)
        values (v_org, v_disc);

      insert into public.event_log (organization_id, event_type, entity_kind)
        values (v_org, 'probe.insert', 'probe');

      insert into public.flywheel_distiller_proposals
        (organization_id, run_id, dataset, type, target, content, evidence)
        values (v_org, gen_random_uuid(), 'probe', 'playbook_bullet', 'x', 'conteudo', '{}'::jsonb);

      insert into public.flywheel_judge_verdicts
        (organization_id, dataset, trace_id, dimension, verdict, option_order, judge_family, model, run_id)
        values (v_org, 'probe', 'trace-' || v_tag, 'tom', 'yes', 'ab', 'openai', 'gpt-probe', gen_random_uuid());

      insert into public.idempotency_keys
        (organization_id, key, endpoint, request_hash, status_code, response_body)
        values (v_org, 'chave-' || v_tag, '/probe', '\\x00'::bytea, 200, '{}'::jsonb);

      insert into public.incidents (organization_id, type, severity)
        values (v_org, 'probe', 'info');

      insert into public.judge_alignment_pool (organization_id, dataset, trace_id, dimension)
        values (v_org, 'probe', 'trace-' || v_tag, 'tom');

      insert into public.lead_checkpoints (organization_id, contact_id)
        values (v_org, v_contact);

      insert into public.lead_notes (organization_id, contact_id, headline, body)
        values (v_org, v_contact, 'titulo', 'corpo');

      insert into public.lead_state (organization_id, contact_id)
        values (v_org, v_contact);

      insert into public.lead_state_transitions (organization_id, contact_id, from_stage, to_stage)
        values (v_org, v_contact, 'new', 'contacted');

      insert into public.lgpd_requests (organization_id, request_type, source, due_at)
        values (v_org, 'data_request', 'manual', now() + interval '15 days');

      insert into public.llm_calls (organization_id, provider, model)
        values (v_org, 'openai', 'gpt-probe');

      insert into public.merge_queue (organization_id, candidates, reason)
        values (v_org, array[gen_random_uuid(), gen_random_uuid()], 'probe');

      insert into public.message_templates (organization_id, title, body)
        values (v_org, 'template ' || v_tag, 'corpo');

      insert into public.metrics (organization_id, name, value)
        values (v_org, 'probe_' || v_tag, 1);

      insert into public.nuvemshop_products
        (organization_id, external_id, title, price_cents, last_updated_at)
        values (v_org, 'ext-' || v_tag, 'Produto', 100, now());

      insert into public.orders
        (organization_id, external_id, external_provider, status, total_cents, ordered_at)
        values (v_org, 'pedido-' || v_tag, 'nuvemshop', 'pending', 100, now());

      insert into public.org_memory_pointers (organization_id, version_id)
        values (v_org, v_mem);

      insert into public.outbound_copies (organization_id, channel_session_id, normalized_text, normalized_hash)
        values (v_org, v_sess, 'texto', 'hash-' || v_tag);

      insert into public.pacing_ledger (organization_id, channel_session_id)
        values (v_org, v_sess);

      insert into public.playbook_pointers (organization_id, layer, version_id)
        values (v_org, 'tenant', v_playbook);

      insert into public.promise_table_pointers (organization_id, version_id)
        values (v_org, v_promise);

      insert into public.reentry_knob_pointers (organization_id, version_id)
        values (v_org, v_knob);

      insert into public.reentry_template_pointers (organization_id, version_id)
        values (v_org, v_reentry);

      insert into public.send_ledger (organization_id, job_id, seq, body_hash)
        values (v_org, v_job, 1::smallint, 'hash-' || v_tag);

      insert into public.skill_pointers (organization_id, name, version_id)
        values (v_org, 'skill-' || v_tag, v_skill);

      insert into public.storage_redaction_queue (organization_id, bucket, object_path)
        values (v_org, 'bucket', 'obj-' || v_tag);

      insert into public.tenant_integrations
        (organization_id, provider, oauth_access_token_encrypted, webhook_secret_encrypted)
        values (v_org, 'nuvemshop', '\\x00'::bytea, '\\x00'::bytea);

      insert into public.webhook_events_log (organization_id, provider, event_type)
        values (v_org, 'generic', 'probe');
    end loop;
  end
  $seed$;

  reset session_replication_role;
`;

/**
 * Sondas no banco. `__probe` roda SELECT/UPDATE/DELETE com a org parametrizada
 * sob o role corrente (o chamador faz `set role authenticated`), capturando o
 * SQLSTATE em vez de abortar a sessão: uma recusa de RLS é RESULTADO, não erro
 * de teste. `__probe_inserir` copia uma linha real (jsonb) trocando `id` e as
 * colunas de identidade, para que o INSERT exercite a policy sem colidir em PK —
 * e devolve `ok` só se a linha ENTROU.
 */
const SONDAS = `
  create or replace function public.__probe(tabela text, org uuid, cmd text) returns text
  language plpgsql as $fn$
  declare n bigint;
  begin
    if cmd = 'select' then
      execute format('select count(*) from public.%I where organization_id = $1', tabela) using org into n;
      return 'ok:' || n;
    elsif cmd = 'update' then
      execute format('update public.%I set organization_id = organization_id where organization_id = $1', tabela) using org;
      get diagnostics n = row_count;
      return 'ok:' || n;
    elsif cmd = 'delete' then
      execute format('delete from public.%I where organization_id = $1', tabela) using org;
      get diagnostics n = row_count;
      return 'ok:' || n;
    else
      raise exception 'cmd invalido %', cmd;
    end if;
  exception when others then
    return 'err:' || SQLSTATE;
  end $fn$;

  create or replace function public.__probe_inserir(tabela text, linha jsonb) returns text
  language plpgsql as $fn$
  declare
    v_cols text;
    v_j jsonb := linha;
    r record;
  begin
    select string_agg(quote_ident(attname), ',' order by attnum) into v_cols
      from pg_attribute
     where attrelid = format('public.%I', tabela)::regclass
       and attnum > 0 and not attisdropped and attgenerated = '';

    if v_j ? 'id' then
      v_j := jsonb_set(v_j, '{id}', to_jsonb(gen_random_uuid()));
    end if;

    for r in select attname from pg_attribute
              where attrelid = format('public.%I', tabela)::regclass
                and attnum > 0 and not attisdropped and attidentity <> ''
    loop
      v_j := jsonb_set(v_j, array[r.attname], to_jsonb((1000000 + floor(random()*1000000))::bigint));
    end loop;

    execute format(
      'insert into public.%I (%s) overriding system value select %s from jsonb_populate_record(null::public.%I, $1)',
      tabela, v_cols, v_cols, tabela
    ) using v_j;
    return 'ok';
  exception when others then
    return 'err:' || SQLSTATE;
  end $fn$;

  grant execute on function public.__probe(text, uuid, text) to authenticated;
  grant execute on function public.__probe_inserir(text, jsonb) to authenticated;
`;

interface Sondagem {
  readonly selB: string;
  readonly selA: string;
  readonly updB: string;
  readonly delB: string;
  readonly insB: string;
  readonly insA: string;
}

/**
 * Executa os seis eixos para UMA tabela, numa única sessão psql:
 * `\gset` captura a linha da org B como jsonb enquanto ainda somos `postgres`
 * (depois do `set role` ela seria invisível — a própria RLS que se quer medir
 * tornaria a sonda vacuidade).
 */
const SONDAGENS = new Map<string, Sondagem>();

/** Uma sessão por tabela, reaproveitada pelos casos (o INSERT do controle positivo é DML real). */
function sondar(tabela: string): Sondagem {
  const cache = SONDAGENS.get(tabela);
  if (cache) return cache;
  const out = sql(`
    select to_jsonb(x)::text as linha from public.${tabela} x
     where organization_id = '${ORG_B}' limit 1 \\gset
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${USER_A}"}', false) \\g /dev/null
    select 'selB', public.__probe('${tabela}', '${ORG_B}', 'select');
    select 'selA', public.__probe('${tabela}', '${ORG_A}', 'select');
    select 'updB', public.__probe('${tabela}', '${ORG_B}', 'update');
    select 'delB', public.__probe('${tabela}', '${ORG_B}', 'delete');
    select 'insB', public.__probe_inserir('${tabela}', :'linha'::jsonb);
    select 'insA', public.__probe_inserir('${tabela}',
      jsonb_set(:'linha'::jsonb, '{organization_id}', to_jsonb('${ORG_A}'::uuid)));
  `);
  const valores = new Map<string, string>();
  for (const linha of out.split("\n")) {
    const [chave, valor] = linha.split("|");
    if (chave && valor !== undefined) valores.set(chave, valor.trim());
  }
  const pega = (k: string): string => {
    const v = valores.get(k);
    if (v === undefined) throw new Error(`sonda de ${tabela} não devolveu ${k}: ${out}`);
    return v;
  };
  const sondagem: Sondagem = {
    selB: pega("selB"),
    selA: pega("selA"),
    updB: pega("updB"),
    delB: pega("delB"),
    insB: pega("insB"),
    insA: pega("insA"),
  };
  SONDAGENS.set(tabela, sondagem);
  return sondagem;
}

beforeAll(() => {
  sql(SEED);
  sql(SONDAS);
  // Guarda de vacuidade do seed: cada tabela da lista TEM linha das duas orgs.
  // Sem isto, uma tabela cujo seed parou de inserir passaria em todos os eixos
  // cross-org por ausência de dado — o modo de falha que a varredura de
  // completude chama de "verde medindo zero".
  const faltando = sql(`
    select string_agg(t, ',') from (
      ${TABELAS_DA_VARREDURA.map(
        (t) =>
          `select '${t}' as t where not exists (select 1 from public.${t} where organization_id = '${ORG_A}')
             or not exists (select 1 from public.${t} where organization_id = '${ORG_B}')`,
      ).join(" union all ")}
    ) x;
  `);
  expect(faltando, "tabela da varredura sem linha nas DUAS organizações").toBe("");
});

describe("F-17 — isolamento comportamental (73 tabelas que eram dívida)", () => {
  it("a lista bate com o contrato do arquivo de dados", () => {
    // 73 é o número medido em 2026-08-27 na lista `DEBITO_CONHECIDO`. Se a lista
    // crescer, o seed tem que crescer junto — e o caso abaixo reprova se não.
    expect(TABELAS_DA_VARREDURA.length).toBe(73);
    expect(new Set(TABELAS_DA_VARREDURA).size).toBe(73);
  });

  for (const tabela of TABELAS_DA_VARREDURA) {
    const semLeitura = SEM_LEITURA_POR_DESENHO[tabela];
    const semInsert = (SEM_INSERT_PARA_AUTHENTICATED as readonly string[]).includes(tabela);

    describe(tabela, () => {
      it("admin da org A lê 0 linhas da org B", () => {
        const s = sondar(tabela);
        // `err:42501` aqui é a recusa no PRIVILÍGIO (tabela sem GRANT de SELECT),
        // que é isolamento ainda mais forte que a policy: não há leitura.
        expect(
          ["ok:0", "err:42501"],
          `VAZAMENTO ENTRE ORGANIZAÇÕES: ${tabela} devolveu linhas da org B para o admin da org A (${s.selB})`,
        ).toContain(s.selB);
      });

      it("controle positivo: enxerga as próprias linhas (ou a leitura é negada por desenho)", () => {
        const s = sondar(tabela);
        if (semLeitura) {
          expect(
            ["ok:0", "err:42501"],
            `${tabela}: ${semLeitura}`,
          ).toContain(s.selA);
          return;
        }
        expect(
          s.selA,
          `${tabela}: o admin da PRÓPRIA organização não leu nenhuma linha — a prova cross-org ` +
            `acima seria vacuidade (tabela vazia). Se a leitura for negada por desenho, declare ` +
            `em SEM_LEITURA_POR_DESENHO com a razão medida.`,
        ).toMatch(/^ok:[1-9]\d*$/);
      });

      it("UPDATE e DELETE da org B não alcançam linha nenhuma", () => {
        const s = sondar(tabela);
        const aceitos = ["ok:0", "err:42501"];
        expect(
          aceitos,
          `ESCRITA CROSS-ORG: UPDATE em ${tabela} com organization_id da org B afetou linhas (${s.updB})`,
        ).toContain(s.updB);
        expect(
          aceitos,
          `ESCRITA CROSS-ORG: DELETE em ${tabela} com organization_id da org B afetou linhas (${s.delB})`,
        ).toContain(s.delB);
      });

      it("INSERT declarando a org B é recusado", () => {
        const s = sondar(tabela);
        expect(
          s.insB,
          `ESCRITA CROSS-ORG: INSERT em ${tabela} com organization_id da org B PASSOU — ` +
            `WITH CHECK ausente ou com predicado que aceita a org do vizinho`,
        ).not.toBe("ok");
      });

      it(
        "INSERT na própria org: " +
          (semInsert ? "negado no privilégio (escrita só server-side)" : "aceito pela policy"),
        () => {
          const s = sondar(tabela);
          if (semInsert) {
            // Sem GRANT/policy de INSERT para `authenticated`: a recusa é o
            // estado correto, e a prova cross-org acima continua valendo.
            expect(s.insA, `${tabela} deveria recusar INSERT para authenticated`).toBe("err:42501");
            return;
          }
          // `err:23505`/`err:23503`/`err:23P01` = a policy ACEITOU e uma
          // constraint barrou a cópia (unique/FK do mesmo valor). É controle
          // positivo: a linha chegou à constraint, então o WITH CHECK deixou
          // passar. `err:42501` aqui é a policy recusando a PRÓPRIA org.
          expect(
            s.insA,
            `${tabela}: INSERT na própria organização foi recusado por RLS (${s.insA}) — ` +
              `policy de INSERT quebrada ou papel do usuário errado no seed`,
          ).not.toMatch(/^err:42501$/);
        },
      );
    });
  }

  it("nenhuma sonda cross-org é vacuidade: as linhas da org B existem", () => {
    // Mede como superusuário (fora da RLS) que cada tabela tem linha das duas
    // orgs — o mesmo dado que o `beforeAll` já conferiu, aqui sob o nome do
    // invariante para que a mensagem aponte a tabela quando falhar.
    const linhas = sql(`
      select string_agg(t, ',') from (
        ${TABELAS_DA_VARREDURA.map(
          (t) =>
            `select '${t}' as t where (select count(*) from public.${t} where organization_id = '${ORG_B}') = 0`,
        ).join(" union all ")}
      ) x;
    `);
    expect(linhas).toBe("");
  });
});
