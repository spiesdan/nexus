// @vitest-environment node
// node de propósito: o jsdom trunca os streams Flate do @react-pdf/renderer.
/**
 * O PDF é lido DE VOLTA com pdfjs-dist — não basta confiar no componente.
 * Aqui se prova o que o dono pediu: capa com ano real, sumário com página
 * correta, agrupamento único e AUSÊNCIA TOTAL DE PREÇO no texto extraído.
 */
import { describe, expect, it } from "vitest";

const PDFJS = await import("pdfjs-dist/legacy/build/pdf.mjs");

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";

import { renderCatalogoPdf, type DadosDoCatalogoPdf } from "./CatalogoPdf";

const LOGO_1X1: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

function dados(overrides: Partial<DadosDoCatalogoPdf> = {}): DadosDoCatalogoPdf {
  return {
    ano: 2026,
    logo: LOGO_1X1,
    secoes: [
      {
        chave: "bebidas",
        rotulo: "Bebidas",
        produtos: [
          { foto: LOGO_1X1, nome: "Refrigerante 2L", codigo: "BEB-001" },
          { foto: LOGO_1X1, nome: "Suco natural", codigo: "BEB-002" },
        ],
      },
      {
        chave: "limpeza",
        rotulo: "Limpeza",
        produtos: [{ foto: LOGO_1X1, nome: "Água sanitária", codigo: "LIM-001" }],
      },
    ],
    contracapa: null,
    ordemRevisada: ["bebidas", "limpeza"],
    ...overrides,
  };
}

async function extrair(buf: Buffer): Promise<{ paginas: number; texto: string }> {
  const doc = await PDFJS.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const texto = (await extractPdfText(buf)).replace(/\s+/g, " ");
  return { paginas: doc.numPages, texto };
}

describe("PDF do catálogo", () => {
  it("capa com logo, título, subtítulo e ano atual automático", async () => {
    const { texto } = await extrair(await renderCatalogoPdf(dados()));
    expect(texto).toContain("CATÁLOGO");
    expect(texto).toContain("DE PRODUTOS");
    expect(texto).toContain("2026");
  });

  it("sumário com as seções e o número de página real", async () => {
    const { texto } = await extrair(await renderCatalogoPdf(dados()));
    expect(texto).toContain("SUMÁRIO");
    expect(texto).toContain("Bebidas");
    expect(texto).toContain("Limpeza");
    // capa(1) + sumário(1) => primeira página de produto é a 3.
    expect(texto).toContain("pág. 3");
    expect(texto).toContain("3 / 4");
  });

  it("PREÇO ZERO: nenhum valor monetário aparece no texto extraído", async () => {
    const { texto } = await extrair(await renderCatalogoPdf(dados()));
    expect(texto).not.toMatch(/R\$/i);
    expect(texto).not.toMatch(/(?:R\$|\$)\s*\d/);
    expect(texto).not.toMatch(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/);
    expect(texto).not.toMatch(/\b\d+[.,]\d{2}\b/);
  });

  it("só foto, nome e código por produto", async () => {
    const { texto } = await extrair(await renderCatalogoPdf(dados()));
    expect(texto).toContain("Refrigerante 2L");
    expect(texto).toContain("BEB-001");
    expect(texto).not.toContain("descricao");
    expect(texto).not.toContain("marca");
  });

  it("texto longo e catálogo com muitas páginas não quebram a diagramação", async () => {
    const secoes = Array.from({ length: 12 }, (_, i) => ({
      chave: `cat-${i}`,
      rotulo: `Categoria número ${i} com um rótulo bem longo para testar quebra de linha`,
      produtos: Array.from({ length: 6 }, (_, j) => ({
        foto: null,
        nome: `Produto com nome bem longo ${i}-${j} e mais palavras para forçar quebra`,
        codigo: `COD-${i}-${j}`,
      })),
    }));
    const { paginas, texto } = await extrair(await renderCatalogoPdf(dados({ secoes })));
    expect(paginas).toBeGreaterThan(12);
    expect(texto).toContain("CATÁLOGO");
  });

  it("contracapa só entra quando há dados reais revisados", async () => {
    const sem = await extrair(await renderCatalogoPdf(dados()));
    const com = await extrair(
      await renderCatalogoPdf(
        dados({
          contracapa: {
            razaoSocial: "Empresa Real Ltda",
            cnpj: "12.345.678/0001-90",
            telefone: "(47) 99999-0000",
            endereco: "Rua A, 1 — Mafra/SC",
          },
        }),
      ),
    );
    expect(sem.paginas).toBe(4);
    expect(com.paginas).toBe(5);
    expect(com.texto).toContain("Empresa Real Ltda");
    expect(sem.texto).not.toContain("Empresa Real Ltda");
  });
});
