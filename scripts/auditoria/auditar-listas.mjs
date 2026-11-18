#!/usr/bin/env node
/* eslint-disable no-console -- este CLI de auditoria imprime o inventário; a saída É o produto */
/**
 * P1-06 — AUDITORIA DAS LISTAS DA API: teto e ordem estável.
 *
 * Duas perguntas, por rota `GET` que consulta o banco:
 *
 *   1. **Teto**: a consulta tem `.limit()`/`.range()`? Conjunto sem teto cresce
 *      com o uso até virar timeout do PostgREST e resposta que "não carrega".
 *   2. **Ordem estável**: quando há `.order()` e `.limit()`, existe desempate
 *      por coluna única (`id`/`*_id`)? `order by created_at` com duas linhas no
 *      mesmo instante devolve ordem ARBITRÁRIA entre execuções — a linha que
 *      aparece na página 1 pode reaparecer na 2, e o item 201 some sem aviso.
 *
 * Não é gate (um gate de texto sobre `.order()` reprovaria agregações e
 * detalhes de `[id]`); é o instrumento que mede antes e depois. O número que
 * importa é a diferença entre as duas execuções.
 *
 * Uso:
 *   node scripts/auditoria/auditar-listas.mjs [raiz]
 *   node scripts/auditoria/auditar-listas.mjs --json
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const JSON_SAIDA = process.argv.includes("--json");
const API = path.join(RAIZ, "app/api");

function rotas(dir) {
  const saida = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = path.join(dir, entrada);
    if (statSync(caminho).isDirectory()) saida.push(...rotas(caminho));
    else if (entrada === "route.ts") saida.push(caminho);
  }
  return saida;
}

const resultados = [];
for (const arquivo of rotas(API)) {
  const corpo = readFileSync(arquivo, "utf8");
  if (!/export async function GET/.test(corpo)) continue;
  if (!/\.select\(/.test(corpo)) continue;

  const rel = path.relative(RAIZ, arquivo).split(path.sep).join("/");
  const limites = [...corpo.matchAll(/\.limit\(\s*([^)]*)\)/g)].map((m) => m[1].trim());
  const ranges = /\.range\(/.test(corpo);
  const ordens = [...corpo.matchAll(/\.order\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  const singular = /maybeSingle\(\)|\.single\(\)/.test(corpo);
  const agregado = /count:\s*"exact"/.test(corpo) && !/\.order\(/.test(corpo);

  const temTeto = limites.length > 0 || ranges;
  const temOrdem = ordens.length > 0;
  // Marcador de decisão: a rota declara no código por que a ordem já é total
  // (coluna única por construção, ex.: PK `(organization_id, name)`). Sem o
  // marcador, a única saída seria afrouxar o critério do scanner — e aí ele
  // deixaria de achar o próximo caso de verdade.
  const ordemTotalDeclarada = /ordem-estavel-ok:/.test(corpo);
  const desempate = ordemTotalDeclarada || ordens.some((c) => c === "id" || c.endsWith("_id"));
  const numericos = limites.filter((l) => /^\d+$/.test(l)).map(Number);
  const soTeto1 = numericos.length > 0 && numericos.every((n) => n === 1);

  resultados.push({
    rota: rel,
    limites,
    ordens,
    temTeto,
    temOrdem,
    desempate,
    // "sem teto" só conta quando a rota pode devolver CONJUNTO: detalhe de
    // `[id]`, agregação e count não entram.
    semTeto: !temTeto && !singular && !agregado,
    // Ordem instável só importa quando há teto > 1: com uma linha, desempatar
    // não muda nada.
    ordemInstavel: temOrdem && !desempate && numericos.some((n) => n > 1),
    soTeto1,
  });
}

const semTeto = resultados.filter((r) => r.semTeto).map((r) => r.rota).sort();
const instaveis = resultados.filter((r) => r.ordemInstavel).map((r) => r.rota).sort();

if (JSON_SAIDA) {
  console.log(JSON.stringify({ total: resultados.length, semTeto, ordemInstavel: instaveis }, null, 2));
} else {
  console.log(`rotas GET que consultam o banco: ${resultados.length}`);
  console.log(`sem teto (conjunto sem .limit/.range): ${semTeto.length}`);
  for (const r of semTeto) console.log(`  ${r}`);
  console.log(`\nordem sem desempate único (com teto > 1): ${instaveis.length}`);
  for (const r of instaveis) console.log(`  ${r}`);
}

// Sai 1 quando há achado: serve de sonda em revisão, não de gate de CI.
process.exit(semTeto.length + instaveis.length === 0 ? 0 : 1);
