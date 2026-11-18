import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * C10 — as fontes do produto são LOCAIS (decisão do dono em 18/11/2026).
 *
 * `next/font/google` baixa Inter e IBM Plex Mono durante o `build`. Numa VPS
 * sem saída para `fonts.gstatic.com` o build do produto morre — medido nos
 * dois checks vermelhos do PR #447 — e o produto é vendido como código que o
 * cliente instala no servidor dele. A fonte passa a ser arquivo versionado em
 * `public/fonts/`, com o texto da licença OFL ao lado.
 *
 * O que este gate prova (sem rede, sem build):
 *   1. nenhum arquivo do app/lib usa `next/font/google`;
 *   2. `app/layout.tsx` usa `next/font/local` e aponta para os arquivos;
 *   3. os WOFF2 existem, têm tamanho de fonte de verdade e a licença está lá.
 */
const RAIZ = path.resolve(__dirname, "../..");
const FONTES = path.join(RAIZ, "public", "fonts");

function arquivosDeCodigo(dir: string, saida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = path.join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(entrada)) continue;
      arquivosDeCodigo(caminho, saida);
    } else if (/\.(ts|tsx|js|mjs|css)$/.test(entrada)) {
      saida.push(caminho);
    }
  }
  return saida;
}

describe("C10 — fontes locais, build sem rede", () => {
  it("nenhum arquivo usa next/font/google", () => {
    const infratores = [
      ...arquivosDeCodigo(path.join(RAIZ, "app")),
      ...arquivosDeCodigo(path.join(RAIZ, "lib")),
      ...arquivosDeCodigo(path.join(RAIZ, "components")),
    ].filter((arquivo) => /from\s+["']next\/font\/google["']/.test(readFileSync(arquivo, "utf8")));

    expect(
      infratores.map((f) => path.relative(RAIZ, f)),
      "next/font/google baixa a fonte no build e quebra instalação sem rede. Use next/font/local " +
        "com o arquivo em public/fonts/.",
    ).toEqual([]);
  });

  it("o layout carrega as fontes do repositório", () => {
    const layout = readFileSync(path.join(RAIZ, "app", "layout.tsx"), "utf8");
    expect(layout).toContain('from "next/font/local"');
    expect(layout).toContain("../public/fonts/inter-latin-wght-normal.woff2");
    expect(layout).toContain("ibm-plex-mono-latin-400-normal.woff2");
    expect(layout).toContain("ibm-plex-mono-latin-500-normal.woff2");
  });

  it("os WOFF2 existem e são fontes de verdade (não placeholder)", () => {
    for (const nome of [
      "inter-latin-wght-normal.woff2",
      "ibm-plex-mono-latin-400-normal.woff2",
      "ibm-plex-mono-latin-500-normal.woff2",
    ]) {
      const arquivo = path.join(FONTES, nome);
      expect(existsSync(arquivo), `${nome} não existe em public/fonts/`).toBe(true);
      const bytes = statSync(arquivo).size;
      expect(bytes, `${nome} pequeno demais para ser uma fonte`).toBeGreaterThan(5_000);
      // WOFF2 começa com a assinatura `wOF2`.
      expect(readFileSync(arquivo).subarray(0, 4).toString("latin1")).toBe("wOF2");
    }
  });

  it("a licença OFL acompanha as fontes", () => {
    for (const nome of ["OFL-Inter.txt", "OFL-IBM-Plex-Mono.txt"]) {
      const arquivo = path.join(FONTES, nome);
      expect(existsSync(arquivo), `${nome} ausente`).toBe(true);
      expect(readFileSync(arquivo, "utf8")).toContain("SIL Open Font License");
    }
  });
});
