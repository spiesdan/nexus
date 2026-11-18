/**
 * ACENTO COMO TEXTO — O TOKEN QUE FALTAVA.
 *
 * ─── O QUE FOI MEDIDO (18/11/2026, `app/globals.css` + OKLab/WCAG) ─────────
 *
 * O produto usa o accent em DOIS papéis, e até esta branch havia um token só:
 *
 *   PREENCHIMENTO (`bg-accent`): `#7e77f0` no claro. O texto por cima é Carbon
 *   (`--color-accent-fg`) e dá 4,80:1 — passa.
 *
 *   TINTA (`text-accent`): o MESMO `#7e77f0`, agora sobre a página. No claro:
 *   **3,63:1** sobre `--color-surface`, 3,39 sobre `bg`, 3,48 sobre a elevada e
 *   **3,06:1** sobre `--color-accent-soft` (o `Badge` default). Piso AA de texto
 *   normal: 4,5:1. No ESCURO o mesmo token dá 7,63:1 — por isso o defeito só
 *   existia de um lado e nunca apareceu nas medições feitas no tema padrão.
 *
 * Eram **140 usos** de `text-accent` (link "Ver detalhes", aba ativa, selo,
 * ícone). Escurecer `--color-accent` não é opção: ele é o fill do botão
 * primário, e escurecê-lo derrubaria o par com o Carbon. São dois papéis → dois
 * tokens: `--color-accent-ink` (`accent-700` no claro, `accent-400` no escuro,
 * os dois PARADAS DA RAMPA para acompanhar a marca do revendedor).
 *
 * ─── O SEGUNDO DEFEITO, DE GRAÇA ──────────────────────────────────────────
 *
 * `Button variant="destructive"` e o `NexusConfirmDialog` pintavam
 * `bg-error text-white` com o branco FIXO. No escuro, branco sobre o
 * `--color-error` (#c87263) dá **3,48:1**. O token `--destructive-foreground`
 * já existia e já declarava o lado certo do escuro; o componente é que não o
 * usava. O contador do sino (10 px) usava o token e estava certo.
 *
 * ─── POR QUE UM GATE, E NÃO SÓ O CODEMOD ──────────────────────────────────
 *
 * `text-accent` é uma classe válida e tentadora; sem régua, o próximo componente
 * reintroduz o par. As asserções medem os TOKENS (não a aparência de uma tela):
 * o dia em que alguém mexer nos hex, a conta reprova antes de a tela existir.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");

/** Recorta o bloco de tema por seletor no começo da linha. */
function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei \`${seletor}\` em globals.css`);
  const fim = CSS.indexOf("\n}", i);
  return CSS.slice(i, fim);
}

const TEMA = {
  claro: bloco(":root"),
  escuro: bloco('[data-theme="dark"]'),
};

const PONTE = bloco("@theme inline");

function mapa(texto: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const linha of texto.split("\n")) {
    const l = linha.trim();
    if (!l.startsWith("--")) continue;
    const corte = l.indexOf(":");
    m.set(l.slice(0, corte).trim(), l.slice(corte + 1).replace(/;$/, "").trim());
  }
  return m;
}

const MAPAS = { claro: mapa(TEMA.claro), escuro: mapa(TEMA.escuro) };
const PONTE_MAPA = mapa(PONTE);

const canal = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** `rgba(r, g, b, a)` — o soft do escuro é translúcido. */
const rgba = (valor: string): { rgb: [number, number, number]; a: number } | null => {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(valor);
  if (!m) return null;
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
};

/** Resolve `--x` seguindo `var(--y)` pela ponte e pelo tema. */
function cor(prop: string, tema: "claro" | "escuro"): [number, number, number] | null {
  let atual = prop;
  for (let i = 0; i < 8; i++) {
    const bruto = MAPAS[tema].get(atual) ?? PONTE_MAPA.get(atual);
    if (!bruto) return null;
    const direto = canal(bruto);
    if (direto) return direto;
    const comAlfa = rgba(bruto);
    if (comAlfa) {
      // Compõe sobre a superfície: é onde o badge/soft de fato é pintado.
      const base = comAlfa.a >= 1 ? null : cor("--color-surface", tema);
      if (comAlfa.a >= 1 || !base) return comAlfa.rgb;
      return comAlfa.rgb.map((v, idx) =>
        Math.round(v * comAlfa.a + base[idx]! * (1 - comAlfa.a)),
      ) as [number, number, number];
    }
    const via = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(bruto);
    if (!via?.[1]) return null;
    if (via[1] === atual) return MAPAS[tema].get(atual) ? canal(MAPAS[tema].get(atual)!) : null;
    atual = via[1];
  }
  return null;
}

