import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Estoque (§86, telas novas do passo 7): o razão de movimentações e o saldo.
 *
 * Mapeamento para a UI real (§46/§47):
 *
 * - **movimento**: diálogo "Novo movimento" (produto com controle de estoque,
 *   tipo entrada/saída/ajuste, quantidade, observação) →
 *   `POST /api/v1/inventory/movements` → toast de confirmação;
 * - **razão**: a aba Movimentos lista o que entrou (`+5`) e o que saiu
 *   (`-2`) com a observação — sem isso o saldo é um número sem origem;
 * - **saldo**: a aba Saldos lê `catalog_products.quantidade` — entrada soma,
 *   saída subtrai, o saldo final é 3.
 */
test("estoque — entrada e saída registradas no razão mudam o saldo", async ({ page }) => {
  const carimbo = Date.now();
  const produto = `Produto Estoque ${carimbo}`;
  const observacaoEntrada = "Contagem inicial e2e";

  await loginComoAdmin(page, lerCreds());
  await semearProduto(page, produto, { controlaEstoque: true });

  await page.goto("/app/estoque");
  await expect(page.getByRole("heading", { level: 1, name: "Estoque" })).toBeVisible({
    timeout: 20_000,
  });
  // Hidratação antes dos cliques que abrem diálogo controlado pelo React.
  await page.waitForTimeout(1_500);

  // 1. Entrada de 5.
  await page.getByRole("button", { name: "Novo movimento" }).first().click();
  await page.getByLabel("Produto").click();
  const opcaoDoProduto = page.getByRole("option", { name: produto });
  await expect(opcaoDoProduto).toBeVisible({ timeout: 15_000 });
  await opcaoDoProduto.click();
  await page.locator("#mov-qtd").fill("5");
  await page.locator("#mov-obs").fill(observacaoEntrada);
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Movimento registrado." })
      .first(),
  ).toBeVisible({ timeout: 20_000 });

  // 2. Razão: a linha do nosso produto mostra `+5` e a observação. O marker
  //    `#estoque-tipo` prova que a troca de aba COMPLETOU: o router.replace é
  //    assíncrono e clicar "Novo movimento" no intervalo abre o diálogo da aba
  //    antiga, que some junto com ela (medido: option nunca aparecia).
  await page.getByRole("button", { name: "Movimentos", exact: true }).click();
  await expect(page.locator("#estoque-tipo")).toBeVisible({ timeout: 15_000 });
  const linhaMovimento = page.getByRole("row").filter({ hasText: produto });
  await expect(linhaMovimento, "a entrada vira linha no razão").toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(linhaMovimento.getByText("+5")).toBeVisible();
  await expect(linhaMovimento.getByText(observacaoEntrada)).toBeVisible();
  await expect(linhaMovimento.getByText("Entrada", { exact: true })).toBeVisible();

  // 3. Saída de 2 — o guarda de saldo insuficiente só passa com saldo, e é
  //    ele que prova que a saída olha o razão.
  await page.getByRole("button", { name: "Saldos", exact: true }).click();
  // Mesmo marker da troca de aba: espera o filtro da AbaSaldos existir.
  await expect(page.locator("#estoque-busca")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Novo movimento" }).first().click();
  await page.getByLabel("Produto").click();
  await expect(opcaoDoProduto).toBeVisible({ timeout: 15_000 });
  await opcaoDoProduto.click();
  await page.getByLabel("Tipo do movimento").click();
  await page.getByRole("option", { name: "Saída", exact: true }).click();
  await page.locator("#mov-qtd").fill("2");
  await page.locator("#mov-obs").fill("Venda do dia e2e");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Movimento registrado." })
      .first(),
  ).toBeVisible({ timeout: 20_000 });

  // 4. Saldo: 5 - 2 = 3, no mesmo produto buscado no servidor.
  await page.waitForTimeout(1_500);
  await page.locator("#estoque-busca").fill(produto);
  const row = page.getByRole("row").filter({ hasText: produto });
  await expect(row, "o produto aparece no saldo").toHaveCount(1, { timeout: 15_000 });
  await expect(row.getByText("3", { exact: true })).toBeVisible();
});
