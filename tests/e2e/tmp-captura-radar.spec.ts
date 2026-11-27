import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * Captura dos SEIS estados visuais do Radar (lista canônica do Design UX em
 * `Shared/nexus-expedicao/radar-estados-canonicos.md`).
 *
 * ── O que a imagem tem de ser ───────────────────────────────────────────────
 *
 * A PÁGINA na viewport, com o cartão à vista — não o recorte do cartão. O
 * parecer do Design UX (27/11) recusou os recortes como aceite: 1104×251 não
 * prova hierarquia (título, aba Pesquisas), largura de coluna, ausência de
 * corte nem a rolagem horizontal em 390. O recorte continua existindo, mas
 * como ANEXO DE DETALHE, em `cartoes/`.
 *
 * Por isso `page.screenshot()` (viewport inteira) e não `locator.screenshot()`.
 * O teste CONFERE as dimensões do PNG depois de cada captura: é a diferença
 * entre "capturei a página" e "achei que capturei" — um `clip` ou um
 * deviceScaleFactor 2 passariam despercebidos no nome do arquivo.
 *
 * 12 imagens de estado + 2 da lista inteira (uma por largura, sem rolar) +
 * os recortes em `cartoes/`.
 */
test.setTimeout(600_000);

const RAIZ = "evidence/radar-estados";

const ESTADOS = [
  { nome: "carregando", texto: "marcenaria" },
  { nome: "resultado", texto: "oficina mecânica" },
  { nome: "parando", texto: "restaurante" },
  { nome: "parcial", texto: "clínica odontológica" },
  { nome: "zero", texto: "cerâmica" },
  { nome: "degradada", texto: "hotel" },
] as const;

const VIEWPORTS = [
  { px: 1440, altura: 900 },
  { px: 390, altura: 844 },
] as const;

/** Lê largura/altura do IHDR do PNG — 8 bytes de assinatura + 8 de tamanho. */
function dimensoes(png: Buffer): { largura: number; altura: number } {
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

test("captura dos seis estados visuais do Radar", async ({ page }) => {
  fs.mkdirSync(path.join(RAIZ, "cartoes"), { recursive: true });

  await loginComoAdmin(page, lerCreds());
  await page.goto("/app/campanhas?subtela=prospeccao&aba=pesquisas", {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  await expect(page.getByRole("heading", { name: "Buscas no mapa" })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByText("restaurante · padaria")).toBeVisible({ timeout: 60_000 });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.px, height: viewport.altura });
    // A lista inteira é capturada do TOPO: depois de rolar até um cartão, a
    // página não volta sozinha, e a "lista sem rolar" viraria um recorte do
    // meio da tela com o mesmo nome.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const lista = await page.screenshot({ path: `${RAIZ}/lista-${viewport.px}.png` });
    expect(dimensoes(lista), `lista em ${viewport.px}px deve ser a viewport inteira`).toEqual({
      largura: viewport.px,
      altura: viewport.altura,
    });

    for (const estado of ESTADOS) {
      const cartao = page.locator("li").filter({ hasText: estado.texto }).first();
      await expect(cartao, `cartão do estado ${estado.nome}`).toBeVisible({ timeout: 60_000 });
      await cartao.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      const pagina = await page.screenshot({
        path: `${RAIZ}/${estado.nome}-${viewport.px}.png`,
      });
      expect(
        dimensoes(pagina),
        `${estado.nome} em ${viewport.px}px deve ser a página na viewport`,
      ).toEqual({ largura: viewport.px, altura: viewport.altura });

      // Anexo de detalhe: NÃO substitui a página, e por isso vive em subpasta.
      await cartao.screenshot({ path: `${RAIZ}/cartoes/${estado.nome}-${viewport.px}.png` });
    }

    if (viewport.px === 390) {
      // Overflow horizontal medido, não estimado (exigência do checklist).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      console.log(`[medida] overflow horizontal em 390: ${overflow}px`);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  }
});
