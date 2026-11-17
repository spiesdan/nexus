/**
 * TEXTO COM COR DE GRÁFICO É TEXTO QUE NÃO SE LÊ.
 *
 * ─── O QUE FOI MEDIDO (17/11/2026, `scripts/auditoria/contraste.mjs`) ──────
 *
 * 22 de 867 textos abaixo do mínimo AA em 8 telas. Todos os 22 eram a MESMA
 * classe de defeito, em dois disfarces:
 *
 *   1. **legenda de gráfico** pintada com a cor da série (Recharts, quando o
 *      `<Legend>` não tem `formatter`): "Inativos antigos" a **3,53:1** em
 *      `/app/indicadores`. A V-29 já tinha corrigido DUAS legendas assim; esta
 *      terceira escapou porque o conserto foi feito na instância, não na
 *      classe;
 *   2. **selo de status** usando a paleta de categoria como cor de texto:
 *      "Faturado" (magenta) a **4,13:1** em `/app/pedidos`, 12 px. O mesmo
 *      variant servia `amber` (**1,96:1** no claro), `sky` (4,04:1) e `ember`
 *      (3,53:1) — nenhum passava, só não estavam na tela medida.
 *
 * A paleta continua valendo para swatch, gráfico e ilustração. Texto usa
 * `-fg`: `--color-{amber,sky,ember,magenta}-fg`, por tema, todos ≥ 6,3:1.
 *
 * ─── POR QUE UM GATE ESTÁTICO ─────────────────────────────────────────────
 *
 * O instrumento de contraste só vê a tela que abriu. Um selo que ninguém
 * renderizou fica verde por omissão — e foi assim que `amber` a 1,96:1 passou
 * por duas rodadas. O gate cria a regra onde o defeito nasce.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const relativo = join(dir, nome);
    if (statSync(join(RAIZ, relativo)).isDirectory()) {
      saida.push(...arquivos(relativo));
    } else if (/\.(tsx|ts)$/.test(nome) && !nome.includes(".test.")) {
      saida.push(relativo);
    }
  }
  return saida;
}

const TODOS = arquivos("app").concat(arquivos("components"));

describe("legenda de gráfico não pinta o texto com a cor da série", () => {
  it.each(TODOS)("%s", (arquivo) => {
    const codigo = semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
    // `<Legend ... />` do Recharts: sem `formatter`, o rótulo herda a cor da série.
    const legendas = [...codigo.matchAll(/<Legend\b[\s\S]{0,400}?\/>/g)].map((m) => m[0]);
    const semFormatter = legendas.filter(
      (tag) => !/formatter=/.test(tag) && !/content=\{/.test(tag),
    );
    expect(
      semFormatter,
      `${arquivo}: <Legend> sem formatter — o rótulo sai na cor da série`,
    ).toEqual([]);
  });
});

describe("paleta de categoria não é cor de texto", () => {
  it.each(TODOS)("%s", (arquivo) => {
    const codigo = semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
    // `text-magenta` = token da paleta; `text-magenta-fg` = tom de texto;
    // `text-amber-500` = escala do Tailwind (outra coisa, e o contraste dela é
    // medido no navegador).
    const culpados = [...codigo.matchAll(/\btext-(mint|amber|sky|ember|magenta)(?![-a-z0-9])/g)].map(
      (m) => m[0],
    );
    expect(culpados, `${arquivo}: paleta de categoria como cor de texto`).toEqual([]);
  });
});
