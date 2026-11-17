/**
 * DE ONDE VEM O TÍTULO DE CADA TELA — e quantos `h1` a tela tem de verdade.
 *
 * ─── POR QUE ISSO É UM INSTRUMENTO, E NÃO UM GREP ─────────────────────────
 *
 * `grep -rl '<h1' app/app` responde **28 arquivos**, e esse número está errado:
 * metade das ocorrências é `<h1>` dentro de COMENTÁRIO explicando por que a
 * tela passou a usar o componente — e comentário não desenha título. Foi assim
 * que a contagem anterior desta auditoria quase virou achado. Aqui o texto passa
 * por `semComentarios()` (a mesma função da matriz de estados, com teste) e a
 * tela é lida por `arquivosDaTela()` — `page.tsx` + `_client` + `_components` +
 * imports relativos —, porque 89 das 156 telas delegam o desenho para um
 * arquivo local.
 *
 * ─── O QUE ELE MEDE ───────────────────────────────────────────────────────
 *
 * Por rota: título pela fonte canônica (`NexusPageHeader`, que desenha `h1` —
 * ou `h2` quando recebe `headingLevel={2}`), `h1` escritos à mão, a família de
 * tamanho usada em cada um e se a tela tem breadcrumb. Nada aqui julga: o
 * julgamento (o que é defeito e o que é composição intencional) mora no doc —
 * é o item 2.16 do prompt.
 *
 * Uso:
 *   pnpm exec tsx scripts/auditoria/titulos-de-pagina.ts
 *   pnpm exec tsx scripts/auditoria/titulos-de-pagina.ts --check   # só o resumo
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { arquivosDaTela, semComentarios } from "./segmento-de-rota";

const RAIZ = process.cwd();
const SAIDA = join(RAIZ, "docs", "auditoria", "capturas", "titulos-de-pagina.json");
const SO_CHECK = process.argv.includes("--check");

interface Medida {
  rota: string;
  arquivo: string;
  /** `NexusPageHeader` desenha o título (canônico). */
  porHeader: boolean;
  /** `headingLevel={2}` — o `h1` é da tela, não do componente. */
  headerNivel2: boolean;
  /** `<h1` reais, fora de comentário. */
  h1Proprios: number;
  /** Tamanho tipográfico declarado em cada `h1` próprio. */
  tamanhos: string[];
  temBreadcrumb: boolean;
}

/** Walk de `app/**\/page.tsx`. */
function paginas(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome.startsWith("@")) continue; // slot paralelo não é rota
      saida.push(...paginas(caminho));
    } else if (nome === "page.tsx") {
      saida.push(caminho);
    }
  }
  return saida;
}

function rotaDoArquivo(arquivo: string): string {
  const partes = relative(join(RAIZ, "app"), join(arquivo, ".."))
    .split(sep)
    .filter((p) => p && !p.startsWith("(") && !p.startsWith("@"));
  return "/" + partes.map((p) => p.replace(/^\[(.+)\]$/, ":$1")).join("/");
}

/** `className="..."` do trecho a partir do `<h1`. */
function classeDoH1(trecho: string): string {
  const m = trecho.match(/<h1[^>]*className=(?:"([^"]+)"|\{`([^`]+)`\})/);
  return m?.[1] ?? m?.[2] ?? "";
}

/** Família tipográfica: `text-2xl` → `2xl`; `text-[28px]` → `28px`. */
function familia(classe: string): string {
  const m = classe.match(/\btext-(?:\[([^\]]+)\]|(xs|sm|base|lg|xl|[2-9]xl))\b/);
  return m ? (m[1] ?? m[2] ?? "") : "herdado";
}

const medidas: Medida[] = [];

