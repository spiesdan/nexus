import { expect, test } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";

/**
 * MATRIZ E · 10 — O CRIADOR DE PEDIDOS EM 320 px, POR TECLADO E COM LEITOR.
 *
 * A régua é medida, não olhada:
 *  - `documentElement.scrollWidth − innerWidth ≤ 1` em **320 px** (o menor
 *    aparelho que ainda navega na web; 390/430/768 já são cobertos por
 *    `responsividade-nas-rotas.spec.ts`, 320 não era);
 *  - busca e resumo têm nome acessível, e o resumo é uma região navegável;
 *  - `/` leva o foco à busca (atalho de teclado do editor);
 *  - scanner com código inexistente não inventa item: a tela diz que não
 *    encontrou e o carrinho continua vazio.
 *
 * Evidência visual em `evidence/criador-320/` — a régua acima é a prova
 * objetiva; o PNG é o que permite alguém conferir com os próprios olhos.
 */
test.setTimeout(180_000);
test.use({ locale: "pt-BR" });

const creds: CredsE2E = lerCreds();

test("criador em 320 px: sem overflow, busca e resumo nomeados, teclado e scanner", async ({
  page,
}) => {
  await loginComoDono(page, creds);
  // O rascunho local é escopado por org+usuário (`chaveDoRascunho`): limpar só
  // a chave legada não limpava nada e um resto de execução anterior encheria
  // o carrinho deste caso.
  await page.addInitScript(() => {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith("pedido-rascunho")) window.localStorage.removeItem(k);
    }
  });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/app/pedidos/novo");

  await expect(page.getByRole("heading", { name: "Novo pedido" })).toBeVisible({
    timeout: 20_000,
  });

  // 1 · 320 px sem rolagem horizontal. 1 px de folga absorve arredondamento
  // sub-pixel de borda; qualquer coisa acima disso é filho vazando.
  const excedeu = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(excedeu, `overflow horizontal em 320px: +${excedeu}px`).toBeLessThanOrEqual(1);

  // 2 · nomes acessíveis. O input da busca recebe o nome do rótulo visível; o
  // resumo é `role=region` com aria-label, para navegação por landmarks.
  await expect(page.locator("#busca-produto")).toHaveAccessibleName(/Produtos|Buscar/);
  await expect(page.getByRole("region", { name: "Resumo do pedido" })).toBeVisible();

  // 3 · teclado: `/` foca a busca (o atalho não rouba a paleta ⌘K global).
  await page.keyboard.press("/");
  await expect(page.locator("#busca-produto")).toBeFocused();

  // 4 · scanner com código que não existe: nenhum item entra no pedido.
  await page.keyboard.type("7890000000000");
  await expect(page.getByText("Nenhum produto encontrado.")).toBeVisible();
  await expect(page.getByText("Nenhum item ainda — busque e adicione.")).toBeVisible();

  await page.screenshot({
    path: `evidence/criador-320/pedido-320-${Date.now()}.png`,
    fullPage: true,
  });
});
