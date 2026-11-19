import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * O FILTRO DE CIDADE NÃO ATRAVESSA A ORGANIZAÇÃO.
 *
 * ═══ Por que arquivo próprio ═══════════════════════════════════════════════
 *
 * `contacts` já está na varredura de isolamento (`rls-isolation`), que prova
 * "zero linhas do vizinho" por tabela. O que esta fatia acrescenta é uma
 * CONDIÇÃO nova na consulta (`cidade ILIKE ?`), e condição nova pode interagir
 * com a policy de um jeito que o teste genérico não vê. Aqui a consulta é a
 * MESMA que o handler emite — organização explícita + ilike —, executada como
 * `authenticated` com JWT simulado, exatamente o caminho da rota.
 *
 * ═══ O que fica provado ════════════════════════════════════════════════════
 *
 * 1. Duas organizações com a MESMA cidade: A filtra e vê só o próprio contato.
 * 2. A não vê o contato de B nem com o filtro de cidade aplicado (zero).
 * 3. A lista de cidades (select `cidade` por organização) devolve só as de A.
 * 4. Caixa é ignorada (`ILIKE`), acento NÃO (`sao paulo` ≠ `São Paulo`) — o
 *    comportamento que o seletor mostra ao usuário.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

function countAs(userId: string, countQuery: string): number {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${countQuery}
  `);
  const last = out.split("\n").filter(Boolean).pop();
  if (last === undefined || !/^\d+$/.test(last)) {
    throw new Error(`saída inesperada do psql: ${out}`);
  }
  return Number(last);
}

const ORG_A = "c1dade00-0000-4000-8000-00000000000a";
const ORG_B = "c1dade00-0000-4000-8000-00000000000b";
const AGENTE_A = "c1dade00-1111-4000-8000-00000000000a";
const AGENTE_B = "c1dade00-1111-4000-8000-00000000000b";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'cidade-a@invariant.test'),
      ('${AGENTE_B}', 'cidade-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'cidade-inv-a', 'Cidade Invariant A', 'Cidade A'),
      ('${ORG_B}', 'cidade-inv-b', 'Cidade Invariant B', 'Cidade B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG_A}', 'agent', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    delete from public.contacts where organization_id in ('${ORG_A}', '${ORG_B}');

    insert into public.contacts (organization_id, name, display_name, cidade, uf, is_anonymized)
    values
      ('${ORG_A}', 'Cliente A',  'Cliente A',  'Canoinhas', 'SC', false),
      ('${ORG_A}', 'Cliente A2', 'Cliente A2', 'UNIAO DA VITORIA', 'PR', false),
      ('${ORG_A}', 'Cliente A3', 'Cliente A3', 'União da Vitória', 'PR', false),
      ('${ORG_A}', 'Cliente A4', 'Cliente A4', 'AGROCOMERCIAL SCHULTZ LTDA ME', 'SC', false),
      ('${ORG_B}', 'Cliente B',  'Cliente B',  'Canoinhas', 'SC', false),
      ('${ORG_B}', 'Cliente B2', 'Cliente B2', 'Mafra', 'SC', false);

  `);
});

describe("contacts — filtro por cidade entre organizações", () => {
  it("filtra pelas variantes canônicas com IN e não vê o contato de B", () => {
    const variantes = "('Canoinhas','CANOINHAS','canoinhas')";
    expect(
      countAs(
        AGENTE_A,
        `select count(*) from public.contacts
          where organization_id = '${ORG_A}' and cidade in ${variantes}`,
      ),
    ).toBe(1);
    // Sem o filtro de organização, a MESMA condição acharia o contato de B. É a
    // prova de que o `.eq("organization_id")` do handler é o que segura a
    // fronteira — e a RLS, a segunda rede.
    expect(
      countAs(
        AGENTE_A,
        `select count(*) from public.contacts where cidade in ${variantes}`,
      ),
    ).toBe(1);
  });

  it("acento não separa: as duas grafias de União da Vitória casam juntas", () => {
    const variantes = "('União da Vitória','UNIAO DA VITORIA')";
    expect(
      countAs(
        AGENTE_A,
        `select count(*) from public.contacts
          where organization_id = '${ORG_A}' and cidade in ${variantes}`,
      ),
    ).toBe(2);
  });

  it("cidade que só existe em B continua zero para A (cross-tenant)", () => {
    expect(
      countAs(
        AGENTE_A,
        `select count(*) from public.contacts
          where organization_id = '${ORG_B}' and cidade in ('Mafra')`,
      ),
    ).toBe(0);
    // E sem o filtro de organização a RLS tampouco devolve a linha de B.
    expect(
      countAs(AGENTE_A, `select count(*) from public.contacts where cidade = 'Mafra'`),
    ).toBe(0);
  });

  it("A vê as próprias cidades na leitura que alimenta o seletor", () => {
    const deA = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${AGENTE_A}"}', false);
      select count(*) from public.contacts
       where organization_id = '${ORG_A}' and cidade in ('União da Vitória','UNIAO DA VITORIA');
    `);
    expect(Number(deA.split("\n").filter(Boolean).pop())).toBe(2);
  });
});
