/**
 * AS OITO TRILHAS DE COR DA AGENDA, MEDIDAS — não escolhidas a olho.
 *
 * ─── O QUE ESTE INSTRUMENTO RESPONDE ──────────────────────────────────────
 *
 * Três perguntas, as três em OKLab (a unidade do resto do repositório):
 *
 *   1. duas PESSOAS se distinguem?  → menor ΔE entre pares, nos dois temas;
 *   2. e para quem tem dicromacia?  → o pior caso entre deuteranopia e
 *      protanopia (`deltaESimulado`), nunca a média: basta uma visão em que as
 *      duas colapsam para a pessoa perder a informação;
 *   3. alguma trilha parece o ACCENT? → menor distância de cada trilha ao
 *      accent do tema. Foi este número que motivou a re-derivação de 18/11: a
 *      trilha violeta do escuro ficava a 0,040 do accent, indistinguível do
 *      estado selecionado.
 *
 * E duas de contraste, que não são de cor-identidade mas quebram junto:
 *
 *   4. a trilha como GRÁFICO (ponto/faixa) contra a superfície → piso 3:1
 *      (WCAG 1.4.11, conteúdo não textual);
 *   5. as INICIAIS pintadas sobre a trilha (`--agenda-pessoa-N-fg`) → piso
 *      4,5:1 (texto normal).
 *
 * ─── POR QUE LER O CSS, E NÃO UMA LISTA AQUI ──────────────────────────────
 *
 * A lista duplicada no instrumento envelhece; a do CSS é a que o produto pinta.
 * O artefato em `docs/auditoria/capturas/trilhas-da-agenda.json` é a evidência
 * versionada, e `tests/unit/trilhas-da-agenda-se-separam.test.ts` aplica os
 * mesmos pisos no CI.
 *
 * Uso:
 *   pnpm exec tsx scripts/auditoria/trilhas-da-agenda.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { deltaEOklab, hexParaOklch } from "../../lib/branding/rampa";
import { deltaESimulado, razaoDeContraste } from "../../lib/branding/contraste";

const RAIZ = process.cwd();
const CSS = readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");

const NOMES = ["telha", "âmbar", "oliva", "turquesa", "azul", "índigo", "violeta", "framboesa"];
const TRILHAS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Janelas de matiz por NOME — o que impede o otimizador de virar sopa de cores. */
const JANELAS: Record<number, [number, number]> = {
  1: [18, 46],
  2: [55, 88],
  3: [92, 128],
  4: [170, 202],
  5: [205, 240],
  6: [244, 260],
  7: [298, 316],
  8: [328, 356],
};

