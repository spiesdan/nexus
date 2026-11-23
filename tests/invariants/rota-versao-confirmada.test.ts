import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/** 0336 — a versão confirmada existe e só é gravada com CAS na versão atual. */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

const ORG = "0336aaaa-0000-4000-8000-000000000001";
const CARGA = "0336cccc-0000-4000-8000-000000000003";

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, display_name, legal_name)
    values ('${ORG}', 'rota-confirmada', 'Rota Confirmada', 'Rota Confirmada')
    on conflict (id) do nothing;
    insert into public.shipments (id, organization_id, numero, status, rota_versao)
    values ('${CARGA}', '${ORG}', 336, 'em_rota', 3)
    on conflict (id) do nothing;
  `);
});

describe("0336 — rota_versao_confirmada", () => {
  it("as duas colunas existem, são aditivas e começam vazias", () => {
    const tipos = sql(`
      select column_name || ':' || data_type from information_schema.columns
       where table_name = 'shipments' and column_name in
         ('rota_versao_confirmada', 'rota_confirmada_em') order by column_name
    `);
    expect(tipos).toBe("rota_confirmada_em:timestamp with time zone\nrota_versao_confirmada:smallint");
    expect(sql(`select rota_versao_confirmada is null and rota_confirmada_em is null from public.shipments where id='${CARGA}'`)).toBe("t");
  });

  it("o aceite grana a versão atual e o instante", () => {
    const n = sql(`
      with w as (
        update public.shipments
           set rota_versao_confirmada = 3, rota_confirmada_em = now()
         where id='${CARGA}' and organization_id='${ORG}' and rota_versao = 3
        returning 1
      ) select count(*) from w
    `);
    expect(n).toBe("1");
    expect(sql(`select rota_versao_confirmada from public.shipments where id='${CARGA}'`)).toBe("3");
  });

  it("versão velha não confirma nada (CAS do painel que mudou)", () => {
    const n = sql(`
      with w as (
        update public.shipments
           set rota_versao_confirmada = 2, rota_confirmada_em = now()
         where id='${CARGA}' and organization_id='${ORG}' and rota_versao = 2
        returning 1
      ) select count(*) from w
    `);
    expect(n).toBe("0");
    expect(sql(`select rota_versao_confirmada from public.shipments where id='${CARGA}'`)).toBe("3");
  });
});
