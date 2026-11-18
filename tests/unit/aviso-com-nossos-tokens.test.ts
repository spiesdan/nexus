/**
 * O AVISO PINTA COM OS NOSSOS TOKENS, E O TEXTO PASSA AA SOBRE O FUNDO COMPOSTO.
 *
 * ─── O DEFEITO (18/11/2026) ───────────────────────────────────────────────
 *
 * O `<Toaster/>` ligava `richColors`, e a biblioteca pintava sucesso/erro/
 * aviso/informação com a paleta dela. O aviso era o único feedback do produto
 * fora do design system: sem tema, sem régua de contraste, sem marca.
 *
 * Decisão do dono: remover o `richColors` e mapear os quatro tipos para
 * `--color-success|warning|error|info` (+ `-fg`).
 *
 * ─── A CONTA QUE ESTE TESTE FAZ, E POR QUE NÃO "LÊ A TELA" ────────────────
 *
 * Os tokens `-bg` são translúcidos (`rgba(…, 0.12)` no claro, `0.18` no
 * escuro). O contraste que a pessoa vê é entre o texto e a cor FINAL do fundo —
 * o token composto sobre a superfície. O teste compõe antes de medir; aprovar o
 * `rgba` cru seria aprovar um número que não existe na tela.
 *
 * A prova é de token, não de pixel, porque contraste de texto sobre fundo
 * translúcido só depende de duas cores — e as duas são tokens deste arquivo.
 * Uma captura mediria o mesmo e morreria num reskin.
 *
 * `blue`-on-`blue`: o teste também recusa `richColors` no componente. Se
 * alguém devolver a prop, o gate do contraste pode continuar verde (a
 * biblioteca pinta por cima das nossas classes) enquanto o produto volta a
 * pintar com a paleta errada — então as duas asserções andam juntas.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CLASSES_DO_AVISO, PARES_DO_AVISO } from "@/components/feedback/cores-do-aviso";
import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");
// Sem comentários: o arquivo EXPLICA por que o `richColors` saiu, e a prosa
// não pode ser confundida com a prop voltando.
const TOASTER = semComentarios(
  fs.readFileSync(path.join(RAIZ, "components", "feedback", "ToasterDoProduto.tsx"), "utf8"),
);

function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei \`${seletor}\` em globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

const TEMA = { claro: bloco(":root"), escuro: bloco('[data-theme="dark"]') };

type Rgb = [number, number, number];

function valorDe(texto: string, prop: string): string | null {
  const m = new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(texto);
  return m ? m[1]!.trim() : null;
}

function cor(css: string): { rgb: Rgb; a: number } | null {
  const v = valorDe(css, "") ?? css;
  const hex = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(v.trim());
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  return null;
}

const sobre = (f: Rgb, a: number, b: Rgb): Rgb =>
  f.map((v, i) => Math.round(v * a + b[i]! * (1 - a))) as Rgb;

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const razao = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((i, j) => j - i) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const MINIMO_AA = 4.5;

describe("o aviso não pinta com a paleta da biblioteca", () => {
  it("`richColors` não voltou", () => {
    expect(TOASTER).not.toMatch(/\brichColors\b/);
    expect(TOASTER).toMatch(/classNames:\s*CLASSES_DO_AVISO/);
  });

  it("cada tipo mapeia para um par de tokens do produto", () => {
    for (const tipo of Object.keys(PARES_DO_AVISO) as Array<keyof typeof PARES_DO_AVISO>) {
      const classes = CLASSES_DO_AVISO[tipo];
      expect(classes, `${tipo} sem classe`).toBeTruthy();
      // A classe precisa citar o token do fundo e o do texto que o gate mede.
      const fundo = PARES_DO_AVISO[tipo].fundo.replace("--color-", "");
      const texto = PARES_DO_AVISO[tipo].texto.replace("--color-", "");
      expect(classes, `${tipo}: fundo não usa ${fundo}`).toContain(`bg-${fundo}`);
      expect(classes, `${tipo}: texto não usa ${texto}`).toContain(`text-${texto}`);
    }
  });
});

describe("o texto do aviso passa AA sobre o fundo composto", () => {
  it.each(Object.keys(PARES_DO_AVISO) as Array<keyof typeof PARES_DO_AVISO>)(
    "%s, nos dois temas",
    (tipo) => {
      const { texto, fundo } = PARES_DO_AVISO[tipo];

      for (const tema of ["claro", "escuro"] as const) {
        const css = TEMA[tema];
        const fg = cor(valorDe(css, texto) ?? "");
        const bgToken = cor(valorDe(css, fundo) ?? "");
        const superficie = cor(valorDe(css, "--color-surface") ?? "");
        expect(fg, `${texto} não resolve no tema ${tema}`).not.toBeNull();
        expect(bgToken, `${fundo} não resolve no tema ${tema}`).not.toBeNull();
        expect(superficie, `surface não resolve no tema ${tema}`).not.toBeNull();

        // O fundo do aviso é o token translúcido composto sobre a superfície —
        // é a cor que a pessoa vê quando o aviso pousa sobre um card.
        const fundoFinal = sobre(bgToken!.rgb, bgToken!.a, superficie!.rgb);
        const r = razao(fg!.rgb, fundoFinal);

        expect(
          r,
          `aviso ${tipo} (${tema}) = ${r.toFixed(2)}:1 sobre o fundo composto (piso ${MINIMO_AA})`,
        ).toBeGreaterThanOrEqual(MINIMO_AA);
      }
    },
  );

  it("o aviso sem tipo usa superfície e texto do produto", () => {
    expect(CLASSES_DO_AVISO.default).toContain("bg-surface");
    expect(CLASSES_DO_AVISO.default).toContain("text-text");
  });
});