function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei \`${seletor}\` em globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

const TEMA = { claro: bloco(":root"), escuro: bloco('[data-theme="dark"]') };

/** Valor bruto de um token (hex ou `var(--outro)`). */
function brutoDe(texto: string, prop: string): string {
  const m = new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(texto);
  if (!m) throw new Error(`${prop} não declarado`);
  return m[1]!.trim();
}

/**
 * Resolve o token até hex, seguindo `var(--x)` — `--color-accent` é alias da
 * rampa, não um literal. Um alias que não resolve vira erro, nunca um default:
 * medir contra uma cor inventada é pior que não medir.
 */
function hexDe(texto: string, prop: string): string {
  let atual = prop;
  for (let i = 0; i < 6; i += 1) {
    const valor =
      brutoDe(TEMA.claro, atual) === ""
        ? ""
        : ((): string => {
            try {
              return brutoDe(texto, atual);
            } catch {
              return brutoDe(TEMA.claro, atual);
            }
          })();
    if (/^#[0-9a-fA-F]{6}$/.test(valor)) return valor.toLowerCase();
    const via = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(valor);
    if (!via?.[1]) throw new Error(`${atual} não resolve para hex (${valor})`);
    atual = via[1];
  }
  throw new Error(`${prop} não resolve para hex`);
}

const SUPERFICIE = { claro: "#ffffff", escuro: "#1c1c1c" } as const;

type Linha = {
  trilha: number;
  nome: string;
  hex: string;
  matiz: number;
  matizNaJanela: boolean;
  graficoSobreSuperficie: number;
  iniciais: number;
};

type Medida = {
  tema: "claro" | "escuro";
  parMaisProximo: { a: string; b: string; deltaE: number };
  simuladoMaisProximo: { a: string; b: string; deltaE: number };
  trilhaMaisProximaDoAccent: { nome: string; deltaE: number };
  trilhas: Linha[];
};

function medir(tema: "claro" | "escuro"): Medida {
  const texto = TEMA[tema];
  const accent = hexDe(texto, tema === "claro" ? "--color-accent" : "--color-accent");
  const superf = SUPERFICIE[tema];

  const trilhas: Linha[] = TRILHAS.map((n) => {
    const hex = hexDe(texto, `--agenda-pessoa-${n}`);
    const fg = hexDe(texto, `--agenda-pessoa-${n}-fg`);
    const matiz = hexParaOklch(hex).h;
    const [lo, hi] = JANELAS[n]!;
    return {
      trilha: n,
      nome: NOMES[n - 1]!,
      hex,
      matiz: Number(matiz.toFixed(1)),
      matizNaJanela: matiz >= lo && matiz <= hi,
      graficoSobreSuperficie: Number(razaoDeContraste(hex, superf).toFixed(2)),
      iniciais: Number(razaoDeContraste(hex, fg).toFixed(2)),
    };
  });

  let par = { a: "", b: "", deltaE: 9 };
  let sim = { a: "", b: "", deltaE: 9 };
  for (let i = 0; i < trilhas.length; i += 1) {
    for (let j = i + 1; j < trilhas.length; j += 1) {
      const a = trilhas[i]!;
      const b = trilhas[j]!;
      const d = deltaEOklab(a.hex, b.hex);
      if (d < par.deltaE) par = { a: a.nome, b: b.nome, deltaE: Number(d.toFixed(3)) };
      const s = deltaESimulado(a.hex, b.hex);
      if (s < sim.deltaE) sim = { a: a.nome, b: b.nome, deltaE: Number(s.toFixed(3)) };
    }
  }

  let acc = { nome: "", deltaE: 9 };
  for (const t of trilhas) {
    const d = deltaEOklab(t.hex, accent);
    if (d < acc.deltaE) acc = { nome: t.nome, deltaE: Number(d.toFixed(3)) };
  }

  return {
    tema,
    parMaisProximo: par,
    simuladoMaisProximo: sim,
    trilhaMaisProximaDoAccent: acc,
    trilhas,
  };
}

const medidas = [medir("claro"), medir("escuro")];

const resumo = {
  medido_em: new Date().toISOString(),
  pisos: { par: 0.075, simulado: 0.06, accent: 0.06, grafico: 3, iniciais: 4.5 },
  medidas,
  violacoes: medidas.flatMap((m) => [
    ...(m.parMaisProximo.deltaE < 0.075
      ? [`${m.tema}: par ${m.parMaisProximo.a}×${m.parMaisProximo.b} = ${m.parMaisProximo.deltaE}`]
      : []),
    ...(m.simuladoMaisProximo.deltaE < 0.06
      ? [
          `${m.tema}: simulado ${m.simuladoMaisProximo.a}×${m.simuladoMaisProximo.b} = ${m.simuladoMaisProximo.deltaE}`,
        ]
      : []),
    ...(m.trilhaMaisProximaDoAccent.deltaE < 0.06
      ? [
          `${m.tema}: ${m.trilhaMaisProximaDoAccent.nome} a ${m.trilhaMaisProximaDoAccent.deltaE} do accent`,
        ]
      : []),
    ...m.trilhas
      .filter((t) => !t.matizNaJanela)
      .map((t) => `${m.tema}: ${t.nome} fora da janela de matiz (${t.matiz}°)`),
    ...m.trilhas
      .filter((t) => t.graficoSobreSuperficie < 3)
      .map((t) => `${m.tema}: ${t.nome} como gráfico = ${t.graficoSobreSuperficie}:1`),
    ...m.trilhas
      .filter((t) => t.iniciais < 4.5)
      .map((t) => `${m.tema}: iniciais sobre ${t.nome} = ${t.iniciais}:1`),
  ]),
};

const arquivo = path.join(RAIZ, "docs", "auditoria", "capturas", "trilhas-da-agenda.json");
writeFileSync(arquivo, JSON.stringify(resumo, null, 2) + "\n");

for (const m of medidas) {
  console.log(`\n══ ${m.tema}`);
  console.log(
    `  par ${m.parMaisProximo.a}×${m.parMaisProximo.b} = ${m.parMaisProximo.deltaE}` +
      ` · simulado ${m.simuladoMaisProximo.a}×${m.simuladoMaisProximo.b} = ${m.simuladoMaisProximo.deltaE}` +
      ` · accent ${m.trilhaMaisProximaDoAccent.nome} = ${m.trilhaMaisProximaDoAccent.deltaE}`,
  );
  for (const t of m.trilhas) {
    console.log(
      `  ${t.trilha} ${t.nome.padEnd(9)} ${t.hex} h=${String(t.matiz).padStart(5)}` +
        `${t.matizNaJanela ? "" : " (FORA)"}` +
        ` · gráfico ${t.graficoSobreSuperficie} · iniciais ${t.iniciais}`,
    );
  }
}

console.log(
  `\n${resumo.violacoes.length === 0 ? "todos os pisos passam" : `${resumo.violacoes.length} violações`}`,
);
for (const v of resumo.violacoes) console.log(`  ✗ ${v}`);
console.log(`→ ${path.relative(RAIZ, arquivo)}`);
