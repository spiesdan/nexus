/**
 * A FILA DE "ORÇAMENTOS PARADOS" NÃO PODE VAZAR ENTRE ORGANIZAÇÕES.
 *
 * O endpoint filtra `origem='mercos' AND status='rascunho'` sobre
 * `commercial_orders` com o client de SESSÃO — a RLS da tabela é o que separa
 * tenants. Quatro eixos, com `set role authenticated` + JWT: leitura própria,
 * zero da vizinha, escrita na vizinha negada e anon sem linha. Conectar como
 * postgres mediria nada (`rolbypassrls`).
 */
import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

const ORG_A = "ca1e0da2-6600-4000-8000-00000000000a";
const ORG_B = "ca1e0da2-6600-4000-8000-00000000000b";
const AGENTE_A = "ca1e0da2-6611-4000-8000-00000000000a";
const AGENTE_B = "ca1e0da2-6611-4000-8000-00000000000b";

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
    `select count(*) from public.commercial_orders
      where organization_id = '${org}'::uuid and origem = 'mercos' and status = 'rascunho';`,
  );
  const ultimo = out.split("\n").filter(Boolean).pop();
  if (!ultimo || !/^\d+$/.test(ultimo)) throw new Error(`saída inesperada: ${out}`);
  return Number(ultimo);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'parados-agente-a@invariant.test'),
      ('${AGENTE_B}', 'parados-agente-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'parados-inv-a', 'Parados Invariant A', 'Parados A'),
      ('${ORG_B}', 'parados-inv-b', 'Parados Invariant B', 'Parados B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG_A}', 'agent', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.commercial_orders
      (organization_id, numero, cliente_nome, status, origem, total_cents, created_at)
    select v.org, 19990, 'Cliente do invariante', 'rascunho', 'mercos', 123456,
           now() - interval '90 days'
      from (values ('${ORG_A}'::uuid), ('${ORG_B}'::uuid)) as v(org)
     where not exists (
       select 1 from public.commercial_orders c
        where c.organization_id = v.org and c.origem = 'mercos' and c.status = 'rascunho'
     );
  `);
});

describe("RLS do recorte de orçamentos parados", () => {
  it("1. membro lê os rascunhos mercos da própria org", () => {
    expect(contar(AGENTE_A, ORG_A)).toBeGreaterThan(0);
  });

  it("2. membro não lê os da vizinha", () => {
    expect(contar(AGENTE_A, ORG_B)).toBe(0);
    expect(contar(AGENTE_B, ORG_A)).toBe(0);
  });

  it("3. membro não altera rascunho da vizinha", () => {
    const alvo = sql(
      `select id from public.commercial_orders where organization_id = '${ORG_B}'::uuid limit 1;`,
    );
    // RLS não LEVANTA erro em UPDATE de linha invisível: ele filtra a linha e
    // atualiza ZERO. A prova é ler a linha como postgres e ver que nada mudou.
    como(
      AGENTE_A,
      `update public.commercial_orders set observacoes = 'invasao' where id = '${alvo}'::uuid;`,
    );
    const depois = sql(
      `select coalesce(observacoes, '—') from public.commercial_orders where id = '${alvo}'::uuid;`,
    );
    expect(depois).not.toBe("invasao");
  });

  it("4. anon não lê", () => {
    let out = "";
    let negado = false;
    try {
      out = sql(`
        set role anon;
        select set_config('request.jwt.claims', '', false);
        select count(*) from public.commercial_orders
         where origem = 'mercos' and status = 'rascunho';
      `);
    } catch (erro) {
      negado = String(erro).includes("permission denied");
    }
    expect(negado || out === "0").toBe(true);
  });
});
