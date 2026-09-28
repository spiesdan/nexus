import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { rotuloDoPedido, semearContato, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Jornada 5 — Financeiro (§86): pedido → título → pagamento → conciliação.
 *
 * Mapeamento para a UI real:
 *
 * - **pedido**: semeado `aprovado` com contato real (sem contato o recebível
 *   nasce avulso e a busca por cliente da tela não o acha);
 * - **título**: o "Faturar pedido" da ficha dispara a geração automática de
 *   recebíveis (`gerarRecebiveis`, idempotente) — o título aparece na aba
 *   "Títulos" de `/app/financeiro` (o antigo `/app/titulos` virou redirect);
 * - **pagamento**: aba "Contas a receber" → linha do cliente → "Detalhe" →
 *   `Registrar recebimento` (valor + "Receber") → "Recebimento registrado" e
 *   o pagamento com botão "Estornar";
 * - **conciliação**: a aba é conciliação INTERNa (pedido × NF × financeiro) —
 *   não há importação bancária/OFX no produto. O nosso pedido faturado SEM
 *   nota emitida é, corretamente, a divergência `financeiro_sem_nf` no painel.
 */
test("jornada 5 (financeiro) — faturar gera título, receber baixa e conciliar acusa a NF", async ({
  page,
}) => {
  const carimbo = Date.now();
  const cliente = `Cliente Jornada Financeiro ${carimbo}`;

  await loginComoAdmin(page, lerCreds());
  const produtoId = await semearProduto(page, `Produto Jornada Financeiro ${carimbo}`);
  const contactId = await semearContato(page, cliente);
  const pedido = await semearPedido(page, cliente, { produtoId, contactId });
  const numero = rotuloDoPedido(pedido.numero);

  // 1. Faturar pela ficha: `aprovado → faturado` e os recebíveis nascem
  //    automaticamente (é isto que o card FINANCEIRO passa a mostrar).
  await page.goto(`/app/pedidos/${pedido.id}`);
  await expect(page.getByRole("heading", { level: 1, name: numero })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Faturar pedido" }).click();
  await expect(page.getByText("Faturado", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("link", { name: /ver financeiro/i })).toBeVisible({
    timeout: 20_000,
  });

  // 2. Título — a aba Títulos lista a parcela com ação de baixa (a coluna
  //    Pedido é o link `PED-000N`; a busca tem debounce próprio, por isso o
  //    timeout no link e não um pulse).
  await page.goto("/app/financeiro?aba=titulos");
  await expect(page.getByRole("heading", { level: 1, name: /^financeiro$/i })).toBeVisible({
    timeout: 20_000,
  });
  // O heading vem no HTML do servidor; se o `fill` roda antes da hidratação o
  // onChange do React se perde, o estado não muda e o debounce não dispara —
  // a lista fica inteira (medido com uma spec de diagnóstico: 15 → 1 linhas
  // só depois desta espera). `networkidle` não serve aqui: a página segura
  // conexões Realtime e nunca fica "idle".
  await page.waitForTimeout(1_500);
  await page.getByTestId("busca-titulo").fill(cliente);
  await expect(page.getByRole("link", { name: numero, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  // Contagem, não visibilidade: o debounce do filtro é 300ms + ida ao
  // servidor, e um `toBeVisible` em strict mode viola INSTANTE com as 16
  // linhas ainda cruas (strict não re-tenta). `toHaveCount` re-tenta até a
  // lista filtrada chegar — e só ela prova que o filtro de fato rodou.
  await expect(page.getByRole("button", { name: "Dar baixa" })).toHaveCount(1, {
    timeout: 15_000,
  });

  // 3. Pagamento — Contas a receber, linha do cliente, valor total, Receber.
  await page.goto("/app/financeiro");
  await expect(page.getByRole("heading", { level: 1, name: /^financeiro$/i })).toBeVisible({
    timeout: 20_000,
  });
  // Mesma guarda de hidratação do passo 2 antes de digitar no `#fin-busca`.
  await page.waitForTimeout(1_500);
  await page.locator("#fin-busca").fill(cliente);
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  const linha = page.locator("tbody tr").filter({ hasText: cliente });
  await expect(linha, "o recebível do pedido faturado aparece na lista").toBeVisible({
    timeout: 15_000,
  });
  await linha.getByRole("button", { name: "Detalhe" }).click();
  await page.getByLabel("Valor recebido").fill("49,90");
  // O assistente flutuante é fixo no canto inferior direito (z-40) e, com a
  // linha expandida, cai POR CIMA do botão: `click` falha no hit-test e
  // `force:true` ainda dispara nas coordenadas — o avatar abre o diálogo e o
  // "Receber" nunca recebe o evento (medido). `dispatchEvent` entrega o
  // clique direto no botão, é o caminho honesto aqui.
  await page.getByRole("button", { name: "Receber", exact: true }).dispatchEvent("click");

  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Recebimento registrado" })
    .first();
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Estornar" })).toBeVisible({ timeout: 15_000 });

  // 4. Conciliação — o pedido faturado sem nota é divergência declarada
  //    (`financeiro_sem_nf`): acusar é o painel trabalhando, não um defeito.
  //    O banco já tem outras divergências legítimas (o painel é de exceção),
  //    então o card é escopado AO NOSSO pedido pelo link "Ver pedido".
  await page.goto("/app/financeiro?aba=conciliacao");
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  const cardDaDivergencia = page
    .locator("li")
    .filter({ has: page.locator(`a[href="/app/pedidos/${pedido.id}"]`) });
  await expect(cardDaDivergencia).toBeVisible({ timeout: 15_000 });
  await expect(cardDaDivergencia.getByText("financeiro sem nf", { exact: true })).toBeVisible();
  await expect(cardDaDivergencia.getByRole("link", { name: /ver pedido/i })).toBeVisible();
});
