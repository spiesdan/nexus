import { beforeAll, describe, expect, it } from "vitest";

import { columnExists, countAs, tableExists, writeCountAs } from "./gov-helpers";
import { sql } from "./gov-helpers";

/**
 * 0311 — a memória de entrada do endereço é do tenant, e só dele.
 *
 * `endereco_entradas` guarda a porta de um endereço físico ("portão azul, pelos
 * fundos"). É dado operacional do cliente: a entrada marcada pela org A não
 * pode aparecer na org B nem por leitura direta no PostgREST. Esta suíte prova
 * o isolamento com claims simulados — a mesma régua de `rls-isolation`, para a
 * tabela nova.
 *
 * Namespace 99999999 = próprio do arquivo.
 */

const ORG_A = "99999999-0311-4000-8000-000000000001";
const ORG_B = "99999999-0311-4000-8000-000000000002";
const AGENT_A = "99999999-0311-4111-8000-000000000001";
const AGENT_B = "99999999-0311-4111-8000-000000000002";
const VIEWER_A = "99999999-0311-4111-8000-000000000003";
const ADMIN_A = "99999999-0311-4111-8000-000000000004";

const ENTRADA_A = "99999999-0311-4222-8000-000000000001";
const ENTRADA_B = "99999999-0311-4222-8000-000000000002";

const DESTINO_A = "99999999-0311-4333-8000-000000000001";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}', 'entrada-agent-a@invariant.test'),
      ('${AGENT_B}', 'entrada-agent-b@invariant.test'),
      ('${VIEWER_A}', 'entrada-viewer-a@invariant.test'),
      ('${ADMIN_A}', 'entrada-admin-a@invariant.test')
    on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name)
      values
        ('${ORG_A}', 'entrada-org-a', 'Entrada Org A', 'Entrada Org A'),
        ('${ORG_B}', 'entrada-org-b', 'Entrada Org B', 'Entrada Org B')
      on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values
        ('${AGENT_A}', '${ORG_A}', 'agent', now()),
        ('${VIEWER_A}', '${ORG_A}', 'viewer', now()),
        ('${ADMIN_A}', '${ORG_A}', 'admin', now()),
        ('${AGENT_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.endereco_entradas
      (id, organization_id, endereco_normalizado, endereco, latitude, longitude, referencia)
    values
      ('${ENTRADA_A}', '${ORG_A}', 'RUA X SN CENTRO CANOINHAS PR',
       'Rua X, S/N — Centro, Canoinhas/PR', -26.17, -50.39, 'portão azul'),
      ('${ENTRADA_B}', '${ORG_B}', 'RUA Y SN CENTRO MAFRA SC',
       'Rua Y, S/N — Centro, Mafra/SC', -26.11, -49.80, 'entrada pelos fundos')
    on conflict do nothing;

    insert into public.shipment_destinations
      (id, organization_id, chave, endereco, numero, geo_status)
    values
      ('${DESTINO_A}', '${ORG_A}', 'destino-entrada-a', 'Rua X, S/N — Centro, Canoinhas/PR', 'S/N', 'pendente')
    on conflict do nothing;
  `);
});

describe("0311 — endereco_entradas", () => {
  it("a tabela e as colunas do destino existem", () => {
    expect(tableExists("endereco_entradas")).toBe(true);
    expect(columnExists("shipment_destinations", "entrada_id")).toBe(true);
    expect(columnExists("shipment_destinations", "entrada_confirmada_em")).toBe(true);
    expect(columnExists("shipment_destinations", "entrada_confirmada_por")).toBe(true);
  });

  it("agent lê a entrada da própria org e NENHUMA da outra", () => {
    expect(countAs(AGENT_A, "select count(*) from public.endereco_entradas")).toBe(1);
    expect(countAs(AGENT_B, "select count(*) from public.endereco_entradas")).toBe(1);
    expect(
      countAs(AGENT_A, `select count(*) from public.endereco_entradas where id = '${ENTRADA_B}'`),
    ).toBe(0);
  });

  it("agent não escreve entrada na org alheia", () => {
    const linhas = writeCountAs(
      AGENT_B,
      `insert into public.endereco_entradas
         (organization_id, endereco_normalizado, latitude, longitude)
       values ('${ORG_A}', 'RUA Z SN', -26.1, -50.1)`,
    );
    expect(linhas).toBe(0);
  });

  it("viewer não escreve nem na própria org", () => {
    const linhas = writeCountAs(
      VIEWER_A,
      `insert into public.endereco_entradas
         (organization_id, endereco_normalizado, latitude, longitude)
       values ('${ORG_A}', 'RUA NOVA SN', -26.1, -50.1)`,
    );
    expect(linhas).toBe(0);
  });

  it("agent grava na própria org", () => {
    const linhas = writeCountAs(
      AGENT_A,
      `insert into public.endereco_entradas
         (organization_id, endereco_normalizado, latitude, longitude)
       values ('${ORG_A}', 'RUA NOVA SN CENTRO', -26.1, -50.1)`,
    );
    expect(linhas).toBe(1);
    // Limpeza: a probe não pode vazar para outro arquivo do harness.
    sql(`delete from public.endereco_entradas where endereco_normalizado = 'RUA NOVA SN CENTRO';`);
  });

  it("o mesmo endereço não entra duas vezes na mesma org (a chave é a memória)", () => {
    const duplicou = writeCountAs(
      ADMIN_A,
      `insert into public.endereco_entradas
         (organization_id, endereco_normalizado, latitude, longitude)
       values ('${ORG_A}', 'RUA X SN CENTRO CANOINHAS PR', -26.18, -50.40)
       on conflict (organization_id, endereco_normalizado) do nothing`,
    );
    expect(duplicou).toBe(0);
    // E a memória que já existia continua com o ponto original.
    expect(
      countAs(
        ADMIN_A,
        `select count(*) from public.endereco_entradas
          where endereco_normalizado = 'RUA X SN CENTRO CANOINHAS PR' and latitude = -26.17`,
      ),
    ).toBe(1);
  });

  it("o destino aponta para a entrada e não perde a coluna de confirmação", () => {
    const aplicou = writeCountAs(
      AGENT_A,
      `update public.shipment_destinations
          set entrada_id = '${ENTRADA_A}', geo_fonte = 'entrada', geo_status = 'ok'
        where id = '${DESTINO_A}'`,
    );
    expect(aplicou).toBe(1);
    expect(
      countAs(
        AGENT_A,
        `select count(*) from public.shipment_destinations
          where id = '${DESTINO_A}' and entrada_id = '${ENTRADA_A}' and geo_fonte = 'entrada'`,
      ),
    ).toBe(1);
  });

  it("memória não se apaga por papel: não há policy de delete", () => {
    const apagou = writeCountAs(ADMIN_A, `delete from public.endereco_entradas where id = '${ENTRADA_A}'`);
    // Sem policy de DELETE, o RLS bloqueia (0 linhas). A entrada continua lá.
    expect(apagou).toBe(0);
    expect(countAs(ADMIN_A, `select count(*) from public.endereco_entradas where id = '${ENTRADA_A}'`)).toBe(1);
  });
});
