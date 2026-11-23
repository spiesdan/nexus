/**
 * GASTO DE MÍDIA LANÇADO À MÃO NÃO VAZA ENTRE ORGANIZAÇÕES.
 *
 * A tela de campanha mostra orçado × gasto por campanha. Se a RLS falhar,
 * um membro da org A vê (e lança) gasto na campanha da org B, e o painel
 * dele bloqueia por um orçamento que não é o dele. Quatro eixos, com
 * `set role authenticated` + JWT — postgres mediria nada (`rolbypassrls`).
 */
import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

const ORG_A = "ca1e0da2-5500-4000-8000-00000000000a";
const ORG_B = "ca1e0da2-5500-4000-8000-00000000000b";
const AGENTE_A = "ca1e0da2-5511-4000-8000-00000000000a";
const AGENTE_B = "ca1e0da2-5511-4000-8000-00000000000b";
const VISITANTE = "ca1e0da2-5511-4000-8000-00000000000c";

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
    `select count(*) from public.prospecting_campaign_spend where organization_id = '${org}'::uuid;`,
  );
  const linhas = out.split("\n").filter(Boolean);
  const ultimo = linhas[linhas.length - 1];
  if (!ultimo || !/^\d+$/.test(ultimo)) throw new Error(`saída inesperada: ${out}`);
  return Number(ultimo);
}

function lancar(userId: string, org: string, valor: number): boolean {
  // A campanha é lida como postgres: se o `select` rodasse como authenticated,
  // a RLS da campanha da outra org devolveria ZERO linhas e o `insert ... select`
  // gravaria nada SEM ERRO — falso positivo clássico neste tipo de prova.
  const campanha = sql(
    `select id from public.prospecting_campaigns where organization_id = '${org}'::uuid limit 1;`,
  );
  if (!campanha) return false;
  const antes = Number(
    sql(`select count(*) from public.prospecting_campaign_spend where organization_id = '${org}'::uuid;`),
  );
  try {
    como(
      userId,
      `insert into public.prospecting_campaign_spend
         (organization_id, campaign_id, valor_cents, observacao, autor_id)
       values ('${org}'::uuid, '${campanha}'::uuid, ${valor}, 'lançamento do invariante', '${userId}'::uuid);`,
    );
  } catch {
    return false;
  }
  const depois = Number(
    sql(`select count(*) from public.prospecting_campaign_spend where organization_id = '${org}'::uuid;`),
  );
  return depois > antes;
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'spend-agente-a@invariant.test'),
      ('${AGENTE_B}', 'spend-agente-b@invariant.test'),
      ('${VISITANTE}', 'spend-sem-org@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'spend-inv-a', 'Spend Invariant A', 'Spend A'),
      ('${ORG_B}', 'spend-inv-b', 'Spend Invariant B', 'Spend B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG_A}', 'agent', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.prospecting_campaigns (organization_id, nome)
    select v.org, 'Campanha do invariante de gasto'
      from (values ('${ORG_A}'::uuid), ('${ORG_B}'::uuid)) as v(org)
     where not exists (
       select 1 from public.prospecting_campaigns c where c.organization_id = v.org
     );

    insert into public.prospecting_campaign_spend
      (organization_id, campaign_id, valor_cents, observacao)
    select v.org, c.id, 1250, 'semente do invariante'
      from (values ('${ORG_A}'::uuid), ('${ORG_B}'::uuid)) as v(org)
      join public.prospecting_campaigns c on c.organization_id = v.org
     where not exists (
       select 1 from public.prospecting_campaign_spend s where s.organization_id = v.org
     );
  `);
});

describe("RLS de prospecting_campaign_spend", () => {
  it("1. membro lê o próprio gasto", () => {
    expect(contar(AGENTE_A, ORG_A)).toBeGreaterThan(0);
  });

  it("2. membro não lê o gasto da vizinha", () => {
    expect(contar(AGENTE_A, ORG_B)).toBe(0);
    expect(contar(AGENTE_B, ORG_A)).toBe(0);
  });

  it("3. membro lança na própria campanha, não na de outra org", () => {
    expect(lancar(AGENTE_A, ORG_A, 500)).toBe(true);
    expect(lancar(AGENTE_A, ORG_B, 500)).toBe(false);
  });

  it("4. sem organização e anon não leem", () => {
    expect(contar(VISITANTE, ORG_A)).toBe(0);
    let negado = false;
    let out = "";
    try {
      out = sql(`
        set role anon;
        select set_config('request.jwt.claims', '', false);
        select count(*) from public.prospecting_campaign_spend;
      `);
    } catch (erro) {
      negado = String(erro).includes("permission denied");
    }
    expect(negado || out === "0").toBe(true);
  });
});
