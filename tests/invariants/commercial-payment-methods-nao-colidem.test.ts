/**
 * NÃO-COLISÃO — o caso que derrubou o deploy da 1.63.0.
 *
 * Produção tem uma tabela LEGADA `payment_methods` (name/account_id/is_active,
 * FK para financial_accounts, referenciada por sales.payment_method_id) que
 * NÃO existe no baseline.sql. A 0334 usava `create table if not exists`, foi
 * ignorada, e o índice em `tipo` estourou com "column tipo does not exist".
 *
 * Este teste semeia a tabela legada no banco de teste e reaplica a migration
 * 0334. Se o nome novo colidir — ou se a migration tocar na legada — falha.
 * A FK da legada não é reproduzida porque `financial_accounts` também é drift
 * ausente do baseline; o que se mede aqui é o NOME e a forma das colunas.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261124110000_0334_commercial_payment_methods.sql",
);

beforeAll(() => {
  sql(`
    create table if not exists public.payment_methods (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid,
      name text,
      account_id uuid,
      is_active boolean default true,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
  // A seed da 0334 inserta "select ... from organizations"; sem uma org na
  // base de teste ela grava zero e o teste provaria vacuidade, não colisão.
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('ca1e0da2-8800-4000-8000-000000000001', 'colisao-inv', 'Colisao Invariant', 'Colisao')
      on conflict (id) do nothing;
  `);
  // Reaplicar a 0334 com a legada presente é exatamente o cenário do deploy.
  sql(readFileSync(MIGRATION, "utf8"));
});

describe("0334 com a payment_methods legada presente", () => {
  it("a tabela legada continua com a forma antiga e sem tipo", () => {
    const colunas = sql(`
      select string_agg(column_name, ',')
        from information_schema.columns
       where table_schema = 'public' and table_name = 'payment_methods';
    `);
    expect(colunas).toContain("name");
    expect(colunas).toContain("account_id");
    expect(colunas).toContain("is_active");
    expect(colunas).not.toContain("tipo");
  });

  it("a nova commercial_payment_methods existe com tipo e tpag", () => {
    const colunas = sql(`
      select string_agg(column_name, ',')
        from information_schema.columns
       where table_schema = 'public' and table_name = 'commercial_payment_methods';
    `);
    expect(colunas).toContain("tipo");
    expect(colunas).toContain("tpag");
    expect(colunas).toContain("dias_prazo");
  });

  it("a seed da nova tabela roda sem tocar na legada", () => {
    const total = Number(
      sql(`select count(*) from public.commercial_payment_methods where tipo = 'forma';`),
    );
    expect(total).toBeGreaterThan(0);
  });
});
