import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Compras (§86, telas novas do passo 7): da tela Nova compra até o saldo no
 * estoque.
 *
 * Mapeamento para a UI real:
 *
 * - **Nova compra**: diálogo de `/app/compras` (produto, quantidade, custo
 *   unitário, observações) → `POST /api/v1/purchase-orders` → navega para o
 *   detalhe com status `rascunho`;
 * - **enviar**: "Enviar ao fornecedor" → confirmação explícita → `enviado`
 *   (só cancelar ou receber depois);
 * - **receber**: "Receber no estoque" → "Receber tudo" vira entrada de
 *   estoque por item (origem compra) → `recebido`;
 * - **saldo**: a aba Saldos de `/app/estoque` lê `catalog_products.quantidade`
 *   — o saldo de 3 é o recebimento acontecendo, não um número pintado.
 */
test("compras — do pedido em rascunho ao recebimento no estoque", async ({ page }) => {
  const carimbo = Date.now();
  const produto = `Produto Compras ${carimbo}`;

  await loginComoAdmin(page, lerCreds());
  const produtoId = await semearProduto(page, produto, {
    controlaEstoque: true,
    precoCents: 1250,
  });
  expect(produtoId).toBeTruthy();

  // 1. Nova compra pela tela — a criação pelo diálogo é o que se mede aqui
  //    (semeio de produto é precondição, não o objeto da jornada).
  await page.goto("/app/compras");
  await expect(page.getByRole("heading", { level: 1, name: /^compras$/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Nova compra" }).first().click();
  await page.getByLabel("Produto").click();
  const opcaoDoProduto = page.getByRole("option", { name: produto });
  await expect(opcaoDoProduto).toBeVisible({ timeout: 15_000 });
  await opcaoDoProduto.click();
  await page.getByLabel("Quantidade").fill("3");
  await page.getByLabel("Custo unitário").fill("12,50");
  await page.locator("#obs-compra").fill("Reposicao de estoque e2e");
  await page.getByRole("button", { name: "Criar pedido" }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Pedido de compra criado." })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\/app\/compras\/[0-9a-f-]+/, { timeout: 20_000 });

  // 2. Detalhe: rascunho → enviado → recebido, cada passo por CONFIRMAÇÃO
  //    (a ação some quando o status não permite mais — o botão é a prova).
  await expect(page.getByText("Rascunho", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Enviar ao fornecedor" }).click();
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Pedido enviado." })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Receber no estoque" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Receber no estoque" }).click();
  await page.getByRole("button", { name: "Receber tudo" }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Recebimento registrado no estoque." })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  // Pronto: nenhum botão de ação sobra e o contador do pedido diz 3/3.
  await expect(page.getByText("3/3 unidades recebidas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Enviar ao fornecedor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Receber no estoque" })).toHaveCount(0);

  // 3. Saldo — a aba Saldos filtra por `controla_estoque` e busca no servidor:
  //    a linha do produto com saldo 3 é o recebimento no razão.
  await page.goto("/app/estoque");
  await expect(page.getByRole("heading", { level: 1, name: "Estoque" })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(1_500);
  await page.locator("#estoque-busca").fill(produto);
  const row = page.getByRole("row").filter({ hasText: produto });
  await expect(row, "o produto aparece no saldo do estoque").toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(row.getByText("3", { exact: true })).toBeVisible();
});
