// Gera o SQL de correção a partir do que foi relido no Mercos.
// Uso: node .gera-sql-mercos.mjs > /tmp/repara.sql
import { readFileSync } from "node:fs";

const ORG = "4bc721ce-157a-41b9-97ae-ba633650859c";
const CNPJ_EMPRESA = "35.233.142/0001-83";
const linhas = readFileSync("/tmp/mercos-clientes.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const limpa = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;

const bons = [];
const ruins = [];
for (const l of linhas) {
  if (!l.razao || !l.documento) {
    ruins.push(l);
    continue;
  }
  if (l.documento === CNPJ_EMPRESA) {
    ruins.push(l);
    continue;
  }
  bons.push(l);
}

console.log(`-- ${linhas.length} lidos · ${bons.length} com cliente · ${ruins.length} sem cliente legível`);
console.log("begin;");
for (const l of bons) {
  const nome = limpa(l.razao).slice(0, 300);
  console.log(
    `update public.commercial_orders set cliente_nome = ${esc(nome)}, cliente_documento = ${esc(l.documento)}, updated_at = now()
 where organization_id = ${esc(ORG)} and numero = ${l.numero}
   and (cliente_documento = ${esc(CNPJ_EMPRESA)} or cliente_nome ilike 'BILL COMERCIO%');`,
  );
}
console.log("commit;");
console.log(`-- sem cliente legível: ${ruins.map((r) => r.numero).join(", ") || "nenhum"}`);
