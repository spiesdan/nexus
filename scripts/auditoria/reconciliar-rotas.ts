/**
 * RECONCILIAÇÃO — prova que nenhuma rota do prompt mestre foi perdida.
 *
 * O prompt mestre traz uma lista de rotas "a reconciliar". Ela é uma base de
 * conferência, não um inventário: pode citar rota que não existe mais e não
 * conhece rota criada depois. Este script cruza a lista do prompt com o
 * inventário gerado do checkout e escreve uma linha por rota com o estado.
 *
 * Por que existe: "não deixar nada pra trás" não se prova lendo. Prova-se
 * extraindo a lista do próprio documento e comparando com o filesystem. Se
 * alguém apagar uma rota do prompt (ou do código) sem justificar, a diferença
 * aparece aqui.
 *
 * Uso:
 *   pnpm exec tsx scripts/auditoria/inventario.ts        # primeiro, gera o inventário
 *   pnpm exec tsx scripts/auditoria/reconciliar-rotas.ts # depois, cruza
 *
 * Saída: docs/auditoria/02-reconciliacao-rotas.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const DOC_PROMPT = join(RAIZ, "docs", "auditoria", "PROMPT-MESTRE-AAA.md");
const INVENTARIO = join(RAIZ, "docs", "auditoria", "inventario.json");
const SAIDA = join(RAIZ, "docs", "auditoria", "02-reconciliacao-rotas.md");

interface ItemInventario {
  tipo: "tela" | "resolver" | "erro" | "estado" | "api" | "layout" | "arquivo-especial";
  rota: string;
  arquivo: string;
  grupo: string;
  metodos?: string[];
  flags: string[];
  linhas: number;
}

/** `[id]` → `:id`; `[...slug]` → `:slug*`. Mesma regra do inventário. */
function normalizarRota(rota: string): string {
  return rota
    .trim()
    .replace(/\/+$/, "")
    .replace(/\[\.\.\.(.+?)\]/g, ":$1*")
    .replace(/\[(.+?)\]/g, ":$1");
}

/**
 * Extrai as rotas da seção "Inventário inicial de rotas a reconciliar".
 * Delimitar a seção importa: fora dela o documento cita paths de arquivo
 * (`docs/...`, `scripts/...`) que não são rotas de produto.
 */
function rotasDoPrompt(): { rota: string; secao: string }[] {
  const texto = readFileSync(DOC_PROMPT, "utf8");
  const inicio = texto.indexOf("Inventário inicial de rotas a reconciliar");
  const fim = texto.indexOf("Contabilidade do inventário", inicio);
  if (inicio < 0 || fim < 0) throw new Error("seção de rotas do prompt não encontrada");
  const trecho = texto.slice(inicio, fim);

  const rotas: { rota: string; secao: string }[] = [];
  let secao = "(sem seção)";
  for (const linha of trecho.split("\n")) {
    const t = linha.trim();
    if (!t) continue;
    // Cabeçalho de bloco: linha sem "/" que não é a introdução.
    if (!t.includes("/")) {
      if (t !== "Inventário inicial de rotas a reconciliar") secao = t;
      continue;
    }
    if (t.startsWith("A lista abaixo")) continue;
    for (const bruto of t.split(",")) {
      const token = bruto.trim().replace(/\.$/, "");
      if (!token.startsWith("/")) continue;
      // `/` sozinho é a raiz; qualquer outro precisa de algo depois da barra.
      if (token !== "/" && !/^\/[\w\-[\]./]+$/.test(token)) continue;
      rotas.push({ rota: token, secao });
    }
  }
  return rotas;
}

const inventario = JSON.parse(readFileSync(INVENTARIO, "utf8")) as { itens: ItemInventario[] };
const porRota = new Map<string, ItemInventario[]>();
for (const item of inventario.itens) {
  const chave = normalizarRota(item.rota);
  const atual = porRota.get(chave) ?? [];
  atual.push(item);
  porRota.set(chave, atual);
}

const rotasPrompt = rotasDoPrompt();
const vistas = new Set<string>();

