/**
 * O TÍTULO DE PÁGINA É UMA FAMÍLIA SÓ — UM `h1` POR TELA, UM PESO POR PRODUTO.
 *
 * ─── O QUE FOI MEDIDO EM PRODUÇÃO (16/11/2026) ────────────────────────────
 *
 * `scripts/auditoria/titulos-de-pagina.ts` (estático, lendo a tela inteira e não
 * só o `page.tsx`) e a varredura de `<h1>` no DOM das 130 rotas estáticas
 * (`capturas/h1-em-producao.json`) mostraram dois desvios:
 *
 *   1. `/app/prospeccao` → `/app/campanhas?subtela=prospeccao` renderizava **dois
 *      `h1`** ("Campanha" e "Prospecção"): a subtela usava `NexusPageHeader` sem
 *      `headingLevel={2}`, e a árvore de acessibilidade anunciava duas páginas;
 *   2. o peso do `h1` ia de **500** (107 rotas, o do `NexusPageHeader`) a **600**
 *      em 11 — home, família de login, status e vitrine. Mesmo tamanho, peso
 *      diferente: ruído, não composição.
 *
 * ─── POR QUE UM GATE ESTÁTICO, SE A MEDIDA É NO DOM ───────────────────────
 *
 * jsdom não tem árvore de acessibilidade nem layout. O gate cobra a causa que
 * consegue ver no código — a subtela embutida declara nível 2, e `h1` de 24 px
 * não declara peso diferente do canônico —, e a medida no DOM fica no artefato,
 * com data, para quem quiser reconferir.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();

/** Arquivos cujo `<h1>` de identificador é composição declarada, não descuido. */
const IDENTIFICADOR_COMO_TITULO = new Set([
  // `#A1B2C3` em mono: o título da tela É o id da solicitação.
  "app/app/lgpd/requests/[id]/_client.tsx",
  // Orçamento público: "Orçamento #123" é o nome do documento para o cliente.
  "app/o/[token]/page.tsx",
]);

function arquivos(dir: string, extensao = ".tsx"): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const relativo = join(dir, nome);
    if (statSync(join(RAIZ, relativo)).isDirectory()) {
      saida.push(...arquivos(relativo, extensao));
    } else if (nome.endsWith(extensao) && !nome.includes(".test.")) {
      saida.push(relativo);
    }
  }
  return saida;
}

const DA_APP = arquivos("app");
const DA_CASA = arquivos("components");

describe("título de página: um peso só", () => {
  it.each(DA_APP.concat(DA_CASA))("%s", (arquivo) => {
    const codigo = semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
    // `<h1 ... text-2xl ... font-semibold>`: o peso do título canônico é 500.
    const fora = [...codigo.matchAll(/<h1\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => /\btext-2xl\b/.test(tag) && /\bfont-(semibold|bold)\b/.test(tag));
    if (IDENTIFICADOR_COMO_TITULO.has(arquivo)) {
      expect(fora.length, `${arquivo} saiu da allowlist de identificador`).toBeGreaterThan(0);
      return;
    }
    expect(fora, `${arquivo}: h1 de 24 px com peso diferente de font-medium`).toEqual([]);
  });
});

describe("subtela embutida não emite o segundo `h1`", () => {
  /** Arquivos que importam a tela de OUTRA rota (subtela/painel embutido). */
  const importadores = DA_APP.filter((arquivo) =>
    /from "\.\.\/[^"]*\/_client"/.test(readFileSync(join(RAIZ, arquivo), "utf8")),
  );

  it("há subtela embutida no produto (o teste não passa por vacuidade)", () => {
    expect(importadores.length).toBeGreaterThan(0);
  });

  it.each(importadores)("%s", (arquivo) => {
    const codigo = readFileSync(join(RAIZ, arquivo), "utf8");
    const pasta = dirname(join(RAIZ, arquivo));
    for (const m of codigo.matchAll(/from "(\.\.\/[^"]*\/_client)"/g)) {
      const alvo = resolve(pasta, `${m[1]}.tsx`);
      const alvoRelativo = relative(RAIZ, alvo);
      let fonte: string;
      try {
        fonte = semComentarios(readFileSync(alvo, "utf8"));
      } catch {
        continue; // import não resolve para arquivo — outra regra cobre isso
      }
      if (!/<NexusPageHeader\b/.test(fonte)) continue;
      // A tela embutida desenha cabeçalho: ele não pode ser `h1` de novo.
      expect(fonte, `${alvoRelativo}: subtela com NexusPageHeader sem headingLevel={2}`).toMatch(
        /<NexusPageHeader\b[\s\S]{0,300}?headingLevel=\{2\}/,
      );
    }
  });
});
