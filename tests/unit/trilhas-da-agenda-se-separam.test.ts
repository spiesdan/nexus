/**
 * AS OITO TRILHAS DE PESSOA SE DISTINGUEM — MEDIDO, NÃO OLHADO.
 *
 * ─── O DEFEITO (18/11/2026) ───────────────────────────────────────────────
 *
 * As trilhas eram da era Sage e nunca tinham sido medidas contra o accent
 * ATUAL (violeta, h≈283). Medido no tema escuro:
 *
 *   trilha violeta × accent ................ **0,040**  (indistinguível do selecionado)
 *   pior par sob dicromacia (turquesa×framboesa)  **0,009**  (a mesma cor para quem tem deuteranopia)
 *   pior par de visão normal .............. 0,116
 *
 * E a inicial do avatar, pintada SOBRE a trilha com um foreground único
 * (Carbon), reprovava em três trilhas do claro: azul **3,2:1**, telha 3,2 e
 * violeta 3,3 — abaixo do piso AA de 4,5 para texto.
 *
 * ─── COMO AS NOVAS FORAM ESCOLHIDAS ───────────────────────────────────────
 *
 * Matiz fixo por NOME (as janelas abaixo — "Telha, Âmbar, Oliva…" é requisito
 * de nomeabilidade), croma ≤ 0,12, e a luminosidade otimizada para maximizar o
 * MENOR de três distâncias OKLab: pares entre pessoas, pares sob dicromacia e
 * distância ao accent. `deltaESimulado` é o pior caso entre deuteranopia e
 * protanopia — nenhum modelo de média, porque basta uma visão em que as duas
 * colapsam para a informação se perder.
 *
 * O resultado (mesmos números que `scripts/auditoria/trilhas-da-agenda.ts`
 * grava): par ≥ 0,079 · dicromacia ≥ 0,065 · accent ≥ 0,065. O pior par de
 * visão normal CAIU de 0,116 para 0,079 e isso é a troca declarada: o mínimo
 * agora equilibra os três eixos, e antes a paleta gastava tudo em matiz com
 * dois pares idênticos para quem tem dicromacia.
 *
 * ─── POR QUE ESTE GATE É DE TOKEN ─────────────────────────────────────────
 *
 * Distância entre cores e contraste de texto sobre cor não dependem de layout.
 * O gate mede os valores do CSS — os mesmos que o produto pinta — e reproduz o
 * número que está no relatório. Uma captura provaria o mesmo e não sobreviveria
 * a um reskin.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deltaEOklab, hexParaOklch } from "@/lib/branding/rampa";
import { deltaESimulado, razaoDeContraste } from "@/lib/branding/contraste";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");
const PALETA = fs.readFileSync(path.join(RAIZ, "components", "agenda", "paleta.ts"), "utf8");
const AVATAR = fs.readFileSync(
  path.join(RAIZ, "components", "agenda", "AvatarDaPessoa.tsx"),
  "utf8",
);

const TRILHAS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const NOMES = ["telha", "âmbar", "oliva", "turquesa", "azul", "índigo", "violeta", "framboesa"];

/** Janelas de matiz por nome — o que impede o otimizador de virar sopa de cores. */
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

const PISO_PAR = 0.075;
const PISO_SIMULADO = 0.06;
const PISO_ACCENT = 0.06;
const PISO_GRAFICO = 3;
const PISO_TEXTO = 4.5;

