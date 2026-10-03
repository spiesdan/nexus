import * as path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";
import { execNpx } from "./utils/npx";

/**
 * Radar → seção "Novos prospects" (spec 19, FASE 11, §30) — a seção que o B17
 * apontava como sem spec própria. O que esta prova de ponta a ponta:
 *
 *  1. a seção existe na página única do Radar SEM clique intermediário (o
 *     molde das outras seções — esconder atrás de aba quebraria os e2e
 *     `recompra-radar`/`risk-radar`, por isso a rolagem);
 *  2. o prospect semeado NUNCA abordado (`status=novo`, sem dono) cai no
 *     recorte `status=novo,nao_analisado` que a rota responde;
 *  3. as 3 ações do §30 batem: **Adicionar à fila** vira meu (o botão some),
 *     **Abrir** cai no deep-link `?prospect=<uuid>` da Prospecção e
 *     **Iniciar conversa** abre o Inbox com a conversa criada;
 *  4. nenhuma tela de erro ("Algo deu errado" / "Erro ao carregar…").
 *
 * O seed cria 1 prospect com telefone (habilita "Iniciar conversa") e zera o
 * dono se já existir; a limpeza o apaga para não disputar contagens de specs
 * seguintes (o banco do e2e não tem reset entre specs).
 */
const RAIZ = path.join(__dirname, "..", "..");
const NOME_PROSPECT = "Padaria E2E Radar Novo";

let creds: CredsE2E = lerCreds();

async function saudavel(page: Page) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
}

test.beforeAll(() => {
  creds = lerCreds();
  execNpx(["tsx", "scripts/seed-e2e-radar-prospects.ts"], { stdio: "inherit", cwd: RAIZ });
});

test("radar: novos prospects com as 3 ações — fila, abrir e conversa", async ({ page }) => {
  await loginComoDono(page, creds);
  await page.goto("/app/radar");

  // A seção nasce visível na página única (o botão "Prospecção" só rola).
  const secao = page.locator("#radar-prospeccao");
  await expect(secao.getByRole("heading", { name: "Novos prospects" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(secao.getByText("Quem podemos vender hoje?")).toBeVisible();

  const card = secao.locator("li", { hasText: NOME_PROSPECT });
  await expect(card).toBeVisible({ timeout: 20_000 });

  // O botão da seção ROLA até ela (sem trocar de conteúdo) — e é assim que um
  // usuário chega aqui. A evidência sai já com a seção em vista: o app rola em
  // contêiner interno, então `fullPage` não desce e o corte fica no topo.
  await page.getByRole("button", { name: "Prospecção", exact: true }).click();
  await card.scrollIntoViewIfNeeded();

  // A dica do assistente flutuante ("Precisa de ajuda?…") nasce aos 2s e some
  // aos 10s do mount — dentro dessa janela ela cobre o botão "Adicionar à
  // fila" da evidência. Dispensar o nó não toca em nada do que a foto prova.
  await page.evaluate(() => {
    document.querySelectorAll('[role="status"]').forEach((el) => {
      if (el.textContent?.includes("Precisa de ajuda")) el.remove();
    });
  });

  await saudavel(page);
  await page.screenshot({
    path: "evidence/radar-prospeccao/1-radar-novos-prospects-1280.png",
  });

  // ---- Ação 2: Adicionar à fila → eu viro o dono e o botão some ----
  await card.getByRole("button", { name: "Adicionar à fila" }).click();
  await expect(card.getByRole("button", { name: "Adicionar à fila" })).toHaveCount(0, {
    timeout: 15_000,
  });
  await saudavel(page);

  // ---- Ação 1: Abrir → deep-link do drawer da Prospecção (FASE 11) ----
  await card.getByRole("button", { name: "Abrir" }).click();
  await page.waitForURL(/\?prospect=[0-9a-f-]+/, { timeout: 15_000 });
  const id = new URL(page.url()).searchParams.get("prospect");
  expect(id).toBeTruthy();

  // ---- Ação 3: Iniciar conversa → Inbox com a conversa recém-aberta ----
  await page.goto("/app/radar");
  const cardDeVolta = secao.locator("li", { hasText: NOME_PROSPECT });
  await expect(cardDeVolta).toBeVisible({ timeout: 20_000 });
  await cardDeVolta.getByRole("button", { name: "Iniciar conversa" }).click();
  await page.waitForURL(/\/app\/inbox\?id=/, { timeout: 25_000 });
  await saudavel(page);

  // ---- limpeza: o banco do e2e é compartilhado entre specs, sem reset ----
  const limpeza = await page.request.delete(`/api/v1/prospecting/prospects/${id}`);
  expect(limpeza.ok(), `DELETE limpeza → ${limpeza.status()}`).toBeTruthy();
});
