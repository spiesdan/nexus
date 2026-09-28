import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * G1-02 — RLS isolation invariant.
 *
 * Runs against the ephemeral Postgres container started by scripts/test-db.sh
 * (baseline.sql already applied). Seeds 2 orgs + 1 user each, then proves that
 * a user of org A sees ZERO rows of org B in conversations / messages /
 * contacts / crm_leads under RLS, with JWT claims simulated via
 * set_config('request.jwt.claims', ...) — the same auth.uid() /
 * fn_user_org_ids() path production policies use.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — run this suite via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

/** Runs a SQL script in ONE psql session inside the container; returns stdout (tuples-only). */
function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-f",
      "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

// Fixed UUIDs make the seed idempotent (on conflict do nothing).
const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const USER_A = "aaaaaaaa-1111-4000-8000-000000000001";
const USER_B = "bbbbbbbb-1111-4000-8000-000000000002";
const SESS_A = "aaaaaaaa-2222-4000-8000-000000000001";
const SESS_B = "bbbbbbbb-2222-4000-8000-000000000002";

/**
 * Runs SELECTs as the `authenticated` role with the given user's JWT claims,
 * exactly how PostgREST/Supabase set them: session role + request.jwt.claims.
 */
function countAs(userId: string, countQuery: string): number {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${countQuery}
  `);
  // Output lines: set_config echo, then the count (last line).
  const lines = out.split("\n");
  const last = lines[lines.length - 1];
  if (last === undefined || !/^\d+$/.test(last)) {
    throw new Error(`unexpected psql output: ${out}`);
  }
  return Number(last);
}

function seedOrg(org: string, user: string, sess: string, tag: string): string {
  // No real PII: synthetic emails/names only (LGPD).
  return `
    insert into auth.users (id, email) values ('${user}', 'rls-${tag}@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${org}', 'rls-inv-${tag}', 'RLS Invariant ${tag}', 'RLS ${tag}')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${user}', '${org}', 'agent', now())
      on conflict do nothing;
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values ('${sess}', '${org}', 'rls-inv-${tag}', '\\x00'::bytea)
      on conflict (id) do nothing;
  `;
}

beforeAll(() => {
  sql(seedOrg(ORG_A, USER_A, SESS_A, "a") + seedOrg(ORG_B, USER_B, SESS_B, "b"));
  // Contact → conversation → message + pipeline → stage → lead, per org.
  sql(`
    do $seed$
    declare
      v_org uuid;
      v_sess uuid;
      v_contact uuid;
      v_conv uuid;
      v_pipe uuid;
      v_stage uuid;
      v_prod uuid;
      v_ord uuid;
      v_cat uuid;
      v_pt uuid;
      v_shi uuid;
      v_inv uuid;
      v_recv uuid;
      v_search uuid;
      v_prospect uuid;
      v_camp uuid;
      v_compra uuid;
      v_tag text;
      v_chave text;
    begin
      foreach v_org in array array['${ORG_A}'::uuid, '${ORG_B}'::uuid] loop
        select id into v_sess from public.channel_sessions where organization_id = v_org limit 1;

        select id into v_contact from public.contacts
          where organization_id = v_org and display_name = 'RLS Invariant Contact';
        if v_contact is null then
          insert into public.contacts (organization_id, display_name)
            values (v_org, 'RLS Invariant Contact') returning id into v_contact;
        end if;

        select id into v_conv from public.conversations
          where organization_id = v_org and contact_id = v_contact;
        if v_conv is null then
          insert into public.conversations (organization_id, contact_id, channel_session_id)
            values (v_org, v_contact, v_sess) returning id into v_conv;
        end if;

        if not exists (select 1 from public.messages where organization_id = v_org) then
          insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
            values (v_org, v_conv, v_sess, v_contact, 'text', 'inbound', 'rls invariant probe');
        end if;

        select id into v_pipe from public.crm_pipelines
          where organization_id = v_org and slug = 'rls-inv';
        if v_pipe is null then
          insert into public.crm_pipelines (organization_id, name, slug)
            values (v_org, 'RLS Invariant', 'rls-inv') returning id into v_pipe;
        end if;

        select id into v_stage from public.crm_stages
          where organization_id = v_org and pipeline_id = v_pipe and slug = 'novo';
        if v_stage is null then
          insert into public.crm_stages (organization_id, pipeline_id, name, slug, position)
            values (v_org, v_pipe, 'Novo', 'novo', 1000) returning id into v_stage;
        end if;

        if not exists (select 1 from public.crm_leads where organization_id = v_org) then
          insert into public.crm_leads (organization_id, pipeline_id, stage_id, title)
            values (v_org, v_pipe, v_stage, 'RLS invariant lead');
        end if;

        if not exists (select 1 from public.org_guardrail_layers where organization_id = v_org) then
          insert into public.org_guardrail_layers (organization_id, layer, enabled)
            values (v_org, 'jailbreak', true);
        end if;

        if not exists (select 1 from public.org_memory_versions where organization_id = v_org) then
          insert into public.org_memory_versions (organization_id, version_number, content)
            values (v_org, 1, 'RLS invariant memory doc');
        end if;

        if not exists (select 1 from public.org_memory_entries where organization_id = v_org) then
          insert into public.org_memory_entries (organization_id, title, body, source)
            values (v_org, 'RLS invariant entry', 'RLS invariant body', 'manual');
        end if;

        if not exists (select 1 from public.skill_activations where organization_id = v_org) then
          insert into public.skill_activations (organization_id, skill_name, trigger)
            values (v_org, 's', 'hard');
        end if;

        if not exists (select 1 from public.ai_routers where organization_id = v_org) then
          insert into public.ai_routers (organization_id, name, channel_session_id)
            values (v_org, 'RLS Invariant Router', v_sess);
        end if;

        if not exists (select 1 from public.ai_router_decisions where organization_id = v_org) then
          insert into public.ai_router_decisions (organization_id, outcome)
            values (v_org, 'no_match');
        end if;

        if not exists (select 1 from public.knowledge_searches where organization_id = v_org) then
          insert into public.knowledge_searches (organization_id, hits, top_score, threshold)
            values (v_org, 1, 0.81, 0.72);
        end if;

        -- contact_field_proposals (migration 0123): a fila guarda e-mail e
        -- telefone que o cliente DITOU na conversa — PII crua, e a tabela nasce
        -- com CRUD inteiro para "authenticated" (o ALTER DEFAULT PRIVILEGES do
        -- baseline vale para todo objeto criado no apêndice). A única coisa
        -- entre o tenant A e o e-mail do cliente do tenant B é a policy.
        if not exists (select 1 from public.contact_field_proposals where organization_id = v_org) then
          insert into public.contact_field_proposals
            (organization_id, contact_id, campo, valor_proposto, expires_at)
            values (v_org, v_contact, 'email', 'rls-invariant@exemplo.test', now() + interval '7 days');
        end if;

        if not exists (select 1 from public.catalog_products where organization_id = v_org) then
          insert into public.catalog_products
            (organization_id, codigo, nome, preco_cents)
            values (v_org, 'RLS-' || v_org::text, 'Produto de invariante', 100);
        end if;
        select id into v_prod from public.catalog_products where organization_id = v_org limit 1;

        if not exists (select 1 from public.push_subscriptions where organization_id = v_org) then
          insert into public.push_subscriptions
            (organization_id, user_id, endpoint, p256dh, auth)
            values (
              v_org,
              case when v_org = '${ORG_A}'::uuid then '${USER_A}'::uuid else '${USER_B}'::uuid end,
              'https://push.example.test/rls-' || v_org::text,
              'p256dh-rls',
              'auth-rls'
            );
        end if;

        -- migration 0225 — meta mensal da loja. A leitura é org-scoped sem
        -- gate de papel (o dashboard lê para todo viewer), então o agent
        -- semeado aqui serve para o controle positivo.
        if not exists (select 1 from public.commercial_goals where organization_id = v_org) then
          insert into public.commercial_goals (organization_id, ano_mes, valor_cents)
            values (v_org, '2026-09', 100000);
        end if;

        -- migration 0208 — contador do número do pedido (singleton por org).
        v_tag := case when v_org = '${ORG_A}'::uuid then 'a' else 'b' end;
        if not exists (select 1 from public.commercial_order_counters where organization_id = v_org) then
          insert into public.commercial_order_counters (organization_id)
            values (v_org);
        end if;

        -- Pedido + 1 item (o positive control precisa de linha em todas).
        if not exists (select 1 from public.commercial_orders where organization_id = v_org) then
          insert into public.commercial_orders (organization_id, numero, cliente_nome)
            values (v_org, 1, 'Cliente RLS Invariant') returning id into v_ord;
        end if;
        select id into v_ord from public.commercial_orders where organization_id = v_org limit 1;
        if not exists (select 1 from public.commercial_order_items where organization_id = v_org) then
          insert into public.commercial_order_items
            (organization_id, order_id, product_id, produto_codigo, produto_nome, quantidade, preco_unit_cents, subtotal_cents)
            values (v_org, v_ord, v_prod, 'RLS-' || v_tag, 'Item RLS Invariant', 1, 100, 100);
        end if;

        -- migration 0210 — categoria + tabela de preço + item ligando o produto.
        if not exists (select 1 from public.product_categories where organization_id = v_org) then
          insert into public.product_categories (organization_id, nome)
            values (v_org, 'Categoria RLS Invariant') returning id into v_cat;
        end if;
        if not exists (select 1 from public.price_tables where organization_id = v_org) then
          insert into public.price_tables (organization_id, nome)
            values (v_org, 'Tabela RLS Invariant') returning id into v_pt;
        end if;
        select id into v_pt from public.price_tables where organization_id = v_org limit 1;
        if not exists (select 1 from public.price_table_items where organization_id = v_org) then
          insert into public.price_table_items (organization_id, price_table_id, product_id)
            values (v_org, v_pt, v_prod);
        end if;

        -- migration 0212 — carga + romaneio + posição de GPS do roteirizador.
        if not exists (select 1 from public.commercial_shipment_counters where organization_id = v_org) then
          insert into public.commercial_shipment_counters (organization_id)
            values (v_org);
        end if;
        if not exists (select 1 from public.shipments where organization_id = v_org) then
          insert into public.shipments (organization_id, numero)
            values (v_org, 1) returning id into v_shi;
        end if;
        select id into v_shi from public.shipments where organization_id = v_org limit 1;
        if not exists (select 1 from public.shipment_orders where organization_id = v_org) then
          insert into public.shipment_orders (organization_id, shipment_id, order_id)
            values (v_org, v_shi, v_ord);
        end if;
        if not exists (select 1 from public.shipment_positions where organization_id = v_org) then
          insert into public.shipment_positions (organization_id, shipment_id, latitude, longitude)
            values (v_org, v_shi, -23.5505, -46.6333);
        end if;

        -- migration 0213 — fiscal settings (singleton) + invoice + evento+job.
        if not exists (select 1 from public.fiscal_settings where organization_id = v_org) then
          insert into public.fiscal_settings (organization_id)
            values (v_org);
        end if;
        if not exists (select 1 from public.invoices where organization_id = v_org) then
          insert into public.invoices (organization_id, serie, total_cents)
            values (v_org, '1', 1000) returning id into v_inv;
        end if;
        select id into v_inv from public.invoices where organization_id = v_org limit 1;
        if not exists (select 1 from public.fiscal_jobs where organization_id = v_org) then
          insert into public.fiscal_jobs (organization_id, invoice_id)
            values (v_org, v_inv);
        end if;
        if not exists (select 1 from public.fiscal_events where organization_id = v_org) then
          insert into public.fiscal_events (organization_id, invoice_id, tipo)
            values (v_org, v_inv, 'criada');
        end if;

        -- migration 0235 — inutilização + CFOP equivalente.
        if not exists (select 1 from public.fiscal_inutilizacoes where organization_id = v_org) then
          insert into public.fiscal_inutilizacoes (organization_id, serie, numero_inicial, numero_final, motivo)
            values (v_org, '1', 100, 101, 'Faixa de teste de invariante RLS');
        end if;
        if not exists (select 1 from public.fiscal_cfop_equivalentes where organization_id = v_org) then
          insert into public.fiscal_cfop_equivalentes (organization_id, cfop_origem, cfop_destino)
            values (v_org, '5102', '6108');
        end if;

        -- migration 0236 — nota de entrada + cursor + conta a pagar.
        v_chave := '3526' || lpad(case when v_org = '${ORG_A}'::uuid then '1' else '2' end, 40, '0');
        if not exists (select 1 from public.fiscal_entradas where organization_id = v_org) then
          insert into public.fiscal_entradas (organization_id, chave, nsu, emitente_cnpj, emitente_nome)
            values (v_org, v_chave, 42, '00000000000191', 'Fornecedor RLS Invariant');
        end if;
        if not exists (select 1 from public.fiscal_entrada_cursor where organization_id = v_org) then
          insert into public.fiscal_entrada_cursor (organization_id)
            values (v_org);
        end if;
        if not exists (select 1 from public.financial_pagaveis where organization_id = v_org) then
          insert into public.financial_pagaveis (organization_id, parcela_n, total_parcelas, valor_original_cents, vencimento)
            values (v_org, 1, 1, 1000, current_date + interval '30 days');
        end if;

        -- migration 0233 — contas a receber + pagamento.
        if not exists (select 1 from public.financial_receivables where organization_id = v_org) then
          insert into public.financial_receivables (organization_id, parcela_n, total_parcelas, valor_original_cents, vencimento)
            values (v_org, 1, 1, 1000, current_date + interval '30 days') returning id into v_recv;
        end if;
        select id into v_recv from public.financial_receivables where organization_id = v_org limit 1;
        if not exists (select 1 from public.financial_payments where organization_id = v_org) then
          insert into public.financial_payments (organization_id, receivable_id, valor_cents)
            values (v_org, v_recv, 1000);
        end if;

        -- migration 0218 — comprovante de entrega.
        if not exists (select 1 from public.shipment_proofs where organization_id = v_org) then
          insert into public.shipment_proofs (organization_id, shipment_id, order_id, storage_path)
            values (v_org, v_shi, v_ord, 'rls/' || v_tag || '/prova.jpg');
        end if;

        -- migration 0219 — foto do produto.
        if not exists (select 1 from public.product_images where organization_id = v_org) then
          insert into public.product_images (organization_id, product_id, storage_path)
            values (v_org, v_prod, 'rls/' || v_tag || '/prod.jpg');
        end if;

        -- migration 0220 — busca de prospecção + prospecto + resultado + campanha.
        if not exists (select 1 from public.prospecting_searches where organization_id = v_org) then
          insert into public.prospecting_searches (organization_id)
            values (v_org) returning id into v_search;
        end if;
        select id into v_search from public.prospecting_searches where organization_id = v_org limit 1;
        if not exists (select 1 from public.business_prospects where organization_id = v_org) then
          insert into public.business_prospects (organization_id, nome, nome_normalizado, provider)
            values (v_org, 'Prospecto RLS Invariant', 'prospecto-rls-invariant', 'google_places') returning id into v_prospect;
        end if;
        select id into v_prospect from public.business_prospects where organization_id = v_org limit 1;
        if not exists (select 1 from public.prospect_search_results where organization_id = v_org) then
          insert into public.prospect_search_results (search_id, prospect_id, organization_id)
            values (v_search, v_prospect, v_org);
        end if;
        if not exists (select 1 from public.prospecting_campaigns where organization_id = v_org) then
          insert into public.prospecting_campaigns (organization_id, nome)
            values (v_org, 'Campanha RLS Invariant') returning id into v_camp;
        end if;
        if not exists (select 1 from public.prospecting_settings where organization_id = v_org) then
          insert into public.prospecting_settings (organization_id)
            values (v_org);
        end if;

        -- migration 0221 — políticas comerciais (singleton).
        if not exists (select 1 from public.commercial_policies where organization_id = v_org) then
          insert into public.commercial_policies (organization_id)
            values (v_org);
        end if;

        -- migrations 0226/0227 — baixas de comissão e de título (por pedido).
        if not exists (select 1 from public.commercial_commission_baixas where organization_id = v_org) then
          insert into public.commercial_commission_baixas (organization_id, order_id, valor_cents)
            values (v_org, v_ord, 100);
        end if;
        if not exists (select 1 from public.commercial_titulo_baixas where organization_id = v_org) then
          insert into public.commercial_titulo_baixas (organization_id, order_id, parcela_n, valor_cents)
            values (v_org, v_ord, 1, 100);
        end if;

        -- migration 0229 — tarefa e atividade do vendedor.
        if not exists (select 1 from public.commercial_tasks where organization_id = v_org) then
          insert into public.commercial_tasks (organization_id, titulo)
            values (v_org, 'Tarefa RLS Invariant');
        end if;
        if not exists (select 1 from public.commercial_activities where organization_id = v_org) then
          insert into public.commercial_activities (organization_id)
            values (v_org);
        end if;

        -- migrations 0241–0243 — política de execução, razão de estoque, compras.
        if not exists (select 1 from public.ai_execution_policies where organization_id = v_org) then
          insert into public.ai_execution_policies (organization_id)
            values (v_org);
        end if;
        if not exists (select 1 from public.inventory_movements where organization_id = v_org) then
          insert into public.inventory_movements (organization_id, tipo, quantidade)
            values (v_org, 'ajuste', 1);
        end if;
        if not exists (select 1 from public.suppliers where organization_id = v_org) then
          insert into public.suppliers (organization_id, nome)
            values (v_org, 'Fornecedor RLS Invariant');
        end if;
        if not exists (select 1 from public.purchase_orders where organization_id = v_org) then
          insert into public.purchase_orders (organization_id, numero)
            values (v_org, 1) returning id into v_compra;
        end if;
        select id into v_compra from public.purchase_orders where organization_id = v_org limit 1;
        if not exists (select 1 from public.purchase_order_items where organization_id = v_org) then
          insert into public.purchase_order_items (organization_id, purchase_order_id, produto_codigo, produto_nome, quantidade, custo_unit_cents, subtotal_cents)
            values (v_org, v_compra, 'RLS', 'Item RLS Invariant', 1, 100, 100);
        end if;
        if not exists (select 1 from public.purchase_order_counters where organization_id = v_org) then
          insert into public.purchase_order_counters (organization_id)
            values (v_org);
        end if;
      end loop;
    end
    $seed$;
  `);
});

/**
 * ⚠️ LISTA FIXA — tabela tenant-aware nova que NÃO entrar aqui passa verde sem
 * RLS. Não existe varredura genérica do tipo "toda tabela com organization_id
 * tem relrowsecurity = true"; quem cria tabela nova acrescenta a linha aqui, no
 * MESMO commit da migration.
 *
 * E conferir o catálogo (`relrowsecurity`, `pg_policy` contendo o nome da
 * função) NÃO substitui este percurso: policy que diga
 * `organization_id in (select fn_user_org_ids()) or true` satisfaz as duas
 * checagens de catálogo e devolve a org inteira do vizinho. Medido — ver o
 * cabeçalho do caso de `contact_field_proposals` abaixo.
 */
export const TABLES = [
  "conversations",
  "messages",
  "contacts",
  "crm_leads",
  "org_memory_versions",
  "org_memory_entries",
  "skill_activations",
  "ai_routers",
  "ai_router_decisions",
  "knowledge_searches",
  // migration 0123 (spec 17 §4b) — guarda e-mail/telefone ditos na conversa.
  "contact_field_proposals",
  // migration 0142 — a escolha de camadas de segurança da organização. Entrou aqui
  // depois de uma auditoria medir que ela NÃO tinha prova comportamental nenhuma:
  // o teste de schema dela conecta como `postgres` (rolbypassrls = t), e com a policy
  // sabotada para `... or true` a suíte seguia 31/31 verde num banco em que o vizinho
  // lia e escrevia. É o modo de falha que o aviso acima descreve, encontrado vivo.
  "org_guardrail_layers",
  "push_subscriptions",
  // migration 0204 — o catálogo de produtos da loja. A leitura é org-scoped sem
  // gate de papel (o `agent` semeado aqui precisa ler para atender), e a ESCRITA
  // exige `manager` — esse segundo eixo é medido em
  // `tests/invariants/catalogo-so-gestor-muda-preco.test.ts`, não aqui.
  "catalog_products",
  // migration 0225 — metas mensais (o denominador do dashboard). Leitura
  // org-scoped sem gate de papel, mesma situação do catálogo acima: o `agent`
  // semeado serve para o controle positivo. A escrita `manager` é provada em
  // `tests/unit/commercial-goals-route.test.ts` (403 para viewer/agent).
  "commercial_goals",
  // ⚠️ `webhook_lead_captures` (migration 0174) NÃO entra nesta lista, e a
  // ausência é deliberada: a policy dela exige `manager`, e o usuário semeado
  // aqui é `agent` — o controle positivo falharia por ACERTO, e a "correção"
  // natural seria afrouxar a policy para caber no molde. A prova dela vive em
  // `tests/invariants/historico-de-captacao-rls.test.ts`, que mede as duas
  // direções MAIS o gate de papel (o `viewer` que não lê o formulário).
  // ── Ondas de setembro (0208–0236) — RLS molde 0204, leitura org-scoped sem
  // gate de papel: o `agent` semeado lê a própria org (positive control) e 0 da
  // vizinha. A escrita (agent+/manager+) é provada nos testes unitários/API de
  // cada módulo, não aqui. Seed em `beforeAll`.
  "commercial_order_counters",
  "commercial_orders",
  "commercial_order_items",
  "product_categories",
  "price_tables",
  "price_table_items",
  "shipments",
  "commercial_shipment_counters",
  "shipment_orders",
  "shipment_positions",
  "shipment_proofs",
  "product_images",
  "fiscal_settings",
  "invoices",
  "fiscal_jobs",
  "fiscal_events",
  "fiscal_inutilizacoes",
  "fiscal_cfop_equivalentes",
  "fiscal_entradas",
  "fiscal_entrada_cursor",
  "financial_pagaveis",
  "financial_receivables",
  "financial_payments",
  "prospecting_searches",
  "business_prospects",
  "prospect_search_results",
  "prospecting_campaigns",
  "prospecting_settings",
  "commercial_policies",
  "commercial_commission_baixas",
  "commercial_titulo_baixas",
  "commercial_tasks",
  "commercial_activities",
  // migrations 0241–0243 — política de execução, razão de estoque, compras.
  // Mesmo molde: leitura org-scoped sem gate de papel; escrita agent+
  // provada nas rotas. Seed em `beforeAll`.
  "ai_execution_policies",
  "inventory_movements",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
  "purchase_order_counters",
] as const;

describe("RLS tenant isolation (fn_user_org_ids pattern)", () => {
  for (const table of TABLES) {
    it(`user of org A reads 0 rows of org B in ${table}`, () => {
      const crossTenant = countAs(
        USER_A,
        `select count(*) from public.${table} where organization_id = '${ORG_B}';`,
      );
      expect(crossTenant).toBe(0);
    });

    it(`user of org A still reads their own org rows in ${table} (positive control)`, () => {
      const ownRows = countAs(
        USER_A,
        `select count(*) from public.${table} where organization_id = '${ORG_A}';`,
      );
      expect(ownRows).toBeGreaterThanOrEqual(1);
    });
  }

  it("superuser sees both orgs (seed sanity: cross-tenant rows really exist)", () => {
    const total = Number(
      sql(
        `select count(distinct organization_id) from public.contacts where organization_id in ('${ORG_A}','${ORG_B}');`,
      ),
    );
    expect(total).toBe(2);
  });
});