for (const pagina of paginas(join(RAIZ, "app"))) {
  const rota = rotaDoArquivo(pagina);
  // `arquivosDaTela` espera caminho RELATIVO à raiz (o caminho absoluto cai
  // no `readdirSync` protegido e devolve lista vazia em silêncio — 156 telas
  // "sem título" foi como este instrumento se delatou na primeira rodada).
  const { arquivos } = arquivosDaTela(RAIZ, relative(RAIZ, join(pagina, "..")));
  const texto = arquivos.map((a) => semComentarios(readFileSync(a, "utf8"))).join("\n");
  // Índice + fatia, não `regex` com lookahead: a primeira versão usava
  // `[\s\S]{0,300}?(?=<h1|$)` e devolvia ZERO blocos sempre que havia um `h1`
  // só com mais de 300 caracteres depois — o lookahead nunca alcançava o fim do
  // arquivo, e o instrumento relatava "nenhuma família de tamanho" em 55 telas.
  const h1 = [...texto.matchAll(/<h1[\s>]/g)].map((m) => texto.slice(m.index, m.index + 300));

  medidas.push({
    rota,
    arquivo: relative(RAIZ, pagina),
    porHeader: /<NexusPageHeader\b/.test(texto),
    headerNivel2: /<NexusPageHeader\b[\s\S]{0,400}?headingLevel=\{?2\}?/.test(texto),
    h1Proprios: h1.length,
    tamanhos: h1.map((trecho) => familia(classeDoH1(trecho))),
    temBreadcrumb: /Breadcrumb/.test(texto),
  });
}

medidas.sort((a, b) => a.rota.localeCompare(b.rota));

const semTitulo = medidas.filter((m) => !m.porHeader && m.h1Proprios === 0);
const doisH1 = medidas.filter((m) => m.porHeader && !m.headerNivel2 && m.h1Proprios > 0);
const h1Repetido = medidas.filter((m) => m.h1Proprios > 1);
const familias = new Map<string, number>();
for (const m of medidas) {
  for (const t of m.tamanhos) familias.set(t, (familias.get(t) ?? 0) + 1);
}

if (!SO_CHECK) {
  mkdirSync(join(RAIZ, "docs", "auditoria", "capturas"), { recursive: true });
  writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        aviso:
          "`semTitulo`, `doisH1` e `h1Repetido` são SINAL estático: o mesmo arquivo " +
          "pode renderizar `h1` em ramos diferentes (impressão, modal, estado de erro) e " +
          "o título pode vir de um componente fora do segmento. A prova é a varredura de " +
          "DOM em `h1-em-producao.json` — em 16/11/2026 ela mostrou 1 `h1` visível por " +
          "tela em todas as rotas, com 2 só em `/design` (showcase).",
        medido_em: new Date().toISOString(),
        telas: medidas.length,
        porHeader: medidas.filter((m) => m.porHeader).length,
        h1Proprios: medidas.filter((m) => m.h1Proprios > 0).length,
        semTitulo: semTitulo.map((m) => m.rota),
        doisH1: doisH1.map((m) => m.rota),
        h1Repetido: h1Repetido.map((m) => `${m.rota} (${m.h1Proprios})`),
        familiasDeTamanho: Object.fromEntries([...familias].sort((a, b) => b[1] - a[1])),
        comBreadcrumb: medidas.filter((m) => m.temBreadcrumb).length,
        medidas,
      },
      null,
      2,
    ) + "\n",
  );
}

console.log(`telas (page.tsx): ${medidas.length}`);
console.log(`  título pelo NexusPageHeader: ${medidas.filter((m) => m.porHeader).length}`);
console.log(`  h1 escrito à mão:           ${medidas.filter((m) => m.h1Proprios > 0).length}`);
console.log(`  sem título nenhum:          ${semTitulo.length}${semTitulo.length ? " → " + semTitulo.map((m) => m.rota).join(", ") : ""}`);
console.log(`  DOIS h1 na mesma tela:      ${doisH1.length}${doisH1.length ? " → " + doisH1.map((m) => m.rota).join(", ") : ""}`);
console.log(`  h1 repetido (>1 no arquivo):${h1Repetido.length}${h1Repetido.length ? " → " + h1Repetido.map((m) => `${m.rota} (${m.h1Proprios})`).join(", ") : ""}`);
console.log(`  com breadcrumb:             ${medidas.filter((m) => m.temBreadcrumb).length}`);
console.log(`  famílias de tamanho de h1:  ${[...familias].map(([f, n]) => `${f}×${n}`).join(" · ")}`);
if (!SO_CHECK) console.log(`\nartefato: ${SAIDA}`);
