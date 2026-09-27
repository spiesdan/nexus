import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test.setTimeout(300_000);

/**
 * Jornada 1 — Venda (§86): login → cliente → pedido → produtos → desconto →
 * pagamento → aprovação → pedido criado.
 *
 * Mapeamento para a UI real (não inventado): o editor de `/app/pedidos/novo`
 * tem 5 passos — Cliente · Produtos · Condições · Entrega · Revisão — e o
 * spec se encaixa assim:
 *
 * - **cliente**: contato criado pela API (a criação não é o que se testa) e
 *   ESCOLHIDO pelo autocomplete da tela (`#busca-cliente`);
 * - **produtos**: busca `#busca-produto` + clique no destaque (Enter faz o
 *   mesmo);
 * - **desconto**: `Desconto (%)` no passo Condições — 3% fica DENTRO do teto
 *   da política (`desconto_max_vendedor_pct`, default 5%), então o pedido
 *   nasce `aprovado`;
 * - **pagamento**: não existe etapa de método de pagamento no produto — o que
 *   existe é `Condição de pagamento` (texto livre que gera as parcelas do
 *   resumo). O passo "pagamento" do spec é esta condição;
 * - **aprovação**: pedido acima do teto só escala para `em_analise` quando o
 *   papel é menor que manager (aqui é admin, então não dispara sozinho). O
 *   passo é exercitado de propósito criando um pedido já em `em_analise` e
 *   aprovando-o pela tela ("Aprovar pedido" → pill "Aprovado" → "Faturar
 *   pedido" vira o próximo passo);
 * - **pedido criado**: toast `Pedido criado: PED-…` + redirect para
 *   `/app/pedidos`, ficha aberta pelo card da lista.
 *
 * Guardas de ambiente: o autosave (`localStorage["pedido-rascunho"]`) é
 * limpo no início — um rascunho deixado por outra execução restauraria itens
 * alheios no passo Cliente; produto nasce com `controla_estoque: false` porque
 * estoque não é o que esta jornada mede.
 */
test("jornada 1 (venda) — do login ao pedido criado, aprovado e faturável", async ({ page }) => {
  const carimbo = Date.now();
  const cliente = `Cliente Jornada Venda ${carimbo}`;
  const codigo = `JV${carimbo}`;

  await page.addInitScript(() => window.localStorage.removeItem("pedido-rascunho"));
  await loginComoAdmin(page, lerCreds());

  // Pré-condições pela API: produto e contato. A jornada sob teste começa na
  // tela do editor — não há seed e2e de catálogo.
  const produto = await page.request.post("/api/v1/products", {
    data: {
      codigo,
      nome: `Produto Jornada Venda ${carimbo}`,
      preco_cents: 4990,
      controla_estoque: false,
    },
  });
  expect(produto.status(), "não deu para criar o produto de teste").toBe(201);
  const produtoId = ((await produto.json()) as { data: { id: string } }).data.id;

  const contato = await page.request.post("/api/v1/contacts", {
    data: { display_name: cliente, source: "manual" },
  });
  expect(contato.status(), "não deu para criar o contato de teste").toBe(201);

  // 1. Passo Cliente — escolher pelo autocomplete (o nome digitado sozinho é
  // o caminho do cliente avulso; aqui o cliente é real).
  await page.goto("/app/pedidos/novo");
  await expect(page.getByRole("heading", { level: 1, name: /novo pedido/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.locator("#busca-cliente").fill(cliente);
  await page.getByRole("button", { name: new RegExp(cliente) }).click();
  await expect(page.locator("#busca-cliente")).toHaveValue(cliente);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // 2. Passo Produtos — busca por código, destaque clicado, item na lista.
  await page.locator("#busca-produto").fill(codigo);
  await page.getByRole("button", { name: new RegExp(codigo) }).click();
  // O stepper do item tem 3 elementos com o label "Quantidade" (o input e os
  // dois botões ±) — o que prova item adicionado é o input de quantidade.
  await expect(page.getByRole("spinbutton", { name: "Quantidade" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // 3. Passo Condições — pagamento (condição) + desconto dentro do teto.
  await page.locator("#condicao").fill("30/60 dias");
  await page.locator("#desconto-pct").fill("3");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // 4. Passo Entrega — sem obrigatoriedade; segue direto para a revisão.
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // 5. Revisão — o card "Cliente:" é o da revisão (fora do `#resumo`, que é o
  // card de totais do OrderSummary), e o Finalizar é o POST.
  await expect(page.locator("#resumo")).toBeVisible();
  await expect(page.getByText(`Cliente: ${cliente}`)).toBeVisible();
  await page.getByRole("button", { name: "Finalizar pedido" }).click();

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Pedido criado" }).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const numero = ((await toast.textContent()) ?? "").match(/PED-\d+/)?.[0];
  expect(numero, "o toast de sucesso devolve o número do pedido").toBeTruthy();

  // 6. Pedido criado — a tela volta para a lista; a busca por cliente acha o
  // card e o link do número abre a ficha.
  await page.waitForURL((url) => url.pathname === "/app/pedidos", { timeout: 20_000 });
  await page.getByPlaceholder("Pedido, cliente ou representada").fill(cliente);
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  const card = page.getByRole("link", { name: numero!, exact: true });
  await expect(card, "o pedido criado aparece na lista").toBeVisible({ timeout: 15_000 });
  await card.click();

  // 7. Ficha: dentro do teto o pedido nasce Aprovado — o próximo passo da
  // máquina de status é "Faturar pedido", e é isso que prova a aprovação.
  await page.waitForURL(/\/app\/pedidos\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: /^PED-\d+$/ })).toBeVisible();
  await expect(page.getByText("Aprovado", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Faturar pedido" })).toBeVisible();

  // 8. Aprovação de verdade: um pedido em `em_analise` (fora do teto, papel
  // menor que manager, ou seja, o estado que a fila de aprovação usa) é
  // aprovado pela tela.
  const emAnalise = await page.request.post("/api/v1/commercial-orders", {
    data: {
      cliente_nome: cliente,
      status: "em_analise",
      origem: "vendedor",
      desconto_cents: 0,
      frete_cents: 0,
      itens: [{ product_id: produtoId, quantidade: 1, preco_unit_cents: 4990 }],
    },
  });
  expect(emAnalise.status(), "não deu para criar o pedido em análise").toBe(201);
  const idEmAnalise = ((await emAnalise.json()) as { data: { id: string } }).data.id;

  await page.goto(`/app/pedidos/${idEmAnalise}`);
  await expect(page.getByText("Em análise", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Aprovar pedido" }).click();
  await expect(page.getByText("Aprovado", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Faturar pedido" })).toBeVisible();
});
