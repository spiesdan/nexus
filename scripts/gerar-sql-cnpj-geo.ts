/**
 * Gera o SQL de backfill de endereço a partir do cnpj-geo.json
 * (municipio/uf/logradouro/numero/bairro/cep por CNPJ, via BrasilAPI/cnpj.ws).
 *
 * Preenche SÓ campo vazio — a mesma expressão de vazio no SET e no WHERE.
 * Uso: pnpm exec tsx scripts/gerar-sql-cnpj-geo.ts <cnpj-geo.json> <saida.sql>
 */
import { readFileSync, writeFileSync } from "node:fs";

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

function esc(v: string | null | undefined): string {
  if (v === null || v === undefined || String(v).trim() === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const [entrada, saida] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!entrada || !saida) {
    log("uso: tsx scripts/gerar-sql-cnpj-geo.ts <cnpj-geo.json> <saida.sql>");
    process.exit(2);
  }
  const geo = JSON.parse(readFileSync(entrada, "utf8")) as Record<
    string,
    {
      municipio?: string;
      uf?: string;
      logradouro?: string;
      numero?: string;
      bairro?: string;
      cep?: string;
      product_id?: string;
    }
  >;

  const ORG = `(select id from organizations where slug='bill-higiene-limpeza')`;
  const vazio = (col: string) => `nullif(trim(coalesce(${col}, '')), '')`;
  const out = ["BEGIN;", ""];
  let n = 0;
  for (const g of Object.values(geo)) {
    if (!g.municipio || !g.product_id) continue;
    const sets = [
      `cidade = coalesce(${vazio("cidade")}, ${esc(g.municipio)})`,
      `uf = coalesce(${vazio("uf")}, ${esc((g.uf ?? "").slice(0, 2) || null)})`,
      `logradouro = coalesce(${vazio("logradouro")}, ${esc(g.logradouro)})`,
      `numero_end = coalesce(${vazio("numero_end")}, ${esc(g.numero)})`,
      `bairro = coalesce(${vazio("bairro")}, ${esc(g.bairro)})`,
      `cep = coalesce(${vazio("cep")}, ${esc((g.cep ?? "").replace(/\D/g, "") || null)})`,
    ];
    const colunas = ["cidade", "uf", "logradouro", "numero_end", "bairro", "cep"];
    const algumVazio = colunas.map((c) => `${vazio(c)} IS NULL`).join(" OR ");
    out.push(
      `UPDATE contacts SET ${sets.join(", ")}, ` +
        `updated_at = case when ${algumVazio} then now() else updated_at end ` +
        `WHERE id = '${g.product_id}' AND organization_id = ${ORG} AND (${algumVazio});`,
    );
    n++;
  }
  out.push("", "COMMIT;", "");
  writeFileSync(saida, out.join("\n"));
  log(`updates: ${n} -> ${saida}`);
}

main().catch((e: unknown) => {
  log(`erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
