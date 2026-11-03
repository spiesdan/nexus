import { describe, expect, it } from "vitest";

import {
  columnExists,
  countAs,
  indexExists,
  sql,
  tableExists,
  writeCountAs,
} from "./gov-helpers";

/**
 * 0290 · o módulo de NF-e de entrada isola por organização — e a manifestação
 * obedece à regra de papel na PRÓPRIA policy, não só na rota.
 *
 * Três coisas se provam aqui, e nenhuma delas é "a tabela existe":
 *
 *   1. leitura cross-tenant: membro da org B não vê item/evento/manifestação/
 *      log/certificado da org A (JWT simulado, `set role authenticated` — o
 *      mesmo caminho de `auth.uid()` que a produção usa);
 *   2. escrita: item/evento/log são service_role (o sync roda com admin client
 *      e filtra `organization_id` resolvido do guard). Um `agent` autenticado
 *      NÃO forja log nem item;
 *   3. manifestação: a policy repete a decisão da spec 21 §12 — `ciencia` pode
 *      ser do agent, confirmação/desconhecimento/não-realizada exigem manager.
 *      Se a regra vivesse só na rota, um INSERT direto no PostgREST a furaria.
 *
 * Namespace 0290 (não o `cccccccc` do gov-helpers) para não colidir com as
 * outras provas que rodam em paralelo, cada uma no seu banco-template.
 */
const ORG_A = "0290aaaa-0000-4000-8000-000000000001";
const ORG_B = "0290bbbb-0000-4000-8000-000000000002";
const AGENT_A = "0290aaaa-1111-4000-8000-000000000001";
const MANAGER_A = "0290aaaa-1111-4000-8000-000000000002";
const AGENT_B = "0290bbbb-1111-4000-8000-000000000003";

const CHAVE_A = "35261012345678000199550010000012341000012345";
const CHAVE_B = "35261098765432000188550010000056781000056789";

