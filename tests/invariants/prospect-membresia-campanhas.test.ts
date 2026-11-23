/**
 * MEMBRESIA DE PROSPECTS EM CAMPANHAS — 0338.
 *
 * A exclusividade da 0277 impedia a empresa de entrar em duas campanhas. Aqui
 * se prova que ela entrou, que o envio ÚNICO por campanha continua, que a
 * membresia é tenant-aware e que os quatro eixos de RLS valem. Conexão como
 * `postgres` para o trigger (RLS não é o que está sendo medido ali) e
 * `set role authenticated` + JWT para a RLS.
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

const ORG_A = "ca1e0da2-7700-4000-8000-00000000000a";
const ORG_B = "ca1e0da2-7700-4000-8000-00000000000b";
const AGENTE_A = "ca1e0da2-7711-4000-8000-00000000000a";
const AGENTE_B = "ca1e0da2-7711-4000-8000-00000000000b";
const PROSPECT_A = "ca1e0da2-7722-4000-8000-00000000000a";
const PROSPECT_B = "ca1e0da2-7722-4000-8000-00000000000b";
const CAMPANHA_A1 = "ca1e0da2-7733-4000-8000-000000000001";
const CAMPANHA_A2 = "ca1e0da2-7733-4000-8000-000000000002";
const CAMPANHA_B = "ca1e0da2-7733-4000-8000-000000000003";

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
    `select count(*) from public.prospecting_campaign_prospects where organization_id = '${org}'::uuid;`,
  );
  const ultimo = out.split("\n").filter(Boolean).pop();
  if (!ultimo || !/^\d+$/.test(ultimo)) throw new Error(`saída inesperada: ${out}`);
  return Number(ultimo);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'memb-agente-a@invariant.test'),
      ('${AGENTE_B}', 'memb-agente-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'memb-inv-a', 'Membresia Invariant A', 'Memb A'),
      ('${ORG_B}', 'memb-inv-b', 'Membresia Invariant B', 'Memb B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG_A}', 'agent', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.business_prospects (id, organization_id, nome, nome_normalizado, provider) values
      ('${PROSPECT_A}', '${ORG_A}', 'Empresa A', 'empresa a', 'baseline'),
      ('${PROSPECT_B}', '${ORG_B}', 'Empresa B', 'empresa b', 'baseline')
      on conflict (id) do nothing;

    insert into public.prospecting_campaigns
      (id, organization_id, nome, prospect_ids, status)
    values
      ('${CAMPANHA_A1}'::uuid, '${ORG_A}'::uuid, 'Campanha A1', array['${PROSPECT_A}'::uuid], 'rascunho'),
      ('${CAMPANHA_A2}'::uuid, '${ORG_A}'::uuid, 'Campanha A2', array['${PROSPECT_A}'::uuid], 'rascunho'),
      ('${CAMPANHA_B}'::uuid, '${ORG_B}'::uuid, 'Campanha B', array['${PROSPECT_B}'::uuid], 'rascunho')
      on conflict (id) do nothing;

    -- O backfill da 0338 já cobre as três campanhas acima.
    insert into public.prospecting_campaign_prospects (organization_id, campaign_id, prospect_id)
    select c.organization_id, c.id, p
      from public.prospecting_campaigns c
      cross join lateral unnest(coalesce(c.prospect_ids, '{}'::uuid[])) as p
     where not exists (
       select 1 from public.prospecting_campaign_prospects m
        where m.campaign_id = c.id and m.prospect_id = p
     )
    on conflict (campaign_id, prospect_id) do nothing;

    insert into public.prospecting_followups
      (organization_id, campaign_id, prospect_id, agendado_em)
    select c.organization_id, c.id, p, now() + interval '48 hours'
      from public.prospecting_campaigns c
      cross join lateral unnest(coalesce(c.prospect_ids, '{}'::uuid[])) as p
     where not exists (
       select 1 from public.prospecting_followups f
        where f.campaign_id = c.id and f.prospect_id = p
     )
    on conflict (campaign_id, prospect_id) do nothing;
  `);
});

describe("membresia de prospects (0338)", () => {
  it("1. a mesma empresa entra em duas campanhas da mesma org", () => {
    const linhas = sql(`
      select count(*) from public.prospecting_campaign_prospects
       where prospect_id = '${PROSPECT_A}'::uuid;
    `);
    expect(Number(linhas)).toBeGreaterThanOrEqual(2);
  });

  it("2. dois envios para o MESMO prospect na MESMA campanha são recusados", () => {
    sql(`
      insert into public.prospecting_sends (organization_id, campaign_id, prospect_id)
      values ('${ORG_A}'::uuid, '${CAMPANHA_A1}'::uuid, '${PROSPECT_A}'::uuid);
    `);
    let negado = false;
    try {
      sql(`
        insert into public.prospecting_sends (organization_id, campaign_id, prospect_id)
        values ('${ORG_A}'::uuid, '${CAMPANHA_A1}'::uuid, '${PROSPECT_A}'::uuid);
      `);
    } catch (erro) {
      negado = String(erro).includes("prospecting_sends_campanha_prospect_unico");
    }
    expect(negado).toBe(true);
    // O mesmo prospect em OUTRA campanha continua podendo enviar.
    expect(() =>
      sql(`
        insert into public.prospecting_sends (organization_id, campaign_id, prospect_id)
        values ('${ORG_A}'::uuid, '${CAMPANHA_A2}'::uuid, '${PROSPECT_A}'::uuid);
      `),
    ).not.toThrow();
  });

  it("3. membro lê a própria membresia e não lê a da vizinha", () => {
    expect(contar(AGENTE_A, ORG_A)).toBeGreaterThan(0);
    expect(contar(AGENTE_A, ORG_B)).toBe(0);
    expect(contar(AGENTE_B, ORG_A)).toBe(0);
  });

  it("4. escrita na vizinha e anon são negados", () => {
    let escritaNegada = false;
    try {
      como(
        AGENTE_A,
        `insert into public.prospecting_campaign_prospects
           (organization_id, campaign_id, prospect_id)
         values ('${ORG_B}'::uuid, '${CAMPANHA_B}'::uuid, '${PROSPECT_B}'::uuid);`,
      );
    } catch {
      escritaNegada = true;
    }
    expect(escritaNegada).toBe(true);

    let leituraNegada = false;
    let out = "";
    try {
      out = sql(`
        set role anon;
        select set_config('request.jwt.claims', '', false);
        select count(*) from public.prospecting_campaign_prospects;
      `);
    } catch (erro) {
      leituraNegada = String(erro).includes("permission denied");
    }
    expect(leituraNegada || out === "0").toBe(true);
  });
});


describe("RLS do follow-up de retomada (0339)", () => {
  it("1. membro lê o próprio follow-up", () => {
    const out = como(
      AGENTE_A,
      `select count(*) from public.prospecting_followups where organization_id = '${ORG_A}'::uuid;`,
    );
    expect(Number(out.split("\n").filter(Boolean).pop() ?? "0")).toBeGreaterThan(0);
  });

  it("2. membro não lê o da vizinha", () => {
    const out = como(
      AGENTE_A,
      `select count(*) from public.prospecting_followups where organization_id = '${ORG_B}'::uuid;`,
    );
    expect(Number(out.split("\n").filter(Boolean).pop() ?? "0")).toBe(0);
  });

  it("3. escrita na vizinha é negada", () => {
    let negado = false;
    try {
      como(
        AGENTE_A,
        `insert into public.prospecting_followups
           (organization_id, campaign_id, prospect_id, agendado_em)
         values ('${ORG_B}'::uuid, '${CAMPANHA_B}'::uuid, '${PROSPECT_B}'::uuid, now());`,
      );
    } catch {
      negado = true;
    }
    expect(negado).toBe(true);
  });

  it("4. anon não lê", () => {
    let out = "";
    let negado = false;
    try {
      out = sql(`
        set role anon;
        select set_config('request.jwt.claims', '', false);
        select count(*) from public.prospecting_followups;
      `);
    } catch (erro) {
      negado = String(erro).includes("permission denied");
    }
    expect(negado || out === "0").toBe(true);
  });
});
