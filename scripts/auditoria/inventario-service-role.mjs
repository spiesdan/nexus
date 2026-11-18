#!/usr/bin/env node
/* eslint-disable no-console -- este CLI de auditoria imprime o inventário; a saída É o produto */
/**
 * Inventário de revisão do SERVICE ROLE — o instrumento do item 3.
 *
 * O que ele produz: para cada handler de `app/api/**` que usa
 * `createAdminClient()`/`SUPABASE_SERVICE_ROLE_KEY`, cada `.from("tabela")` em
 * tabela tenant-aware, com duas perguntas:
 *
 *   1. o encadeamento filtra `organization_id`? (janela de 20 linhas até `;`)
 *   2. o arquivo tem guard de autorização reconhecível?
 *
 * NÃO é gate. É o instrumento que transforma "210 handlers citam service role"
 * em uma lista revisável — e que evita a armadilha inversa: contar MENÇÕES de
 * `organization_id` no arquivo inteiro e chamar de filtro. As respostas que ele
 * dá são heurísticas; a revisão de cada linha é humana e está em
 * `docs/auditoria/service-role-revisao.md`.
 *
 * Uso:
 *   node scripts/auditoria/inventario-service-role.mjs
 *   node scripts/auditoria/inventario-service-role.mjs --so-sem-filtro
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API = path.join(RAIZ, "app/api");
const SO_SEM_FILTRO = process.argv.includes("--so-sem-filtro");

/**
 * Tabelas tenant-aware derivadas de `lib/database.types.ts` (gerado do schema):
 * a tabela cujo `Row` declara `organization_id`. Derivar do tipo evita a lista
 * à mão envelhecer — tabela nova aparece no inventário no mesmo commit.
 */
function tabelasTenant() {
  const tipos = readFileSync(path.join(RAIZ, "lib/database.types.ts"), "utf8");
  const nomes = new Set();
  const re = /^ {6}([a-z0-9_]+): \{\n {8}Row: \{/gm;
  let m;
  while ((m = re.exec(tipos))) {
    const inicio = m.index;
    const proximo = tipos.indexOf("\n      [a-z0-9_]+: {", inicio + 1);
    const fim = proximo === -1 ? tipos.length : proximo;
    const bloco = tipos.slice(inicio, Math.min(fim, inicio + 20000));
    if (/^ {10}organization_id:/m.test(bloco)) nomes.add(m[1]);
  }
  return nomes;
}

function handlers(dir) {
  const saida = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = path.join(dir, entrada);
    if (statSync(caminho).isDirectory()) saida.push(...handlers(caminho));
    else if (["route.ts", "_handler.ts", "_shared.ts", "_transicao.ts"].includes(entrada)) saida.push(caminho);
  }
  return saida;
}

const GUARD =
  /requireRole\s*\(|requirePlatformAdmin|requireAuth\s*\(|loadAuthUser\s*\(|resolveActiveOrg\s*\(|is_platform_admin|INTERNAL_CRON_SECRET|INTERNAL_SECRET|CRON_SECRET|timingSafeEqual|webhook_secret|WEBHOOK_SECRET|verifyInboundSignature|verifySignature|path_token|HMAC|requiresScope|requireScope/i;

const TENANT = tabelasTenant();
const achados = [];

for (const arquivo of handlers(API)) {
  const corpo = readFileSync(arquivo, "utf8");
  if (!/createAdminClient\s*\(|SUPABASE_SERVICE_ROLE/.test(corpo)) continue;
  const linhas = corpo.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]/);
    if (!m || !TENANT.has(m[1])) continue;
    let cadeia = "";
    for (let j = i; j < Math.min(linhas.length, i + 20); j++) {
      cadeia += linhas[j] + "\n";
      if (/;\s*$/.test(linhas[j])) break;
    }
    achados.push({
      arquivo: path.relative(RAIZ, arquivo).split(path.sep).join("/"),
      linha: i + 1,
      tabela: m[1],
      filtra: /organization_id|orgId|organizationIds|ORG_IDS/.test(cadeia),
      guard: GUARD.test(corpo),
    });
  }
}

const semFiltro = achados.filter((a) => !a.filtra);
const porArquivo = new Map();
for (const a of semFiltro) {
  if (!porArquivo.has(a.arquivo)) porArquivo.set(a.arquivo, []);
  porArquivo.get(a.arquivo).push(a);
}

console.log(`handlers com service role: ${new Set(achados.map((a) => a.arquivo)).size}`);
console.log(`tabelas tenant-aware: ${TENANT.size}`);
console.log(`encadeamentos .from() em tabela tenant: ${achados.length}`);
console.log(`sem filtro de organização na cadeia: ${semFiltro.length} em ${porArquivo.size} arquivos`);
console.log(`desses, em arquivo sem guard reconhecível: ${semFiltro.filter((a) => !a.guard).length}`);
console.log("");
console.log("Cada linha abaixo NÃO é um vazamento — é uma pergunta. A resposta revisada");
console.log("de cada classe está em docs/auditoria/service-role-revisao.md.\n");

for (const [arquivo, itens] of [...porArquivo.entries()].sort()) {
  if (SO_SEM_FILTRO && itens[0].guard) continue;
  console.log(`### ${arquivo}${itens[0].guard ? "" : "   [SEM GUARD RECONHECÍVEL]"}`);
  for (const it of itens) console.log(`  L${it.linha} from(${it.tabela})`);
}
