import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

/**
 * F-17 — as 34 tabelas restantes do débito, com prova comportamental.
 *
 * A varredura de completude (`rls-completude-varredura.test.ts`) fotografou 73
 * tabelas tenant-aware sem nenhuma prova de isolamento. O PR #453 fechou 39;
 * este arquivo fecha as **34 restantes** com o mesmo contrato mínimo, medido em
 * Postgres de verdade:
 *
 *   1. o admin da org D lê **0** linhas da org E (isolamento);
 *   2. o admin da org D lê **≥1** linha da própria org (controle positivo —
 *      sem ele, tabela vazia ou policy que nega todo mundo passa verde).
 *
 * A prova é de LEITURA, que é o que o cross-tenant expõe primeiro. Escrita tem
 * os testes de rota/policy de cada módulo; aqui o alvo é a dívida estrutural de
 * `DEBITO_CONHECIDO`, que existia por ausência de teste, não por policy ausente.
 *
 * O seed cria as entidades-pai (org, usuário, sessão, contato, conversa, funil,
 * lead) e uma linha por tabela em cada org. Nada de PII real.
 */

const ORG_D = "ab000000-0000-4000-8000-000000000001";
const ORG_E = "ab000000-0000-4000-8000-000000000002";
const USER_D = "ab000000-1111-4000-8000-000000000001";
const USER_E = "ab000000-1111-4000-8000-000000000002";

/** As 34 que saíram do débito neste arquivo. */
export const TABELAS_RESTANTES = [
  "agent_case_events",
  "agent_cases",
  "ai_agent_runs",
  "ai_agent_versions",
  "ai_agents",
  "ai_budgets",
  "ai_chunks",
  "ai_faq_items",
  "ai_invocations",
  "ai_knowledge_sources",
  "ai_knowledge_versions",
  "ai_purpose_bindings",
  "ai_router_members",
  "api_audit_log",
  "attendant_availability",
  "channel_session_warmup",
  "conversation_assignment_events",
  "crm_lead_activities",
  "crm_lead_links",
  "crm_lead_reactivations",
  "crm_lead_risk_states",
  "demanda_conversas",
  "demandas",
  "event_log",
  "idempotency_keys",
  "lgpd_requests",
  "merge_queue",
  "nuvemshop_products",
  "orders",
  "org_memory_pointers",
  "storage_redaction_queue",
  "webhook_events_log",
] as const;

