/**
 * CABINE EM VIEWPORT SUPORTADO (390×844) — P1-5.
 *
 * Não é teste de aparelho: é o fluxo da cabine no navegador, no menor viewport
 * suportado, com as abas da ficha da carga (Resumo / Pedidos e paradas / Mapa e
 * ordem / Fechamento). O que se mede: nenhuma aba some, o estado do GPS abre no
 * mapa recolhido, o botão de modo motorista continua alcançável e o documento
 * não transborda horizontalmente.
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

  // As quatro abas SÃO rotas próprias; no celular o rótulo curto continua no DOM.
  // Os nomes mudaram com o desenho da ficha (antes: Paradas / Rota / Fechamento):
  // "Rota" virou "Mapa e ordem" e a página inicial virou "Pedidos e paradas".
  for (const aba of [/^Resumo$/i, /^Pedidos e paradas$/i, /^Mapa e ordem$/i, /^Fechamento$/i]) {
    await expect(page.getByRole("link", { name: aba }).first()).toBeVisible();
  }

  await page.goto(`/app/expedicao/${carga.id}/rota`);
  // Em 390 o mapa nasce RECOLHIDO (`hidden lg:block`, `_roteirizador.tsx:1643-1650`)
  // e o estado do GPS mora dentro dele. Abrir é o caminho do operador; esperar o
  // testid com o bloco fechado seria esperar um elemento que a tela esconde.
  await page.getByRole("button", { name: "Abrir mapa" }).click();
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
