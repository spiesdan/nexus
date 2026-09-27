import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test.setTimeout(180_000);

/**
 * `/app/inteligencia` carrega sem derrubar o SegmentError (regressão do React #185).
 *
 * A rota morria com dados reais: o `onSelectionChange` do ReactFlow emitia de
 * novo a cada identidade nova de callback (o `aoSelecionar` é inline),
 * `setSelectedIds(mapped)` re-renderizava com referência NOVA mesmo com o
 * mesmo conteúdo, `nos` virava array novo, o `StoreUpdater` mandava `setNodes`
 * no store — e o ciclo só parava no limite de updates do React ("Maximum
 * update depth exceeded"). A página entrava com o h1 certo e MORRIA entre a
 * asserção e o screenshot: a primeira leva de PNGs da Fase 5a saiu com a
 * página de erro. Reproduzido deterministicamente (2 de 2 em build de
 * produção, 1 de 1 em dev) e corrigido com guarda de conteúdo no setter da
 * seleção em `NexusIntelligence`.
 */
test("inteligência carrega sem derrubar o SegmentError", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  await page.goto("/app/inteligencia");
  const h1 = page.getByRole("heading", { level: 1, name: /^inteligência$/i });
  await expect(h1).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1")).toHaveCount(1);

  // O crash acontecia DEPOIS do mount, quando os dados chegam e o grafo
  // renderiza — o pulso sumindo é esse instante.
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });

  // Re-assert depois do estado carregado: é aqui que a página quebrada
  // mostrava "Algo deu errado" no lugar da Inteligência.
  await expect(h1).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
});
