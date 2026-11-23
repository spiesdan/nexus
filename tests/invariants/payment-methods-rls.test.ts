/**
 * FORMAS DE PAGAMENTO NÃO VAZAM ENTRE ORGANIZAÇÕES.
 *
 * A configuração é tenant-aware e a tela de settings é alcançável por qualquer
 * membro. Se a RLS falhar, um manager da org A vê — e pior, EDITA — as formas
 * da org B. Aqui se mede o caminho real: `set role authenticated` + JWT,
 * connects como postgres mediria nada (`rolbypassrls`).
 *
 * Quatro eixos:
 * 1. controle positivo — membro da org A lê a própria;
 * 2. isolamento — zero linhas da org B;
 * 3. escrita — agent NÃO insere, manager insere na própria org;
 * 4. anon — zero linhas.
 */
import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

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

const ORG_A = "ca1e0da2-4400-4000-8000-00000000000a";
const ORG_B = "ca1e0da2-4400-4000-8000-00000000000b";
const AGENTE_A = "ca1e0da2-4411-4000-8000-00000000000a";
const GESTOR_A = "ca1e0da2-4411-4000-8000-00000000000b";
const AGENTE_B = "ca1e0da2-4411-4000-8000-00000000000c";

function como(userId: string, comando: string): string {
  return sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${comando}
  `);
}

function contar(userId: string, org: string): number {
  const out = como(
    userId,
    `select count(*) from public.commercial_payment_methods where organization_id = '${org}'::uuid;`,
  );
  const linhas = out.split("\n").filter(Boolean);
  const ultimo = linhas[linhas.length - 1];
  if (!ultimo || !/^\d+$/.test(ultimo)) throw new Error(`saída inesperada: ${out}`);
  return Number(ultimo);
}

function inserir(userId: string, org: string, codigo: string): boolean {
  try {
    como(
      userId,
      `insert into public.commercial_payment_methods
         (organization_id, tipo, codigo, nome, tpag)
       values ('${org}'::uuid, 'forma', '${codigo}', 'Teste do invariante', '17');`,
    );
    return true;
  } catch {
    return false;
  }
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'pm-agente-a@invariant.test'),
      ('${GESTOR_A}', 'pm-gestor-a@invariant.test'),
      ('${AGENTE_B}', 'pm-agente-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'pm-inv-a', 'Pagamentos Invariant A', 'Pagamentos A'),
      ('${ORG_B}', 'pm-inv-b', 'Pagamentos Invariant B', 'Pagamentos B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG_A}', 'agent', now()),
      ('${GESTOR_A}', '${ORG_A}', 'manager', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.commercial_payment_methods (organization_id, tipo, codigo, nome, tpag, dias_prazo)
    select v.org, 'prazo', 'invariante-prazo', 'Prazo do invariante', null, 30
      from (values ('${ORG_A}'::uuid), ('${ORG_B}'::uuid)) as v(org)
     where not exists (
       select 1 from public.commercial_payment_methods p
        where p.organization_id = v.org and p.codigo = 'invariante-prazo'
     );
  `);
});

describe("RLS de commercial_payment_methods", () => {
  it("1. membro lê a própria organização", () => {
    expect(contar(AGENTE_A, ORG_A)).toBeGreaterThan(0);
  });

  it("2. membro não lê a organização vizinha", () => {
    expect(contar(AGENTE_A, ORG_B)).toBe(0);
    expect(contar(AGENTE_B, ORG_A)).toBe(0);
  });

  it("3. agent não escreve; manager escreve na própria org", () => {
    expect(inserir(AGENTE_A, ORG_A, "agente-nao-pode")).toBe(false);
    expect(inserir(GESTOR_A, ORG_A, "gestor-pode")).toBe(true);
    expect(contar(GESTOR_A, ORG_A)).toBeGreaterThan(0);
  });

  it("4. anon não lê", () => {
    let out = "";
    let negado = false;
    try {
      out = sql(`
        set role anon;
        select set_config('request.jwt.claims', '', false);
        select count(*) from public.commercial_payment_methods;
      `);
    } catch (erro) {
      // "permission denied" é a prova mais forte: o anon nem chega a contar.
      negado = String(erro).includes("permission denied");
    }
    expect(negado || out === "0").toBe(true);
  });
});