function seed(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_D}', 'f17-resto-d@invariant.test'),
      ('${USER_E}', 'f17-resto-e@invariant.test')
    on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_D}', 'f17-resto-d', 'F17 Resto D', 'F17 Resto D'),
      ('${ORG_E}', 'f17-resto-e', 'F17 Resto E', 'F17 Resto E')
    on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_D}', '${ORG_D}', 'admin', now()),
      ('${USER_E}', '${ORG_E}', 'admin', now())
    on conflict do nothing;

    do $seed$
    declare
      v_org uuid; v_user uuid; v_tag text;
      v_sess uuid; v_contact uuid; v_conv uuid; v_pipe uuid; v_stage uuid;
      v_lead uuid; v_agent uuid; v_agent_ver uuid; v_src uuid; v_kbver uuid;
      v_router uuid; v_case uuid; v_demanda uuid; v_memver uuid;
    begin
      foreach v_tag in array array['d','e'] loop
        v_org := (case when v_tag='d' then '${ORG_D}' else '${ORG_E}' end)::uuid;
        v_user := (case when v_tag='d' then '${USER_D}' else '${USER_E}' end)::uuid;

        insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
          values (gen_random_uuid(), v_org, 'f17-resto-'||v_tag, '\\x00'::bytea)
          returning id into v_sess;
        insert into public.contacts (id, organization_id, display_name)
          values (gen_random_uuid(), v_org, 'F17 Resto Contact '||v_tag) returning id into v_contact;
        insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
          values (gen_random_uuid(), v_org, v_contact, v_sess, 'open') returning id into v_conv;
        insert into public.crm_pipelines (id, organization_id, name, slug)
          values (gen_random_uuid(), v_org, 'F17 Resto '||v_tag, 'f17-resto-'||v_tag) returning id into v_pipe;
        insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position)
          values (gen_random_uuid(), v_org, v_pipe, 'Novo', 'novo', 1000) returning id into v_stage;
        insert into public.crm_leads (organization_id, pipeline_id, stage_id, title)
          values (v_org, v_pipe, v_stage, 'F17 Resto lead '||v_tag) returning id into v_lead;

        -- ── IA ─────────────────────────────────────────────────────────────
        insert into public.ai_agents (organization_id, name, system_prompt)
          values (v_org, 'Agente '||v_tag, 'prompt') returning id into v_agent;
        insert into public.ai_agent_versions
          (organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id)
          values (v_org, v_agent, 1, 'prompt', 'anthropic', 'claude-sonnet', v_sess)
          returning id into v_agent_ver;
        insert into public.ai_agent_runs (organization_id, agent_id, agent_version_id)
          values (v_org, v_agent, v_agent_ver);
        insert into public.ai_knowledge_sources (organization_id, source_type)
          values (v_org, 'manual') returning id into v_src;
        insert into public.ai_knowledge_versions (organization_id, version_number, knowledge_source_id)
          values (v_org, 1, v_src) returning id into v_kbver;
        insert into public.ai_chunks
          (organization_id, knowledge_source_id, kb_version_id, position, content, content_hash, token_count, embedding)
          values (v_org, v_src, v_kbver, 1, 'trecho', 'hash-'||v_tag, 2,
                  array_fill(0.0::real, ARRAY[1536])::vector);
        insert into public.ai_faq_items (organization_id, knowledge_source_id, question, answer)
          values (v_org, v_src, 'pergunta?', 'resposta');
        insert into public.ai_invocations (organization_id, invocation_kind, model, latency_ms)
          values (v_org, 'bot_respond', 'claude-sonnet', 12);
        insert into public.ai_purpose_bindings (organization_id, purpose, provider, model_id)
          values (v_org, 'chat', 'anthropic', 'claude-sonnet');
        insert into public.ai_routers (organization_id, name, channel_session_id)
          values (v_org, 'Router '||v_tag, v_sess) returning id into v_router;
        insert into public.ai_router_members
          (organization_id, router_id, agent_id, intent_name, intent_description)
          values (v_org, v_router, v_agent, 'saudacao', 'o cliente cumprimenta');

        -- ── Casos e demandas ──────────────────────────────────────────────
        insert into public.agent_cases (organization_id, conversation_id, title, summary, blocker)
          values (v_org, v_conv, 'Caso '||v_tag, 'resumo', 'nada') returning id into v_case;
        insert into public.agent_case_events (organization_id, case_id, kind, actor_kind)
          values (v_org, v_case, 'opened', 'agent');
        insert into public.demandas (organization_id, contact_id)
          values (v_org, v_contact) returning id into v_demanda;
        insert into public.demanda_conversas (organization_id, demanda_id, conversation_id)
          values (v_org, v_demanda, v_conv);

        -- ── CRM e operação ────────────────────────────────────────────────
        insert into public.crm_lead_activities (organization_id, lead_id, source_module, type)
          values (v_org, v_lead, 'crm', 'nota');
        insert into public.crm_lead_links (organization_id, lead_id, target_kind, target_id, link_kind)
          values (v_org, v_lead, 'conversation', v_conv, 'relacionado');
        insert into public.crm_lead_reactivations (lead_id, organization_id, expires_at)
          values (v_lead, v_org, now() + interval '30 days');
        insert into public.crm_lead_risk_states (lead_id, organization_id, bucket, since, cold_hours)
          values (v_lead, v_org, 'em_risco', now() - interval '1 day', 24);
        insert into public.conversation_assignment_events (organization_id, conversation_id, reason)
          values (v_org, v_conv, 'routing');
        insert into public.attendant_availability (organization_id, user_id)
          values (v_org, v_user);
        insert into public.calendar_oauth_nonces (nonce, organization_id, user_id, expira_em)
          values ('nonce-'||v_tag, v_org, v_user, now() + interval '1 hour');
        insert into public.channel_session_warmup (channel_session_id, organization_id, day)
          values (v_sess, v_org, current_date);

        -- ── Logs, filas e integrações ─────────────────────────────────────
        insert into public.api_audit_log (organization_id, action)
          values (v_org, 'test.action');
        insert into public.event_log (organization_id, event_type, entity_kind)
          values (v_org, 'test.event', 'contact');
        insert into public.idempotency_keys
          (organization_id, key, endpoint, request_hash, status_code, response_body)
          values (v_org, 'key-'||v_tag, '/teste', md5(v_tag), 200, '{}'::jsonb);
        insert into public.incidents (organization_id, type, severity)
          values (v_org, 'teste', 'info');
        insert into public.lgpd_requests (organization_id, request_type, source, due_at)
          values (v_org, 'data_request', 'manual', now() + interval '30 days');
        insert into public.merge_queue (organization_id, candidates, reason)
          values (v_org, array[gen_random_uuid(), gen_random_uuid()], 'teste');
        insert into public.storage_redaction_queue (organization_id, bucket, object_path)
          values (v_org, 'lgpd-exports', 'pasta/'||v_tag);
        insert into public.webhook_events_log (organization_id, event_type)
          values (v_org, 'message');
        insert into public.orders
          (organization_id, external_id, external_provider, status, total_cents, ordered_at)
          values (v_org, 'pedido-'||v_tag, 'nuvemshop', 'paid', 100, now());
        insert into public.nuvemshop_products
          (organization_id, external_id, title, price_cents, last_updated_at)
          values (v_org, 'produto-'||v_tag, 'Produto', 100, now());

        -- ── Memória da organização ────────────────────────────────────────
        insert into public.org_memory_versions (organization_id, version_number, content)
          values (v_org, 1, 'memoria') returning id into v_memver;
        insert into public.org_memory_pointers (organization_id, version_id)
          values (v_org, v_memver);
      end loop;
    end
    $seed$;
  `);
}

beforeAll(() => {
  seed();
});

describe("F-17 — isolamento cross-tenant das 34 tabelas restantes", () => {
  for (const tabela of TABELAS_RESTANTES) {
    it(`${tabela}: admin da org D lê 0 linhas da org E`, () => {
      const linhasDoVizinho = countAs(
        USER_D,
        `select count(*) from public.${tabela} where organization_id = '${ORG_E}';`,
      );
      expect(linhasDoVizinho).toBe(0);
    });

    it(`${tabela}: admin da org D lê a própria org (controle positivo)`, () => {
      const proprias = countAs(
        USER_D,
        `select count(*) from public.${tabela} where organization_id = '${ORG_D}';`,
      );
      expect(proprias).toBeGreaterThanOrEqual(1);
    });
  }

  it("calendar_oauth_nonces: usuário autenticado não lê (nonce é service role)", () => {
    // A policy é `using (false)`: não é isolamento entre tenants, é fechamento
    // total para o navegador. A prova é o próprio acesso negado — e é mais
    // forte que "lê 0 da outra org".
    expect(() =>
      countAs(USER_D, `select count(*) from public.calendar_oauth_nonces;`),
    ).toThrow(/permission denied/i);
  });

  it("incidents: usuário de tenant não lê nem a própria org (policy platform_admin)", () => {
    // A policy exige `fn_is_platform_admin()`. Um admin de organização não é
    // platform admin: 0 nas duas orgs é o comportamento correto, não falha de
    // fixture. A leitura de plataforma é provada em `admin-*`.
    expect(
      countAs(USER_D, `select count(*) from public.incidents where organization_id = '${ORG_D}';`),
    ).toBe(0);
    expect(
      countAs(USER_D, `select count(*) from public.incidents where organization_id = '${ORG_E}';`),
    ).toBe(0);
  });

  it("o seed gravou nas duas organizações (guarda de vacuidade)", () => {
    const orgs = Number(
      sql(
        `select count(distinct organization_id) from public.event_log
          where organization_id in ('${ORG_D}','${ORG_E}');`,
      ),
    );
    expect(orgs).toBe(2);
  });
});