const luminancia = ([r, g, b]: [number, number, number]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const razao = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((i, j) => j - i) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const MINIMO_AA = 4.5;

describe("a tinta do accent passa AA nos dois temas", () => {
  const FUNDOS = [
    "--color-bg",
    "--color-surface",
    "--color-surface-elevated",
    // O `Badge` default pinta a tinta sobre o soft, e é onde o par antigo era o
    // pior de todos (3,06:1).
    "--color-accent-soft",
  ];

  it.each(["claro", "escuro"] as const)("%s: --color-accent-ink", (tema) => {
    const tinta = cor("--color-accent-ink", tema);
    expect(tinta, "`--color-accent-ink` não resolve para hex no tema " + tema).not.toBeNull();

    for (const fundo of FUNDOS) {
      const bg = cor(fundo, tema);
      expect(bg, `${fundo} não resolve no tema ${tema}`).not.toBeNull();

      const r = razao(tinta!, bg!);
      expect(
        r,
        `--color-accent-ink sobre ${fundo} no tema ${tema} = ${r.toFixed(2)}:1 (piso ${MINIMO_AA})`,
      ).toBeGreaterThanOrEqual(MINIMO_AA);
    }
  });

  it("a tinta e o preenchimento são tokens DIFERENTES — é o que separa os papéis", () => {
    // Se alguém "simplificar" apontando os dois para o mesmo token, o teste de
    // contraste acima reprova no claro (é exatamente o defeito original). Esta
    // asserção diz POR QUE a duplicação existe, para o próximo leitor não a
    // desfazer achando que é redundância.
    const tinta = MAPAS.claro.get("--color-accent-ink");
    const fill = MAPAS.claro.get("--color-accent");
    expect(tinta).not.toBe(fill);
  });
});

describe("o primeiro plano do destrutivo passa AA nos dois temas", () => {
  it.each(["claro", "escuro"] as const)("%s: --destructive-foreground sobre --color-error", (tema) => {
    // `--destructive` é alias de `--color-error` no produto.
    const fg = cor("--color-destructive-foreground", tema);
    expect(fg, `--color-destructive-foreground não resolve no tema ${tema}`).not.toBeNull();

    const bg = cor("--color-error", tema) ?? cor("--destructive", tema);
    expect(bg).not.toBeNull();

    const r = razao(fg!, bg!);
    expect(
      r,
      `texto do destrutivo no tema ${tema} = ${r.toFixed(2)}:1 (piso ${MINIMO_AA}); ` +
        "branco fixo reprovava no escuro",
    ).toBeGreaterThanOrEqual(MINIMO_AA);
  });
});

describe("nenhum `text-accent` volta a usar o accent de PREENCHIMENTO como tinta", () => {
  /**
   * `app/app/fiscal/**` fica de fora desta rodada por acordo de frentes: os
   * arquivos são da frente fiscal e a troca é mecânica (`text-accent` →
   * `text-accent-ink`). A dívida está declarada aqui e no achado V-54 da
   * auditoria — não silenciada. Qualquer arquivo NOVO fora da lista reprova.
   */
  const DE_FORA = ["app/app/fiscal/"];

  function arquivos(dir: string): string[] {
    const saida: string[] = [];
    for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      const relativo = path.join(dir, nome);
      const absoluto = path.join(RAIZ, relativo);
      if (fs.statSync(absoluto).isDirectory()) saida.push(...arquivos(relativo));
      else if (/\.(tsx|ts)$/.test(nome) && !nome.includes(".test.")) saida.push(relativo);
    }
    return saida;
  }

  it.each(arquivos("app").concat(arquivos("components")))("%s", (arquivo) => {
    if (DE_FORA.some((prefixo) => arquivo.split(path.sep).join("/").startsWith(prefixo))) return;
    const codigo = semComentarios(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"));
    // `text-accent` bare; `text-accent-ink`, `-fg`, `-foreground`, `-soft` e os
    // graus (`-700`) são outros tokens e não casam.
    //
    // Linha com `aria-hidden` fica de fora: o elemento não está na árvore de
    // acessibilidade, então o piso é o de COMPONENTE (3:1), e `#7e77f0` dá
    // 3,63:1 sobre o branco — passa. É a mesma isenção (e a mesma limitação) que
    // `tests/unit/tailwind-tokens.test.ts` usa na varredura de alfa: o critério
    // é por linha porque a varredura é textual, não por elemento.
    const culpados = codigo
      .split("\n")
      .filter((linha) => !linha.includes("aria-hidden"))
      .flatMap((linha) => [...linha.matchAll(/\btext-accent(?![-\w])/g)].map((m) => m[0]));
    expect(
      culpados,
      `${arquivo}: text-accent usa o accent de preenchimento como tinta (3,63:1 no claro). Use text-accent-ink`,
    ).toEqual([]);
  });
});
