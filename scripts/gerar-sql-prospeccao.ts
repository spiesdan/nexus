/**
 * Gera o .sql de importação da prospecção para aplicar onde o service role não
 * alcança (ex.: produção via `psql` na VPS).
 *
 *   pnpm exec tsx scripts/gerar-sql-prospeccao.ts <scrape.json> <saida.sql>
 *
 * Usa o MESMO `transformar` de `importar-prospecao-maps-scraper.ts` — mesma
 * regra de telefone sem DDD, mesmo `provider = maps_browser`, mesmo 0800 de
 * fora. Se um dia divergir, o errado é este arquivo, não o outro.
 *
 * Premissas (verificadas por quem chama, não aqui):
 * - o JSON de entrada já vem dedupado por place_id e sem os que já existem;
 * - `organization_id` é resolvido no banco (`slug`), nunca colado;
 * - tudo numa transação: ou entra tudo ou não entra nada.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { PROVIDER, transformar, type LinhaMaps } from "./importar-prospecao-maps-scraper";

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

function esc(valor: string | null): string {
  if (valor === null || valor === undefined) return "NULL";
  return `'${valor.replace(/'/g, "''")}'`;
}

function escNum(valor: number | null): string {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor) : "NULL";
}

function escInt(valor: number | null): string {
  return typeof valor === "number" && Number.isFinite(valor) ? String(Math.trunc(valor)) : "NULL";
}

async function main(): Promise<void> {
  const [entrada, saida] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!entrada || !saida) {
    log("uso: tsx scripts/gerar-sql-prospeccao.ts <scrape.json> <saida.sql>");
    process.exit(2);
  }

  const linhas = readFileSync(entrada, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LinhaMaps);
  const registros = linhas
    .map(transformar)
    .filter((r): r is NonNullable<typeof r> => r !== null && r.external_id !== null);
  log(`linhas: ${linhas.length} | registros válidos: ${registros.length}`);

  const ORG = `(select id from organizations where slug='bill-higiene-limpeza')`;
  const out: string[] = ["BEGIN;", ""];
  for (const r of registros) {
    const cats =
      r.categorias.length > 0
        ? `array[${r.categorias.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")}]`
        : "'{}'";
    out.push(
      `INSERT INTO business_prospects (organization_id, nome, nome_normalizado, categoria, categorias, telefone, telefone_normalizado, whatsapp_potencial, website, email, endereco, logradouro, numero_end, bairro, cidade, estado, cep, pais, latitude, longitude, provider, external_id, external_url, nota, total_avaliacoes, status_comercial, source) VALUES ` +
        `(${ORG}, ${esc(r.nome)}, ${esc(r.nome_normalizado)}, ${esc(r.categoria)}, ${cats}, ${esc(r.telefone)}, ${esc(r.telefone_normalizado)}, ${r.whatsapp_potencial}, ${esc(r.website)}, NULL, ${esc(r.endereco)}, ${esc(r.logradouro)}, ${esc(r.numero_end)}, ${esc(r.bairro)}, ${esc(r.cidade)}, ${esc(r.estado)}, ${esc(r.cep)}, ${esc(r.pais)}, ${escNum(r.latitude)}, ${escNum(r.longitude)}, '${PROVIDER}', ${esc(r.external_id)}, ${esc(r.external_url)}, ${escNum(r.nota)}, ${escInt(r.total_avaliacoes)}, '${r.status_comercial}', ${esc(r.source)}) ` +
        // O índice único é PARCIAL (WHERE external_id IS NOT NULL): sem o
        // predicado o Postgres recusa o ON CONFLICT. Todas as linhas aqui têm
        // external_id (filtrado no transformar), então o predicado sempre casa.
        `ON CONFLICT (organization_id, provider, external_id) WHERE external_id IS NOT NULL DO NOTHING;`,
    );
  }
  out.push("", "COMMIT;", "");
  writeFileSync(saida, out.join("\n"));
  log(`SQL escrito: ${saida} (${registros.length} inserts)`);
}

main().catch((e: unknown) => {
  log(`erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
