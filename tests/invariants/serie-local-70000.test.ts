import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/** Org da decisão do dono — a mesma que a 0350 usa no bloco de renumeracao. */
const ORG = "4bc721ce-157a-41b9-97ae-ba633650859c";

const migracao = readFileSync(
  join(__dirname, "..", "..", "supabase", "migrations", "20261124280000_0350_serie_local_70000.sql"),
  "utf8",
);
const bloco = migracao.slice(migracao.indexOf("do $$"), migracao.indexOf("$$;", migracao.indexOf("do $$")) + 3);

function contador(): number {
  return Number(
    sql(`select ultimo_numero from public.commercial_order_counters where organization_id='${ORG}'`),
  );
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, display_name, legal_name)
    values ('${ORG}', 'serie-70000', 'Série 70000', 'Série 70000')
    on conflict (id) do nothing;
  `);
});

describe("0350 — série local 70.000 idempotente em três estados", () => {
  it("estado já migrado: aplicar duas vezes mantém 70006 (não volta a 900000)", () => {
    sql(`
      insert into public.commercial_order_counters (organization_id, ultimo_numero)
      values ('${ORG}', 70006)
      on conflict (organization_id) do update set ultimo_numero = 70006;
      insert into public.commercial_orders (organization_id, numero, cliente_nome, status, origem)
      select '${ORG}', n, 'pedido local ' || n, 'aprovado', 'vendedor'
        from generate_series(70001, 70006) as n;
    `);
    sql(bloco);
    expect(contador()).toBe(70006);
    sql(bloco);
    expect(contador()).toBe(70006);
  });

  it("estado com série alta: renumera 900001..900006 e deriva o contador de 900006", () => {
    sql(`delete from public.commercial_orders where organization_id='${ORG}' and numero between 900001 and 900006;
         delete from public.commercial_orders where organization_id='${ORG}' and numero between 70001 and 70006;`);
    sql(`
      insert into public.commercial_orders (organization_id, numero, numero_mercos, cliente_nome, status, origem)
      select '${ORG}', n, n - 830000, 'mercos ' || n, 'aprovado', 'mercos'
        from generate_series(900001, 900006) as n;
      update public.commercial_order_counters set ultimo_numero = 900006
       where organization_id='${ORG}';
    `);
    sql(bloco);
    expect(contador()).toBe(70006);
    expect(sql(`select count(*) from public.commercial_orders where organization_id='${ORG}' and numero between 70001 and 70006`)).toBe("6");
    expect(sql(`select count(*) from public.commercial_orders where organization_id='${ORG}' and numero between 900001 and 900006`)).toBe("0");
    // Segunda aplicação: nada a renumerar e o progresso é preservado.
    sql(bloco);
    expect(contador()).toBe(70006);
  });

  it("baseline não contém mais o piso 900000 que resetava a série", () => {
    const baseline = readFileSync(join(__dirname, "..", "..", "supabase", "baseline.sql"), "utf8");
    expect(baseline).not.toContain("greatest(ultimo_numero, 900000)");
    expect(baseline).toContain("série local 70000");
  });
});
