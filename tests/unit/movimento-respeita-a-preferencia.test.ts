/**
 * MOVIMENTO REDUZIDO — o CSS cobre a animação, não a rolagem programática.
 *
 * ─── O QUE JÁ ESTAVA CERTO ────────────────────────────────────────────────
 *
 * `app/globals.css` tem a regra global (`*`, `*::before`, `*::after` com
 * `animation-duration` e `transition-duration` em 0,01 ms e `!important`) e as
 * exceções nomeadas (`card-pulse`, `agenda-coluna-horarios`,
 * `assistente-painel-entra`, `nexus-spinner`). Medido na V-26: 0 de 20
 * elementos seguiam animando.
 *
 * ─── O QUE O CSS NÃO ALCANÇA ──────────────────────────────────────────────
 *
 * Rolagem suave pedida por JavaScript ignora a preferência: a opção
 * `behavior: "smooth"` passada em `scrollIntoView`/`scrollTo` vence o
 * `scroll-behavior` do CSS. Eram **oito** pontos no produto — o formulário do
 * pedido ao revelar erro, o "revisar" do resumo, a parada da expedição, a linha
 * da empresa na prospecção, o bloco de ações fiscais, a conversa do assistente
 * e o "editar campos" do dossiê do lead.
 *
 * A correção foi um ponto único (`lib/ui/movimento.ts`) e o gate abaixo.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";
import { prefereMovimentoReduzido, rolarPara } from "@/lib/ui/movimento";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const rel = path.join(dir, nome);
    if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) saida.push(...arquivos(rel));
    else if (/\.(tsx|ts)$/.test(nome) && !nome.includes(".test.")) saida.push(rel);
  }
  return saida;
}

describe("a regra global de movimento reduzido continua de pé", () => {
  it("existe e cobre tudo, com duração ~zero", () => {
    const bloco = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(bloco).toMatch(/\*,\s*\n?\s*\*::before,\s*\n?\s*\*::after/);
    expect(bloco).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(bloco).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    // `scroll-behavior: auto` no CSS é o outro lado da mesma moeda.
    expect(bloco).toMatch(/scroll-behavior:\s*auto/);
  });

  it("as animações nomeadas têm a própria media query", () => {
    for (const classe of ["card-pulse", "agenda-coluna-horarios", "assistente-painel-entra", "nexus-spinner"]) {
      const i = CSS.indexOf(`.${classe}`);
      expect(i, `classe ${classe} sumiu do CSS`).toBeGreaterThan(-1);
      // Existe uma media query de movimento reduzido citando a classe.
      const trechos = [...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g)].map(
        (m) => m[0],
      );
      expect(
        trechos.some((t) => t.includes(classe)),
        `${classe} sem tratamento em prefers-reduced-motion`,
      ).toBe(true);
    }
  });
});

describe("rolagem programática passa pelo helper", () => {
  it("nenhum `behavior: \"smooth\"` fora de lib/ui/movimento.ts", () => {
    const culpados: string[] = [];
    for (const arquivo of arquivos("app").concat(arquivos("components")).concat(arquivos("lib")).concat(arquivos("hooks"))) {
      if (arquivo.endsWith(path.join("lib", "ui", "movimento.ts"))) continue;
      const codigo = semComentarios(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"));
      if (/behavior:\s*["']smooth["']/.test(codigo)) culpados.push(arquivo);
    }
    expect(culpados, "use rolarPara/rolarDentroDe (lib/ui/movimento.ts)").toEqual([]);
  });

  it("o helper consulta a preferência e mantém o destino", () => {
    // `matchMedia` do jsdom devolve `matches: false`; a preferência é simulada
    // trocando a função — o que se prova aqui é o CONTRATO, não o navegador.
    const original = window.matchMedia;
    const chamadas: ScrollIntoViewOptions[] = [];
    const alvo = document.createElement("div");
    alvo.scrollIntoView = ((o?: ScrollIntoViewOptions) => chamadas.push(o ?? {})) as never;

    window.matchMedia = ((q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    expect(prefereMovimentoReduzido()).toBe(true);
    rolarPara(alvo, { block: "center" });
    expect(chamadas.at(-1)).toMatchObject({ behavior: "auto", block: "center" });

    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    expect(prefereMovimentoReduzido()).toBe(false);
    rolarPara(alvo, { block: "center" });
    expect(chamadas.at(-1)).toMatchObject({ behavior: "smooth", block: "center" });

    window.matchMedia = original;
  });
});