function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei \`${seletor}\` em globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

const TEMA = { claro: bloco(":root"), escuro: bloco('[data-theme="dark"]') };
const SUPERFICIE = { claro: "#ffffff", escuro: "#1c1c1c" } as const;

function brutoDe(texto: string, prop: string): string {
  const m = new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(texto);
  if (!m) throw new Error(`${prop} não declarado`);
  return m[1]!.trim();
}

function hexDe(tema: "claro" | "escuro", prop: string): string {
  const texto = TEMA[tema];
  let atual = prop;
  for (let i = 0; i < 6; i += 1) {
    let valor: string;
    try {
      valor = brutoDe(texto, atual);
    } catch {
      valor = brutoDe(TEMA.claro, atual);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(valor)) return valor.toLowerCase();
    const via = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(valor);
    if (!via?.[1]) throw new Error(`${atual} não resolve para hex (${valor})`);
    atual = via[1];
  }
  throw new Error(`${prop} não resolve para hex`);
}

const cores = (tema: "claro" | "escuro") => TRILHAS.map((n) => hexDe(tema, `--agenda-pessoa-${n}`));

describe("as trilhas de pessoa se distinguem (18/11/2026)", () => {
  it.each(["claro", "escuro"] as const)("%s: par mais próximo ≥ 0,075", (tema) => {
    const lista = cores(tema);
    let pior = { d: 9, par: "" };
    for (let i = 0; i < lista.length; i += 1)
      for (let j = i + 1; j < lista.length; j += 1) {
        const d = deltaEOklab(lista[i]!, lista[j]!);
        if (d < pior.d) pior = { d, par: `${NOMES[i]}×${NOMES[j]}` };
      }
    expect(
      pior.d,
      `pior par no tema ${tema}: ${pior.par} = ${pior.d.toFixed(3)}`,
    ).toBeGreaterThanOrEqual(PISO_PAR);
  });

  it.each(["claro", "escuro"] as const)("%s: pares sobrevivem à dicromacia ≥ 0,06", (tema) => {
    const lista = cores(tema);
    let pior = { d: 9, par: "" };
    for (let i = 0; i < lista.length; i += 1)
      for (let j = i + 1; j < lista.length; j += 1) {
        const d = deltaESimulado(lista[i]!, lista[j]!);
        if (d < pior.d) pior = { d, par: `${NOMES[i]}×${NOMES[j]}` };
      }
    // Era **0,009** antes da re-derivação: turquesa e framboesa eram a mesma
    // cor para quem tem deuteranopia.
    expect(
      pior.d,
      `pior par sob dicromacia no tema ${tema}: ${pior.par} = ${pior.d.toFixed(3)}`,
    ).toBeGreaterThanOrEqual(PISO_SIMULADO);
  });

  it.each(["claro", "escuro"] as const)("%s: nenhuma trilha imita o accent", (tema) => {
    const accent = hexDe(tema, "--color-accent");
    for (const [i, hex] of cores(tema).entries()) {
      const d = deltaEOklab(hex, accent);
      // Era 0,040 (violeta no escuro): a trilha parecia o estado selecionado.
      expect(d, `${NOMES[i]} a ${d.toFixed(3)} do accent no tema ${tema}`).toBeGreaterThanOrEqual(
        PISO_ACCENT,
      );
    }
  });

  it.each(["claro", "escuro"] as const)("%s: cada nome mora na sua janela de matiz", (tema) => {
    for (const [i, hex] of cores(tema).entries()) {
      const n = TRILHAS[i]!;
      const [lo, hi] = JANELAS[n]!;
      const h = hexParaOklch(hex).h;
      expect(
        h,
        `${NOMES[i]} (${tema}) com matiz ${h.toFixed(0)}° fora de ${lo}–${hi}°`,
      ).toBeGreaterThanOrEqual(lo);
      expect(
        h,
        `${NOMES[i]} (${tema}) com matiz ${h.toFixed(0)}° fora de ${lo}–${hi}°`,
      ).toBeLessThanOrEqual(hi);
    }
  });
});

describe("a trilha como gráfico e as iniciais como texto", () => {
  it.each(["claro", "escuro"] as const)("%s: trilha contra a superfície ≥ 3:1", (tema) => {
    for (const [i, hex] of cores(tema).entries()) {
      const r = razaoDeContraste(hex, SUPERFICIE[tema]);
      expect(r, `${NOMES[i]} como gráfico (${tema}) = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        PISO_GRAFICO,
      );
    }
  });

  it.each(["claro", "escuro"] as const)("%s: iniciais sobre a trilha ≥ 4,5:1", (tema) => {
    for (const [i, hex] of cores(tema).entries()) {
      const n = TRILHAS[i]!;
      const fg = hexDe(tema, `--agenda-pessoa-${n}-fg`);
      const r = razaoDeContraste(hex, fg);
      // Antes: foreground único (Carbon) dava 3,2:1 sobre o azul do claro.
      expect(r, `iniciais sobre ${NOMES[i]} (${tema}) = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        PISO_TEXTO,
      );
    }
  });

  it("o avatar usa a frente POR TRILHA, e o helper devolve a variável", () => {
    expect(AVATAR).toContain("frenteDaTrilha");
    expect(PALETA).toMatch(
      /frenteDaTrilha\(trilha: TrilhaDeCor\)[\s\S]*?--agenda-pessoa-\$\{trilha\}-fg/,
    );
  });
});
