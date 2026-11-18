import { beforeAll, describe, expect, it } from "vitest";

import { TABELAS_PROVADAS_AQUI } from "./f17-tabelas-provadas";
import { countAs, sql } from "./gov-helpers";

/**
 * F-17 — as tabelas do `DEBITO_CONHECIDO` que já têm prova comportamental.
 *
 * A varredura de completude (`rls-completude-varredura.test.ts`) fotografou em
 * 2026-08-27 **73 tabelas tenant-aware sem nenhuma prova de isolamento**: RLS
 * ligada e policy presente, mas nenhum teste que simulasse o JWT de um usuário
 * real e CONTASSE linhas da outra organização. RLS ligada não é isolamento — já
 * houve policy `... or true` viva neste repo com o catálogo todo verde.
 *
 * Este arquivo é a primeira fatia do pagamento dessa dívida: **39 tabelas**
 * cujo isolamento agora é medido nas duas direções, com controle positivo.
 * As linhas saíram de `DEBITO_CONHECIDO` e passaram a `PROVA_PROPRIA`, citando
 * este arquivo. A lista de débito continua sendo a fotografia do que FALTA —
 * ela só encolhe.
 *
 * ## Por que este arquivo e não `TABLES` (rls-isolation.test.ts)
 *
 * As fixtures de lá usam o usuário `agent` de duas orgs e servem a um molde de
 * leitura sem gate de papel. Aqui há tabelas em que a policy exige `admin`
 * (`api_tokens` é admin-only por desenho) e outras com `organization_id`
 * nullable. Semear um `agent` faria o controle positivo falhar por ACERTO — o
 * mesmo motivo que já mantinha `webhook_lead_captures` fora.
 *
 * ## O que cada caso prova
 *
 * Para CADA tabela:
 *   1. o admin da org D lê **0** linhas da org E (isolamento cross-tenant);
 *   2. o admin da org D lê **≥1** linha da própria org (controle positivo —
 *      sem ele, um `count(*)` que devolvesse 0 por tabela vazia ou por policy
 *      que nega todo mundo passaria verde sem provar nada).
 *
 * O seed é idempotente (UUIDs aleatórios por execução, banco novo por arquivo
 * via `tests/db/banco-limpo-por-arquivo.ts`) e não usa PII real.
 */

const ORG_D = "dddddddd-0000-4000-8000-000000000001";
const ORG_E = "eeeeeeee-0000-4000-8000-000000000001";
const USER_D = "dddddddd-1111-4000-8000-000000000001";
const USER_E = "eeeeeeee-1111-4000-8000-000000000001";

