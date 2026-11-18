/**
 * A BORDA DO CAMPO IDENTIFICA O CONTROLE — E A WCAG COBRA 3:1 PARA ISSO.
 *
 * ─── O QUE FOI MEDIDO (18/11/2026) ────────────────────────────────────────
 *
 * Os três primitivos (`components/ui/input|textarea|select`) e ~15 campos
 * escritos à mão usavam `--color-border` como borda. Sobre a superfície branca,
 * `#e7e9ee` dava **1,21:1**; no escuro, `#313131` sobre `#1c1c1c` dava
 * **1,31:1**. WCAG 2.2 AA, 1.4.11 (contraste de conteúdo não textual) pede
 * **3:1** para a informação visual que identifica o componente.
 *
 * A decisão do dono (18/11/2026) foi explícita: **manter 1px** — o "hairline"
 * do `DESIGN.md` continua — e mudar só a COR. Foi o que se fez:
 *
 *   claro  `#848c98` → 3,39 sobre surface · 3,17 sobre bg · 3,25 sobre elevada
 *   escuro `#747a82` → 3,93 sobre surface · 4,22 sobre bg · 3,49 sobre elevada
 *
 * A hierarquia não foi achatada: repouso ~3,4 → hover `accent-600` (3,63 no
 * claro, 4,69 no escuro) → foco `accent-ink` (5,56 / 7,63) **mais** o anel de
 * 2px. Cada estado é mais forte que o anterior, que era o requisito.
 *
 * ─── POR QUE UM TESTE DE TOKEN, E NÃO UMA CAPTURA ─────────────────────────
 *
 * Contraste de borda não depende de layout: a borda encosta na superfície que
 * está atrás do campo, e essa cor é um token. Medir o token é medir o par. Uma
 * captura provaria o mesmo e não sobreviveria a um reskin de marca; o token
 * continua valendo sob a rampa do revendedor porque `--color-border-control` é
 * literal (não vem da rampa) — só a marca NÃO o move, por decisão: a função
 * dele é ser legível, não ser da cor do cliente.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");

function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei \`${seletor}\` em globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

const TEMA = { claro: bloco(":root"), escuro: bloco('[data-theme="dark"]') };

const hexDe = (texto: string, prop: string): string | null => {
  const m = new RegExp(`${prop}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(texto);
  return m ? m[1]!.toLowerCase() : null;
};

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const razao = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((i, j) => j - i) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const PISO_NAO_TEXTO = 3;

describe("borda de campo identifica o controle (1.4.11)", () => {
  const FUNDOS = ["--color-surface", "--color-bg", "--color-surface-elevated"];

  it.each(["claro", "escuro"] as const)("%s: ≥3:1 contra os três fundos", (tema) => {
    const borda = hexDe(TEMA[tema], "--color-border-control");
    expect(borda, `--color-border-control ausente no tema ${tema}`).not.toBeNull();

    for (const fundo of FUNDOS) {
      const bg = hexDe(TEMA[tema], fundo);
      expect(bg, `${fundo} ausente no tema ${tema}`).not.toBeNull();
      const r = razao(borda!, bg!);
      expect(
        r,
        `borda de campo sobre ${fundo} no tema ${tema} = ${r.toFixed(2)}:1 (piso ${PISO_NAO_TEXTO})`,
      ).toBeGreaterThanOrEqual(PISO_NAO_TEXTO);
    }
  });

  it("foco é mais forte que repouso, e hover fica entre os dois", () => {
    // A decisão do dono: "foco continua mais forte que repouso". Se alguém
    // apontar o foco para uma cor mais fraca que a borda de repouso, o campo
    // focado parece MENOS definido que o de sempre.
    for (const tema of ["claro", "escuro"] as const) {
      const repouso = hexDe(TEMA[tema], "--color-border-control")!;
      const surface = hexDe(TEMA[tema], "--color-surface")!;
      const foco = tema === "claro" ? "#625db8" : "#a4a5ff"; // --color-accent-ink
      const hover = hexDe(TEMA[tema], "--color-accent-600")!;

      const rRepouso = razao(repouso, surface);
      const rHover = razao(hover, surface);
      const rFoco = razao(foco, surface);

      expect(rHover, `hover mais fraco que repouso no tema ${tema}`).toBeGreaterThan(rRepouso);
      expect(rFoco, `foco mais fraco que hover no tema ${tema}`).toBeGreaterThan(rHover);
    }
  });

  it("a divisória continua sendo a divisória — não trocamos o token de todo mundo", () => {
    // `--color-border` segue em 1,21:1 de propósito: ela separa blocos, não
    // identifica controle. Se este caso falhar, alguém "consertou" a divisória
    // também — e aí a hierarquia visual do produto muda sem ninguém pedir.
    const divisoria = hexDe(TEMA.claro, "--color-border")!;
    expect(razao(divisoria, "#ffffff")).toBeLessThan(PISO_NAO_TEXTO);
  });
});

describe("os campos usam a borda de campo", () => {
  const PRIMITIVOS = [
    "components/ui/input.tsx",
    "components/ui/textarea.tsx",
    "components/ui/select.tsx",
  ];

  it.each(PRIMITIVOS)("%s", (arquivo) => {
    const codigo = semComentarios(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"));
    // `border-input` é o alias shadcn que aponta para `--color-border-control`.
    expect(
      /border-(border-control|input)\b/.test(codigo),
      `${arquivo}: não usa a borda de campo (border-border-control / border-input)`,
    ).toBe(true);
    expect(codigo).not.toMatch(/border border-border\s/);
  });

  it("o alias `--input` aponta para a borda de campo nos três blocos", () => {
    for (const tema of ["claro", "escuro"] as const) {
      expect(TEMA[tema]).toMatch(/--input:\s*var\(--color-border-control\)/);
    }
    // O `:root` claro também (é o bloco do tema claro "raiz").
    const raiz = bloco(":root");
    expect(raiz).toMatch(/--input:\s*var\(--color-border-control\)/);
  });
});
