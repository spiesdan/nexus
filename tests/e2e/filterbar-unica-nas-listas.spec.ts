import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test.setTimeout(240_000);

async function barraDe(page: import("@playwright/test").Page, rotulo: string) {
  const barra = page.locator("section").filter({ has: page.getByLabel(rotulo) });
  await expect(barra).toBeVisible({ timeout: 15_000 });
  return barra;
}

async function saudavel(page: import("@playwright/test").Page) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
}

/**
 * Fase 5b — FilterBar único: as listas de compras (2 abas), estoque (2 abas) e
 * carteira deixaram de ter toolbar caseira (`div.flex` + `Input`/`Select` cru)
 * e passaram a montar a barra canônica `components/filters/FilterBar`.
 *
 * Regressão PERMANENTE (registrada em `SPECS_PARTE_2`): eram 3 telas com
 * ZERO cobertura e2e. Além do contrato da barra, cada visita asserta que a
 * tela não cai em "Erro ao (carregar|listar)" — a API de movimentações do
 * estoque devolvia 500 deterministicamente num banco local defasado (tabela
 * `inventory_movements` ausente até a reaplicação do `baseline.sql`).
 */
test("fase 5b — compras, estoque e carteira usam a FilterBar canônica (desktop)", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  await page.goto("/app/compras");
  await expect(page.getByRole("heading", { level: 1, name: /^compras$/i })).toBeVisible({ timeout: 15_000 });
  const barraPedidos = await barraDe(page, "Status");
  await expect(barraPedidos.getByRole("button", { name: /nova compra/i })).toBeVisible();
  await page.getByLabel("Status").selectOption("enviado");
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-filterbar-unico/1-compras-pedidos-desktop.png" });

  await page.goto("/app/compras?aba=fornecedores");
  await expect(page.getByRole("heading", { level: 1, name: /^compras$/i })).toBeVisible({ timeout: 15_000 });
  const barraFornecedores = await barraDe(page, "Buscar");
  await expect(barraFornecedores.getByRole("button", { name: /novo fornecedor/i })).toBeVisible();
  await page.getByLabel("Buscar").fill("acme");
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-filterbar-unico/2-compras-fornecedores-desktop.png" });

  await page.goto("/app/estoque");
  await expect(page.getByRole("heading", { level: 1, name: /^estoque$/i })).toBeVisible({ timeout: 15_000 });
  const barraSaldos = await barraDe(page, "Buscar");
  await expect(barraSaldos.getByRole("button", { name: /novo movimento/i })).toBeVisible();
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-filterbar-unico/3-estoque-saldos-desktop.png" });

  await page.goto("/app/estoque?aba=movimentos");
  await expect(page.getByRole("heading", { level: 1, name: /^estoque$/i })).toBeVisible({ timeout: 15_000 });
  await barraDe(page, "Tipo");
  await page.getByLabel("Tipo").selectOption("entrada");
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-filterbar-unico/4-estoque-movimentos-desktop.png" });

  await page.goto("/app/carteira");
  await expect(page.getByRole("heading", { level: 1, name: /^carteira$/i })).toBeVisible({ timeout: 15_000 });
  const barraCarteira = await barraDe(page, "Buscar");
  await expect(barraCarteira).toBeVisible();
  await page.getByLabel("Buscar").fill("ana");
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-filterbar-unico/5-carteira-desktop.png" });
});

test("fase 5b — FilterBar canônica empilha no mobile 390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginComoAdmin(page, lerCreds());

  await page.goto("/app/estoque");
  await expect(page.getByRole("heading", { level: 1, name: /^estoque$/i })).toBeVisible({ timeout: 15_000 });
  await barraDe(page, "Buscar");
  await expect(page.getByLabel("Buscar")).toBeVisible();
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
  await page.screenshot({ path: "evidence/fase5-filterbar-unico/6-estoque-saldos-mobile-390.png" });
});