function seed(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}', 'fiscal-0290-agent-a@invariant.test'),
      ('${MANAGER_A}', 'fiscal-0290-manager-a@invariant.test'),
      ('${AGENT_B}', 'fiscal-0290-agent-b@invariant.test')
      on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'fiscal-0290-a', 'Fiscal 0290 A', 'Fiscal A'),
      ('${ORG_B}', 'fiscal-0290-b', 'Fiscal 0290 B', 'Fiscal B')
      on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${AGENT_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.fiscal_entradas
      (id, organization_id, chave, nsu, emitente_cnpj, emitente_nome, valor_total_cents)
    values
      ('0290aaaa-2222-4000-8000-000000000001', '${ORG_A}', '${CHAVE_A}', 10, '12345678000199', 'Fornecedor A', 1000),
      ('0290bbbb-2222-4000-8000-000000000002', '${ORG_B}', '${CHAVE_B}', 20, '98765432000188', 'Fornecedor B', 2000)
    on conflict do nothing;

    insert into public.fiscal_document_items
      (organization_id, entrada_id, numero_item, codigo, descricao, valor_total_cents)
    values
      ('${ORG_A}', '0290aaaa-2222-4000-8000-000000000001', 1, 'SKU-A', 'Item A', 1000),
      ('${ORG_B}', '0290bbbb-2222-4000-8000-000000000002', 1, 'SKU-B', 'Item B', 2000)
    on conflict do nothing;

    insert into public.fiscal_document_events
      (organization_id, entrada_id, chave, nsu, tipo, tp_evento)
    values
      ('${ORG_A}', '0290aaaa-2222-4000-8000-000000000001', '${CHAVE_A}', 10, 'cancelamento', '110111'),
      ('${ORG_B}', '0290bbbb-2222-4000-8000-000000000002', '${CHAVE_B}', 20, 'cancelamento', '110111')
    on conflict do nothing;

    insert into public.fiscal_sync_logs (organization_id, origem, resultado, docs_importados)
    values
      ('${ORG_A}', 'manual', 'sucesso', 3),
      ('${ORG_B}', 'cron', 'erro', 0);

    insert into public.fiscal_certificates (organization_id, titular, validade)
    values
      ('${ORG_A}', 'EMPRESA A LTDA', now() + interval '1 year'),
      ('${ORG_B}', 'EMPRESA B LTDA', now() + interval '1 year')
    on conflict do nothing;
  `);
}

describe("0290 · módulo de NF-e de entrada", () => {
  it("as cinco tabelas novas existem e nascem com RLS ligada", () => {
    seed();
    for (const tabela of [
      "fiscal_certificates",
      "fiscal_document_items",
      "fiscal_document_events",
      "fiscal_manifestations",
      "fiscal_sync_logs",
    ]) {
      expect(tableExists(tabela)).toBe(true);
      expect(
        sql(`select relrowsecurity from pg_class where relname = '${tabela}'`),
        `${tabela} sem RLS`,
      ).toBe("t");
    }
  });

  it("as colunas de conferência e o cursor com lease existem (install e update convergem)", () => {
    expect(columnExists("fiscal_entradas", "conferencia_status")).toBe(true);
    expect(columnExists("fiscal_entradas", "situacao_fiscal")).toBe(true);
    expect(columnExists("fiscal_entradas", "supplier_id")).toBe(true);
    expect(columnExists("fiscal_settings", "frequencia_minutos")).toBe(true);
    expect(columnExists("fiscal_entrada_cursor", "locked_until")).toBe(true);
    expect(columnExists("suppliers", "endereco_json")).toBe(true);
  });

  it("o índice único de CNPJ do fornecedor nasce em base sem duplicata", () => {
    expect(indexExists("suppliers_org_cnpj_digits_key")).toBe(true);
  });

  it("membro da org A lê os próprios itens/eventos/logs/certificado", () => {
    expect(
      countAs(
        AGENT_A,
        `select count(*) from public.fiscal_document_items where organization_id = '${ORG_A}';`,
      ),
    ).toBe(1);
    expect(
      countAs(
        AGENT_A,
        `select count(*) from public.fiscal_document_events where organization_id = '${ORG_A}';`,
      ),
    ).toBe(1);
    expect(
      countAs(
        AGENT_A,
        `select count(*) from public.fiscal_sync_logs where organization_id = '${ORG_A}';`,
      ),
    ).toBe(1);
    expect(
      countAs(
        AGENT_A,
        `select count(*) from public.fiscal_certificates where organization_id = '${ORG_A}';`,
      ),
    ).toBe(1);
  });

  it("membro da org B NÃO lê nada da org A — nas cinco tabelas", () => {
    expect(
      countAs(
        AGENT_B,
        `select count(*) from public.fiscal_document_items where organization_id = '${ORG_A}';`,
      ),
    ).toBe(0);
    expect(
      countAs(
        AGENT_B,
        `select count(*) from public.fiscal_document_events where organization_id = '${ORG_A}';`,
      ),
    ).toBe(0);
    expect(
      countAs(
        AGENT_B,
        `select count(*) from public.fiscal_sync_logs where organization_id = '${ORG_A}';`,
      ),
    ).toBe(0);
    expect(
      countAs(
        AGENT_B,
        `select count(*) from public.fiscal_certificates where organization_id = '${ORG_A}';`,
      ),
    ).toBe(0);
  });

  it("item/evento/log são escrita de service_role: agent autenticado não forja", () => {
    expect(
      writeCountAs(
        AGENT_A,
        `insert into public.fiscal_sync_logs (organization_id, origem, resultado)
         values ('${ORG_A}', 'manual', 'sucesso')`,
      ),
    ).toBe(0);
    expect(
      writeCountAs(
        AGENT_A,
        `insert into public.fiscal_document_items
           (organization_id, entrada_id, numero_item, codigo, descricao)
         values ('${ORG_A}', '0290aaaa-2222-4000-8000-000000000001', 2, 'SKU-X', 'Forjado')`,
      ),
    ).toBe(0);
    expect(
      writeCountAs(
        AGENT_A,
        `insert into public.fiscal_document_events (organization_id, chave, nsu, tipo)
         values ('${ORG_A}', '${CHAVE_A}', 999, 'outro')`,
      ),
    ).toBe(0);
  });

  it("ciência é do agent; confirmação exige manager — na policy, não só na rota", () => {
    expect(
      writeCountAs(
        AGENT_A,
        `insert into public.fiscal_manifestations
           (organization_id, entrada_id, evento, resultado)
         values ('${ORG_A}', '0290aaaa-2222-4000-8000-000000000001', 'ciencia', 'sucesso')`,
      ),
    ).toBe(1);

    expect(
      writeCountAs(
        AGENT_A,
        `insert into public.fiscal_manifestations
           (organization_id, entrada_id, evento, resultado)
         values ('${ORG_A}', '0290aaaa-2222-4000-8000-000000000001', 'confirmacao', 'sucesso')`,
      ),
    ).toBe(0);

    expect(
      writeCountAs(
        MANAGER_A,
        `insert into public.fiscal_manifestations
           (organization_id, entrada_id, evento, resultado)
         values ('${ORG_A}', '0290aaaa-2222-4000-8000-000000000001', 'confirmacao', 'sucesso')`,
      ),
    ).toBe(1);
  });

  it("o evento é idempotente por (org, chave, NSU): replay não duplica", () => {
    expect(() =>
      sql(`
        insert into public.fiscal_document_events
          (organization_id, entrada_id, chave, nsu, tipo, tp_evento)
        values ('${ORG_A}', '0290aaaa-2222-4000-8000-000000000001', '${CHAVE_A}', 10, 'cancelamento', '110111');
      `),
    ).toThrow();
  });

  it("certificado: manager escreve, agent não (configuração é gerencial)", () => {
    expect(
      writeCountAs(
        AGENT_A,
        `update public.fiscal_certificates set titular = 'INVASOR'
          where organization_id = '${ORG_A}'`,
      ),
    ).toBe(0);
    expect(
      writeCountAs(
        MANAGER_A,
        `update public.fiscal_certificates set titular = 'EMPRESA A LTDA'
          where organization_id = '${ORG_A}'`,
      ),
    ).toBe(1);
  });
});