function seed(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_D}', 'rls-debito-d@invariant.test'),
      ('${USER_E}', 'rls-debito-e@invariant.test')
    on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_D}', 'rls-debito-d', 'RLS Debito D', 'RLS Debito D'),
      ('${ORG_E}', 'rls-debito-e', 'RLS Debito E', 'RLS Debito E')
    on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_D}', '${ORG_D}', 'admin', now()),
      ('${USER_E}', '${ORG_E}', 'admin', now())
    on conflict do nothing;

    do $seed$
    declare
      v_org uuid; v_user uuid; v_tag text;
      v_sess uuid; v_contact uuid; v_conv uuid; v_pipe uuid; v_stage uuid;
      v_lead uuid; v_job uuid; v_ver uuid;
    begin
      foreach v_tag in array array['d','e'] loop
        v_org := (case when v_tag='d' then '${ORG_D}' else '${ORG_E}' end)::uuid;
        v_user := (case when v_tag='d' then '${USER_D}' else '${USER_E}' end)::uuid;

        insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
          values (gen_random_uuid(), v_org, 'rls-debito-'||v_tag, '\\x00'::bytea)
          returning id into v_sess;
        insert into public.contacts (id, organization_id, display_name)
          values (gen_random_uuid(), v_org, 'RLS Debito Contact '||v_tag) returning id into v_contact;
        insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
          values (gen_random_uuid(), v_org, v_contact, v_sess, 'open') returning id into v_conv;
        insert into public.crm_pipelines (id, organization_id, name, slug)
          values (gen_random_uuid(), v_org, 'RLS Debito '||v_tag, 'rls-debito-'||v_tag) returning id into v_pipe;
        insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position)
          values (gen_random_uuid(), v_org, v_pipe, 'Novo', 'novo', 1000) returning id into v_stage;
        insert into public.crm_leads (organization_id, pipeline_id, stage_id, title)
          values (v_org, v_pipe, v_stage, 'RLS Debito lead '||v_tag) returning id into v_lead;

        insert into public.agent_inbox_items (organization_id, kind, title)
          values (v_org, 'handoff', 'RLS Debito item');
        insert into public.job_queue (organization_id, kind, contact_id)
          values (v_org, 'followup_turn', v_contact) returning id into v_job;
        insert into public.send_ledger (organization_id, job_id, seq, body_hash)
          values (v_org, v_job, 1, 'hash-'||v_tag);
        insert into public.playbook_versions (organization_id, layer, content)
          values (v_org, 'tenant', 'conteudo') returning id into v_ver;
        insert into public.playbook_pointers (organization_id, layer, version_id)
          values (v_org, 'tenant', v_ver);
        insert into public.channel_session_health (organization_id, channel_session_id, status)
          values (v_org, v_sess, 'ok');
        insert into public.llm_calls (organization_id, provider, model)
          values (v_org, 'anthropic', 'claude');
        insert into public.lead_checkpoints (organization_id, contact_id) values (v_org, v_contact);
        insert into public.lead_state (organization_id, contact_id) values (v_org, v_contact);
        insert into public.lead_state_transitions (organization_id, contact_id, from_stage, to_stage)
          values (v_org, v_contact, 'novo', 'contato');
        insert into public.metrics (organization_id, name, value) values (v_org, 'rls_debito', 1);
        insert into public.channel_knobs (organization_id, channel_session_id) values (v_org, v_sess);
        insert into public.pacing_ledger (organization_id, channel_session_id) values (v_org, v_sess);
        insert into public.outbound_copies (organization_id, channel_session_id, normalized_text, normalized_hash)
          values (v_org, v_sess, 'texto '||v_tag, 'hash-'||v_tag);
        insert into public.cron_jobs (organization_id, contact_id, kind, next_run_at)
          values (v_org, v_contact, 'at', now());
        insert into public.reentry_template_versions (organization_id, variants)
          values (v_org, array['v1']) returning id into v_ver;
        insert into public.reentry_template_pointers (organization_id, version_id) values (v_org, v_ver);
        insert into public.lead_notes (organization_id, contact_id, headline, body)
          values (v_org, v_contact, 'nota', 'corpo');
        insert into public.skill_versions (organization_id, name, description, body)
          values (v_org, 'skill-'||v_tag, 'desc', 'body') returning id into v_ver;
        insert into public.skill_pointers (organization_id, name, version_id)
          values (v_org, 'skill-'||v_tag, v_ver);
        insert into public.promise_table_versions (organization_id, "values")
          values (v_org, '[]'::jsonb) returning id into v_ver;
        insert into public.promise_table_pointers (organization_id, version_id) values (v_org, v_ver);
        insert into public.disclosure_template_versions (organization_id, body)
          values (v_org, 'texto') returning id into v_ver;
        insert into public.disclosure_template_pointers (organization_id, version_id) values (v_org, v_ver);
        insert into public.before_send_traces (organization_id, job_id, channel_session_id, trace)
          values (v_org, v_job, v_sess, '{}'::jsonb);
        insert into public.flywheel_judge_verdicts
          (organization_id, dataset, trace_id, dimension, verdict, option_order, judge_family, model, run_id)
          values (v_org, 'ds', 'trace-'||v_tag, 'dim', 'yes', 'ab', 'family', 'model', gen_random_uuid());
        insert into public.flywheel_distiller_proposals
          (organization_id, run_id, dataset, type, target, content, evidence)
          values (v_org, gen_random_uuid(), 'ds', 'playbook_bullet', 'alvo', 'conteudo', '{}'::jsonb);
        insert into public.judge_alignment_pool (organization_id, dataset, trace_id, dimension)
          values (v_org, 'ds', 'trace-'||v_tag, 'dim');
        insert into public.reentry_knob_versions (organization_id, knobs)
          values (v_org, '{}'::jsonb) returning id into v_ver;
        insert into public.reentry_knob_pointers (organization_id, version_id) values (v_org, v_ver);
        insert into public.conversation_notes (organization_id, conversation_id, body)
          values (v_org, v_conv, 'nota interna');
        insert into public.ai_provider_credentials
          (organization_id, provider, label, api_key_encrypted, api_key_iv, api_key_tag, api_key_last4)
          values (v_org, 'anthropic', 'chave', '\\x01'::bytea, '\\x02'::bytea, '\\x03'::bytea, '0000');
        insert into public.api_tokens (organization_id, created_by, name, prefix, token_hash)
          values (v_org, v_user, 'tok', 'nx', decode(md5(v_tag), 'hex'));
        insert into public.message_templates (organization_id, title, body)
          values (v_org, 'tpl', 'corpo');
        insert into public.crm_lead_scores (organization_id, lead_id) values (v_org, v_lead);
        insert into public.tenant_integrations
          (organization_id, provider, oauth_access_token_encrypted, webhook_secret_encrypted)
          values (v_org, 'nuvemshop', '\\x01'::bytea, '\\x02'::bytea);
      end loop;
    end
    $seed$;
  `);
}

beforeAll(() => {
  seed();
});

describe("F-17 — isolamento cross-tenant das tabelas que saíram do débito", () => {
  for (const tabela of TABELAS_PROVADAS_AQUI) {
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

  it("o seed realmente gravou nas duas orgs (guarda de vacuidade)", () => {
    const orgs = Number(
      sql(
        `select count(distinct organization_id) from public.llm_calls
          where organization_id in ('${ORG_D}','${ORG_E}');`,
      ),
    );
    expect(orgs).toBe(2);
  });
});
