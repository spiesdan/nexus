import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono } from "./helpers/login-admin";

/**
 * A TELA CAMPANHA — a porta única de "falar com a base" (`/app/campanhas`).
 *
 * ─── POR QUE ELA NÃO TINHA SPEC ───────────────────────────────────────────
 *
 * Uma varredura de cobertura (17/11/2026) mostrou **156 telas**: 125 visitadas
 * literalmente por alguma spec, 15 só por padrão dinâmico e **16 sem menção
 * nenhuma** — e `/app/campanhas` era uma delas, apesar de ser o destino de
 * `/app/prospeccao` e de concentrar o trabalho do dia (campanha + prospecção).
 * A spec do mapa (`prospeccao-mapa`) cobre a ABA Empresas; a tela em si, não.
 *
 * ─── O QUE ESTA PROVA ─────────────────────────────────────────────────────
 *
 *  1. a tela abre pela URL própria, com o título canônico ("Campanha");
 *  2. as **duas subtelas** existem e trocam por clique, e a URL acompanha
 *     (`?subtela=`), que é o que faz o link salvo reabrir no lugar certo;
 *  3. trocar para Prospecção **não** remonta a árvore: a aba escolhida
 *     permanece (o defeito do F-27, que voltava para Campanhas);
 *  4. nada de estado de erro na tela.
 */
test.use({ locale: "pt-BR" });
test.setTimeout(120_000);

async function saudavel(page: Page) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
}

test("campanhas: abre, alterna as subtelas e a escolha permanece", async ({ page }) => {
  await loginComoDono(page, lerCreds());

  await page.goto("/app/campanhas");
  await expect(page.getByRole("heading", { level: 1, name: "Campanha" })).toBeVisible({
    timeout: 20_000,
  });

  // As duas subtelas, com os nomes que o produto usa.
  const campanha = page.getByRole("tab", { name: "Campanha" });
  const prospeccao = page.getByRole("tab", { name: "Prospecção" });
  await expect(campanha).toBeVisible();
  await expect(prospeccao).toBeVisible();

  // Trocar de subtela escreve a URL — o link salvo reabre no mesmo lugar.
  await prospeccao.click();
  await expect(page).toHaveURL(/subtela=prospeccao/, { timeout: 15_000 });
  await expect(page.getByRole("tab", { name: "Prospecção" })).toHaveAttribute(
    "data-state",
    "active",
  );

  // F-27: a subtela escolhida NÃO volta sozinha. Antes, um efeito de URL
  // navegava para o alias e a árvore remontava — e a tela reabria em Campanhas.
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL(/subtela=prospeccao/);
  await expect(page.getByRole("tab", { name: "Prospecção" })).toHaveAttribute(
    "data-state",
    "active",
  );

  await saudavel(page);
});
