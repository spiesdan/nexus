import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * Captura dos SEIS estados visuais do Radar (lista canônica do Design UX em
 * `Shared/nexus-expedicao/radar-estados-canonicos.md`): 6 × 1440×900 e 390×844
 * = 12 imagens em `evidence/radar-estados/`, nome `<estado>-<largura>.png`.
 *
 * O seed (`scripts/tmp-semear-radar.mjs`) cria uma busca por estado, cada uma
 * com uma categoria exclusiva — o filtro por texto seleciona o cartão certo.
 */
test.setTimeout(600_000);

const ESTADOS = [
  { nome: "carregando", texto: "marcenaria" },
  { nome: "resultado", texto: "oficina mecânica" },
  { nome: "parando", texto: "restaurante" },
  { nome: "parcial", texto: "clínica odontológica" },
  { nome: "zero", texto: "cerâmica" },
  { nome: "degradada", texto: "hotel" },
] as const;

test("captura dos seis estados visuais do Radar", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());
  await page.goto("/app/campanhas?subtela=prospeccao&aba=pesquisas", {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  await expect(page.getByRole("heading", { name: "Buscas no mapa" })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByText("restaurante · padaria")).toBeVisible({ timeout: 60_000 });

  for (const largura of [
    { px: 1440, altura: 900 },
    { px: 390, altura: 844 },
  ] as const) {
    await page.setViewportSize({ width: largura.px, height: largura.altura });
    for (const estado of ESTADOS) {
      const cartao = page.locator("li").filter({ hasText: estado.texto }).first();
      await expect(cartao, `cartão do estado ${estado.nome}`).toBeVisible({ timeout: 60_000 });
      await cartao.screenshot({
        path: `evidence/radar-estados/${estado.nome}-${largura.px}.png`,
      });
    }
  }

  // Overflow horizontal medido, não estimado (exigência do checklist em 390 px).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(`[medida] overflow horizontal em 390: ${overflow}px`);
  expect(overflow).toBeLessThanOrEqual(0);
});
