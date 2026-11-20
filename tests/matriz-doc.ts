/**
 * GERA A TABELA DA MATRIZ — sem digitar número à mão.
 *
 * Lê `docs/auditoria/41-matriz-rotas.json` (a lista de telas e o veredito de
 * cada uma) e as medições dos instrumentos (`depois-matriz/medidas.json` e,
 * quando existir, `antes-matriz/medidas.json`), e reescreve só o bloco entre
 * `<!-- MATRIZ:INICIO -->` e `<!-- MATRIZ:FIM -->` de
 * `docs/auditoria/41-matriz-de-telas.md`.
 *
 * Por que um gerador: 110 linhas com quatro números cada, mantidas à mão,
 * envelhecem na primeira rodada — e número que envelhece é pior que número
 * nenhum, porque parece medido.
 *
 * Uso: node_modules/.bin/tsx tests/matriz-doc.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const RAIZ = process.cwd();
const DOC = path.join(RAIZ, "docs/auditoria/41-matriz-de-telas.md");
const ROTAS = path.join(RAIZ, "docs/auditoria/41-matriz-rotas.json");
const CAPTURAS = path.join(RAIZ, "docs/auditoria/capturas");

interface Medida {
  rota: string;
  tema: string;
  largura: number;
  overflow: number;
  consoleErros: string[];
  axe: { critica: number; seria: number };
  pulada?: string;
}

interface Linha {
  rota: string;
  grupo: string;
  dinamica: boolean;
  capturar: boolean;
  veredito: string;
}

const GRUPOS: Record<string, string> = {
  "pedidos-e-vendas": "1. Pedidos e vendas",
  atendimento: "2. Atendimento (inbox, contatos, funil, agenda)",
  fiscal: "3. Fiscal",
  expedicao: "4. Expedição",
  financeiro: "5. Financeiro e indicadores",
  "config-e-inteligencia": "6. Configuração, time e inteligência de mercado",
  ia: "7. IA (agentes, runs, conhecimento)",
};

function ler(nome: string): Medida[] {
  const p = path.join(CAPTURAS, nome, "medidas.json");
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, "utf8")) as { medidas: Medida[] }).medidas ?? [];
}

const depois = ler("depois-matriz");
const antes = ler("antes-matriz");

/** Uma linha por rota: o pior caso entre as quatro combinações. */
function pior(medidas: Medida[], rota: string) {
  const daRota = medidas.filter((m) => m.rota === rota && !m.pulada);
  if (daRota.length === 0) return null;
  const overflow = Math.max(...daRota.map((m) => m.overflow));
  const critica = Math.max(...daRota.map((m) => m.axe.critica));
  const seria = Math.max(...daRota.map((m) => m.axe.seria));
  const console_ = Math.max(...daRota.map((m) => m.consoleErros.length));
  const larguras = [...new Set(daRota.map((m) => m.largura))].sort();
  const overflowPorLargura = larguras
    .map((l) => {
      const daLargura = daRota.filter((m) => m.largura === l);
      const p = Math.max(...daLargura.map((m) => m.overflow));
      return l === 390 ? `${p}` : `${p}`;
    })
    .join("/");
  const pulada = medidas.find((m) => m.rota === rota && m.pulada);
  return { overflow, overflowPorLargura, critica, seria, console: console_, pulada: pulada?.pulada };
}

function celula(rota: string): string {
  const d = pior(depois, rota);
  if (!d) return "— | — | — | pendente";
  if (d.pulada) return `— | — | — | **pulada**: ${d.pulada}`;
  const a = pior(antes, rota);
  const overflow = `${d.overflowPorLargura} px`;
  const axe = `${d.critica}/${d.seria}`;
  const cons = d.console === 0 ? "0" : `**${d.console}**`;
  const antesTxt = a && !a.pulada ? ` (antes ${a.overflowPorLargura} px, axe ${a.critica}/${a.seria})` : "";
  return `${overflow}${antesTxt} | ${axe} | ${cons} | VEREDITO`;
}

const matriz = JSON.parse(readFileSync(ROTAS, "utf8")) as { rotas: Linha[] };
const vereditos = new Map(matriz.rotas.map((r) => [r.rota, r.veredito]));

let bloco = "";
for (const [grupo, titulo] of Object.entries(GRUPOS)) {
  const rotas = matriz.rotas.filter((r) => r.grupo === grupo);
  const medidos = rotas.filter((r) => pior(depois, r.rota)).length;
  bloco += `\n### ${titulo} — ${rotas.length} telas, ${medidos} medidas\n\n`;
  bloco += `| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |\n`;
  bloco += `|---|---|---|---|---|---|\n`;
  rotas.forEach((r, i) => {
    const linha = celula(r.rota).replace("VEREDITO", vereditos.get(r.rota) ?? "pendente");
    bloco += `| ${i + 1} | \`${r.rota}\`${r.dinamica ? " · dinâmica" : ""} | ${linha} |\n`;
  });
}

const doc = readFileSync(DOC, "utf8");
const inicio = "<!-- MATRIZ:INICIO -->";
const fim = "<!-- MATRIZ:FIM -->";
const i = doc.indexOf(inicio);
const f = doc.indexOf(fim);
if (i < 0 || f < 0) throw new Error(`marcadores ausentes em ${DOC}`);
const novo = `${doc.slice(0, i + inicio.length)}\n${bloco}\n${doc.slice(f)}`;
writeFileSync(DOC, novo);
console.log(`matriz atualizada: ${matriz.rotas.length} rotas, ${depois.length} medições de depois, ${antes.length} de antes`);