interface Linha {
  secao: string;
  rota: string;
  estado: string;
  arquivo: string;
  extra: string;
}

const linhas: Linha[] = [];
let ausentes = 0;

for (const { rota, secao } of rotasPrompt) {
  const chave = normalizarRota(rota);
  if (vistas.has(chave)) continue;
  vistas.add(chave);
  const achados = porRota.get(chave) ?? [];
  const tela = achados.find((a) => a.tipo === "tela");
  const resolver = achados.find((a) => a.tipo === "resolver");
  const api = achados.find((a) => a.tipo === "api");
  const alvo = tela ?? resolver ?? api;
  let estado: string;
  if (tela) estado = "tela";
  else if (resolver) estado = "resolver";
  else if (api) estado = "api";
  else {
    estado = "**ausente**";
    ausentes++;
  }
  linhas.push({
    secao,
    rota,
    estado,
    arquivo: alvo ? `\`${alvo.arquivo}\`` : "—",
    extra: alvo?.metodos?.length ? alvo.metodos.join("/") : (alvo?.flags.join(", ") ?? "—"),
  });
}

const promptSet = new Set(linhas.map((l) => normalizarRota(l.rota)));
const acrescimos = inventario.itens
  .filter((i) => i.tipo === "tela" || i.tipo === "resolver")
  .filter((i) => !promptSet.has(normalizarRota(i.rota)))
  .sort((a, b) => a.rota.localeCompare(b.rota));

const out: string[] = [];
out.push("# Reconciliação — rotas do prompt mestre × checkout");
out.push("");
out.push("> **Gerado por comando.** `pnpm exec tsx scripts/auditoria/reconciliar-rotas.ts`");
out.push("> Extrai a lista de rotas da seção *Inventário inicial de rotas a reconciliar* de");
out.push("> `PROMPT-MESTRE-AAA.md` e cruza com `inventario.json` (gerado do filesystem).");
out.push("> Rota do prompt sem correspondência no código aparece como **ausente** — e ausência");
out.push("> aqui não é remoção autorizada: é achado a justificar na Fase 1.");
out.push("");
out.push("| Medida | Valor |");
out.push("|---|---|");
out.push(`| Rotas citadas no prompt | **${linhas.length}** |`);
out.push(`| Telas encontradas | ${linhas.filter((l) => l.estado === "tela").length} |`);
out.push(`| Resolvers/redirects | ${linhas.filter((l) => l.estado === "resolver").length} |`);
out.push(`| Handlers de API | ${linhas.filter((l) => l.estado === "api").length} |`);
out.push(`| Ausentes no código | **${ausentes}** |`);
out.push(`| Rotas do código fora da lista do prompt | **${acrescimos.length}** |`);
out.push("");

let secaoAtual = "";
for (const l of linhas) {
  if (l.secao !== secaoAtual) {
    secaoAtual = l.secao;
    out.push(`## ${secaoAtual}`);
    out.push("");
    out.push("| Rota | Estado | Evidência |");
    out.push("|---|---|---|");
  }
  out.push(`| \`${l.rota}\` | ${l.estado} | ${l.arquivo}${l.extra !== "—" ? ` · ${l.extra}` : ""} |`);
}
out.push("");

out.push("## Acréscimos — existem no código e não estão na lista do prompt");
out.push("");
out.push("O prompt manda acrescentar toda rota que não estiver na lista. Estas são telas e");
out.push("resolvers (APIs ficam no inventário completo, para não inflar esta tabela).");
out.push("");
out.push("| Rota | Tipo | Arquivo |");
out.push("|---|---|---|");
for (const a of acrescimos) {
  out.push(`| \`${a.rota}\` | ${a.tipo} | \`${a.arquivo}\` |`);
}
out.push("");

writeFileSync(SAIDA, out.join("\n") + "\n");
console.log(
  `ok: ${linhas.length} rotas do prompt (${ausentes} ausentes), ${acrescimos.length} acréscimos → ${SAIDA}`,
);
