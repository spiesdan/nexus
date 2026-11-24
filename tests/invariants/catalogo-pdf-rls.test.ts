/**
 * ISOLAMENTO DA CONFIGURAÇÃO DO CATÁLOGO PDF.
 *
 * Quatro eixos com `set role authenticated` + JWT — conectar como postgres
 * mediria nada (`rolbypassrls`). A rota de API filtra organization_id, e a RLS
 * é a segunda camada.
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

const ORG_A = "ca1e0da2-9900-4000-8000-00000000000a";
const ORG_B = "ca1e0da2-9900-4000-8000-00000000000b";
const AGENTE_A = "ca1e0da2-9911-4000-8000-00000000000a";
const AGENTE_B = "ca1e0da2-9911-4000-8000-00000000000b";
const VISITANTE = "ca1e0da2-9911-4000-8000-00000000000c";

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
    `select count(*) from public.product_catalog_exports where organization_id = '${org}'::uuid;`,
  );
  const ultimo = out.split("\n").filter(Boolean).pop();
  if (!ultimo || !/^\d+$/.test(ultimo)) throw new Error(`saída inesperada: ${out}`);
  return Number(ultimo);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'catpdf-agente-a@invariant.test'),
      ('${AGENTE_B}', 'catpdf-agente-b@invariant.test'),
      ('${VISITANTE}', 'catpdf-sem-org@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'catpdf-inv-a', 'Catalogo Invariant A', 'Catalogo A'),
      ('${ORG_B}', 'catpdf-inv-b', 'Catalogo Invariant B', 'Catalogo B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG_A}', 'agent', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.product_catalog_exports (organization_id, nome, produto_ids)
    values ('${ORG_A}'::uuid, 'Catalogo A', '{}'::uuid[]),
           ('${ORG_B}'::uuid, 'Catalogo B', '{}'::uuid[])
    on conflict (organization_id) do nothing;
  `);
});

describe("RLS de product_catalog_exports (0342)", () => {
  it("1. membro lê a própria config", () => {
    expect(contar(AGENTE_A, ORG_A)).toBeGreaterThan(0);
  });

  it("2. membro não lê a da vizinha", () => {
    expect(contar(AGENTE_A, ORG_B)).toBe(0);
    expect(contar(AGENTE_B, ORG_A)).toBe(0);
  });

  it("3. agent (não manager) não escreve", () => {
    const antes = contar(AGENTE_A, ORG_A);
    let negado = false;
    try {
      como(
        AGENTE_A,
        `update public.product_catalog_exports set nome = 'invasao' where organization_id = '${ORG_A}'::uuid;`,
      );
    } catch {
      negado = true;
    }
    const nome = sql(
      `select nome from public.product_catalog_exports where organization_id = '${ORG_A}'::uuid;`,
    );
    expect(negado || nome !== "invasao").toBe(true);
    expect(contar(AGENTE_A, ORG_A)).toBe(antes);
  });

  it("4. sem organização e anon não leem", () => {
    expect(contar(VISITANTE, ORG_A)).toBe(0);
    let out = "";
    let negado = false;
    try {
      out = sql(`
        set role anon;
        select set_config('request.jwt.claims', '', false);
        select count(*) from public.product_catalog_exports;
      `);
    } catch (erro) {
      negado = String(erro).includes("permission denied");
    }
    expect(negado || out === "0").toBe(true);
  });
});
