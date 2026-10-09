import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { rotuloDoPedido, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Jornada 4 — Expedição (§86): pedido → carga → romaneio → rota → entrega.
 *
 * Mapeamento para a UI real (sem inventar tela):
 *
 * - **pedido**: semeado como `aprovado` — é o gatilho da fila "Aguardando
 *   embarque" de `/app/expedicao` (o POST da carga é quem avança o pedido
 *   para `expedido`);
 * - **carga**: formulário "Nova carga" da lista (placa/veículo/motorista +
 *   checkbox do pedido) → redirect para a ficha;
 * - **romaneio**: no produto é um PDF (`/api/v1/shipments/[id]/romaneio`),
 *   não uma página — o passo é provado pelo link "Romaneio e fechamento
 *   (PDF)" na ficha;
 * - **rota**: a ficha tem a seção "Mapa da rota" + "Ordem de entrega", e o
 *   passo operacional é "Sair para rota" (bloqueado até TODOS os pedidos
 *   separados — a régua "Faltam separar N pedidos" fica na tela);
 * - **entrega**: botão "Entregue" por parada → card "Paradas concluídas"
 *   sobe para 1/1 → "Concluir carga" destrava → status "Concluída".
 *
 * "Romaneio" como página e "rota" como subrota não existem no produto — a
 * ficha/áudio do §86 é atendida pelo PDF e pela seção, respectivamente.
 */
test("jornada 4 (expedição) — pedido vira carga, sai para rota e é concluído", async ({ page }) => {
  const carimbo = Date.now();
  const cliente = `Cliente Jornada Expedicao ${carimbo}`;

  await loginComoAdmin(page, lerCreds());
  const produtoId = await semearProduto(page, `Produto Jornada Expedicao ${carimbo}`);
  const pedido = await semearPedido(page, cliente, { produtoId });
  const numero = rotuloDoPedido(pedido.numero);

  // 1. Fila de embarque: o pedido aprovado aparece em "Aguardando embarque".
  await page.goto("/app/expedicao");
  await expect(page.getByRole("heading", { level: 1, name: /^expedição$/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Aguardando embarque", { exact: true })).toBeVisible();
  await expect(page.getByText(numero).first()).toBeVisible();

  // 2. Carga nova — placa no formato do produto (ABC1D23) e o pedido marcado.
  await page.locator("#placa").fill("ABC1D23");
  await page.locator("#veiculo").fill("HR");
  await page.locator("#motorista").fill(`Motorista ${carimbo}`);
  await page.locator("label").filter({ hasText: numero }).getByRole("checkbox").check();
  // SEM `exact: true`, e isso não é tolerância — é a forma do rótulo.
  // O botão mostra o que está marcado: `Criar carga (1)`, `Criar carga (3)`.
  // Com `exact`, o teste só passaria no instante em que a seleção estivesse
  // vazia, que é o estado em que o botão não faz nada. Medido no CI em
  // 09/10/2026: 300 s de timeout esperando um nome que nunca aparece exato.
  await page.getByRole("button", { name: /^Criar carga/ }).click();

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Carga criada" }).first();
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+/, { timeout: 20_000 });

  // 3. Ficha da carga: número, status Montando e o romaneio como PDF.
  await expect(page.getByRole("heading", { level: 1, name: /^Carga \d{3}$/ })).toBeVisible();
  await expect(page.getByText(/Montando · ABC1D23/)).toBeVisible();
  const romaneio = page.getByRole("link", { name: /romaneio e fechamento/i });
  await expect(romaneio).toBeVisible();
  await expect(romaneio).toHaveAttribute("href", /\/api\/v1\/shipments\/.+\/romaneio/);

  // 4. Rota: com 1 pedido não separado, "Sair para rota" fica travado e a
  // régua diz quanto falta. Separar destrava.
  const sairRota = page.getByRole("button", { name: "Sair para rota" });
  await expect(sairRota).toBeDisabled();
  await expect(page.getByText(/Faltam separar 1 pedido/)).toBeVisible();
  // Checkbox controlado: o `check()` do Playwright valida o estado logo após o
  // clique, mas ele só vira true quando o PATCH + recarregar voltam — por isso
  // `click` + `toBeChecked` com timeout.
  const separado = page.getByLabel(`Separado: ${numero}`);
  await separado.click();
  await expect(separado).toBeChecked({ timeout: 15_000 });
  await expect(sairRota).toBeEnabled({ timeout: 15_000 });

  // 5. Saída para rota → status "Em rota" e "Concluir carga" ainda travado
  // (a parada não foi entregue).
  await sairRota.click();
  await expect(page.getByText(/Em rota · ABC1D23/)).toBeVisible({ timeout: 20_000 });
  const concluir = page.getByRole("button", { name: "Concluir carga" });
  await expect(concluir).toBeDisabled();

  // 6. Entrega da parada → card "Paradas concluídas" 1/1 → conclusão libera.
  await page.getByRole("button", { name: "Entregue", exact: true }).click();
  await expect(page.getByText("1/1", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(concluir).toBeEnabled();
  await concluir.click();
  await expect(page.getByText(/Concluída · ABC1D23/)).toBeVisible({ timeout: 20_000 });
});
