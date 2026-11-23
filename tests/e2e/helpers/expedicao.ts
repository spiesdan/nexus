/**
 * Monta uma carga EM ROTA com um pedido separado — o ponto de partida das
 * specs de GPS, fila offline e cabine. Reusa os helpers de pedido e os passos
 * que a jornada 4 já prova; aqui o objetivo é só chegar na rota com dados reais.
 */
import { expect, type Page } from "@playwright/test";

import { rotuloDoPedido, semearPedido, semearProduto } from "./pedidos";

export interface CargaEmRota {
  id: string;
  placa: string;
  numeroPedido: string;
}

export async function criarCargaEmRota(page: Page, prefixo: string): Promise<CargaEmRota> {
  const carimbo = Date.now();
  const sufixo = String(carimbo).slice(-6);
  const produtoId = await semearProduto(page, `Produto ${prefixo} ${sufixo}`);
  const pedido = await semearPedido(page, `Cliente ${prefixo} ${sufixo}`, { produtoId });
  const numeroPedido = rotuloDoPedido(pedido.numero);
  const placa = `ABC${sufixo.slice(0, 7)}`;

  await page.goto("/app/expedicao");
  await page.getByRole("link", { name: "Nova carga" }).click();
  await page.waitForURL(/\/app\/expedicao\/nova$/);
  await page.locator("#placa").fill(placa);
  await page.locator("#veiculo").fill("HR");
  await page.locator("#motorista").fill(`Motorista ${sufixo}`);
  await page.locator("label").filter({ hasText: numeroPedido }).getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Criar carga/ }).click();
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+$/, { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/").pop();
  if (!id) throw new Error("carga criada sem id na URL");

  const separado = page.getByLabel(`Separado: ${numeroPedido}`);
  await separado.click();
  await expectSeparado(page, separado);
  await page.getByRole("button", { name: "Sair para rota" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Iniciar rota" }).click();
  await expect(page.getByText(/Em rota ·/)).toBeVisible({ timeout: 30_000 });

  return { id, placa, numeroPedido };
}

async function expectSeparado(page: Page, separado: ReturnType<Page["getByLabel"]>): Promise<void> {
  await separado.waitFor({ state: "visible" });
  for (let i = 0; i < 30; i += 1) {
    if (await separado.isChecked()) return;
    await page.waitForTimeout(500);
  }
  throw new Error("checkbox de separado não virou true após o PATCH");
}
