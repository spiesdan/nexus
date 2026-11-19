/**
 * E.1 — A AUSÊNCIA DE EAN/GTIN É UMA PROPRIEDADE DO BANCO, NÃO DA PROSA.
 *
 * Consulta `information_schema.columns` no Postgres efêmero do `pnpm test:db`.
 * Se alguém criar `ean`, `gtin` ou `barcode` sem contrato de validação/busca,
 * este teste avisa — e a decisão (dígito verificador, unicidade por org,
 * normalização) continua explícita, não implícita.
 */
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`.");
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

describe("catalog_products — sem EAN/GTIN", () => {
  it("nenhuma coluna de código de barras existe hoje", () => {
    const colunas = sql(`
      select column_name
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'catalog_products'
         and (column_name ilike '%ean%'
           or column_name ilike '%gtin%'
           or column_name ilike '%barcode%'
           or column_name ilike '%codigo_barras%');
    `);

    expect(colunas).toBe("");
  });

  it("a tabela existe e tem `codigo` (controle positivo do mesmo SELECT)", () => {
    const temCodigo = sql(`
      select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'catalog_products'
         and column_name = 'codigo';
    `);
    expect(Number(temCodigo)).toBe(1);
  });
});
