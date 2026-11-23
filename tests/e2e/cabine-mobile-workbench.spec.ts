/**
 * CABINE EM VIEWPORT SUPORTADO (390×844) — P1-5.
 *
 * Não é teste de aparelho: é o fluxo da cabine no navegador, no menor viewport
 * suportado, com as abas do workbench da ficha (Paradas / Rota / Fechamento).
 * O que se mede: nenhuma aba some, o botão de modo motorista continua
 * alcançável e o documento não transborda horizontalmente.
 */
import { expect, test } from "@playwright/test";

import { criarCargaEmRota } from "./helpers/expedicao";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test.setTimeout(300_000);
test.use({ viewport: { width: 390, height: 844 } });

test("cabine 390: abas do workbench e modo motorista continuam utilizáveis", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());
  const carga = await criarCargaEmRota(page, "CABINE-390");

  await page.goto(`/app/expedicao/${carga.id}`);
  await expect(page.getByRole("heading", { level: 1, name: /^Carga \d{3}$/ })).toBeVisible({
    timeout: 30_000,
  });

  // As três abas SÃO rotas próprias; no celular o rótulo curto continua no DOM.
  for (const aba of [/Paradas/i, /Rota/i, /Fechamento/i]) {
    await expect(page.getByRole("link", { name: aba }).first()).toBeVisible();
  }

  await page.goto(`/app/expedicao/${carga.id}/rota`);
  await expect(page.getByTestId("gps-estado")).toBeVisible({ timeout: 30_000 });

  await page.goto(`/app/expedicao/${carga.id}/motorista`);
  await expect(page.getByRole("button", { name: /Marcar como entregue|Entregue/ }).first()).toBeVisible(
    { timeout: 30_000 },
  );

  const largura = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
  expect(largura.scroll, "cabine não pode transbordar em 390px").toBeLessThanOrEqual(
    largura.cliente + 2,
  );
});
