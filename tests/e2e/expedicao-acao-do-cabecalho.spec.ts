import { expect, test } from "@playwright/test";

import {
  placaDoCarimbo,
  preencherEquipeNaNovaCarga,
  semearContatoComEndereco,
} from "./helpers/expedicao";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { rotuloDoPedido, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * A AÇÃO DO CABEÇALHO PERTENCE À PÁGINA.
 *
 * Medido em 27/11/2026 (auditoria das 5 áreas): em `/rota` o botão "Conferir
 * separação" e em `/fechamento` o "Registrar desfecho" chamavam `focarParada`,
 * que rola até `#parada-<id>` — id que SÓ existe em "Pedidos e paradas". O
 * clique resultava em 0 scroll, 0 diálogo, 0 navegação.
 *
 * Aqui não se lê código: clica-se e mede-se. O alvo é o alvo real (`#parada-`),
 * e a prova de que a parada abriu é o checkbox "Separado", que só existe no
 * cartão aberto.
 */
test("ação do cabeçalho leva à página onde o alvo existe", async ({ page }) => {
  const carimbo = Date.now();
  const sufixo = String(carimbo).slice(-6);
  await loginComoAdmin(page, lerCreds());

  const produtoId = await semearProduto(page, `Produto Ação Cabeçalho ${sufixo}`);
  const cliente = `Cliente Ação Cabeçalho ${sufixo}`;
  const contactId = await semearContatoComEndereco(page, cliente);
  const pedido = await semearPedido(page, cliente, { produtoId, contactId });
  const numero = rotuloDoPedido(pedido.numero);
  const placa = placaDoCarimbo(carimbo);

  // Carga MONTANDO com o pedido ainda NÃO separado: é o estado em que a ação
  // é "Conferir separação" em todas as páginas da carga.
  await page.goto("/app/expedicao");
  await page.getByRole("link", { name: "Nova carga" }).click();
  await page.waitForURL(/\/app\/expedicao\/nova$/);
  await page.locator("label").filter({ hasText: numero }).getByRole("checkbox").check();
  await preencherEquipeNaNovaCarga(page, { placa, motorista: `Motorista ${sufixo}` });
  await page.getByRole("button", { name: /^Confirmar carga/ }).click();
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+$/, { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/").pop()!;

  // 1. Em /rota a ação é LINK para a parada — não botão que não faz nada.
  await page.goto(`/app/expedicao/${id}/rota`);
  const acaoRota = page.getByTestId("proxima-acao").getByRole("link", {
    name: "Conferir separação",
  });
  await expect(acaoRota).toBeVisible({ timeout: 20_000 });
  const hrefRota = await acaoRota.getAttribute("href");
  expect(hrefRota).toMatch(new RegExp(`^/app/expedicao/${id}#parada-`));

  await acaoRota.click();
  await expect(page).toHaveURL(new RegExp(`/app/expedicao/${id}(#parada-.+)?$`));
  const separado = page.getByLabel(`Separado: ${numero}`);
  await expect(separado).toBeVisible({ timeout: 20_000 });

  // 2. Em /fechamento, o mesmo estado leva ao mesmo alvo.
  await page.goto(`/app/expedicao/${id}/fechamento`);
  const acaoFechamento = page.getByTestId("proxima-acao").getByRole("link", {
    name: "Conferir separação",
  });
  await expect(acaoFechamento).toBeVisible({ timeout: 20_000 });
  await expect(acaoFechamento).toHaveAttribute("href", /#parada-/);
  await acaoFechamento.click();
  await expect(page).toHaveURL(new RegExp(`/app/expedicao/${id}(#parada-.+)?$`));
  await expect(page.getByLabel(`Separado: ${numero}`)).toBeVisible({ timeout: 20_000 });

  // 3. Tudo separado: /fechamento manda para a página que PUBLICA.
  const separadoAgora = page.getByLabel(`Separado: ${numero}`);
  await separadoAgora.click();
  await expect(separadoAgora).toBeChecked({ timeout: 15_000 });

  await page.goto(`/app/expedicao/${id}/fechamento`);
  await expect(
    page.getByTestId("proxima-acao").getByRole("link", { name: "Revisar e publicar" }),
  ).toHaveAttribute("href", `/app/expedicao/${id}/rota`, { timeout: 20_000 });

  // 4. Em /rota, com tudo separado, o banner NÃO duplica o "Publicar rota" da
  // página: uma ação por tela.
  await page.goto(`/app/expedicao/${id}/rota`);
  await expect(page.getByTestId("publicar-rota")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("proxima-acao").getByRole("link")).toHaveCount(0);
  await expect(page.getByTestId("proxima-acao").getByRole("button")).toHaveCount(0);
});
