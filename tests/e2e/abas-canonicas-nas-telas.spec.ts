import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";
import { execNpx } from "./utils/npx";

test.setTimeout(240_000);
test.use({ locale: "pt-BR" });
test.describe.configure({ mode: "serial" });

let creds: CredsE2E = lerCreds();

/**
 * Fase 5c - abas canônicas: as 6 telas que ainda montavam `role="tab"` manual
 * (produtos, radar, histórico da agenda, tipo de pessoa nos 2 dialogs de
 * contato, papéis do agente) passaram a montar `ui/tabs`; a sub-nav do detalhe
 * de tenant virou `TabsTrigger asChild` sobre `Link` (navegação é URL - href,
 * ctrl+click e botão voltar continuam - e o valor controlado sai do `pathname`).
 *
 * As precondições são semeadas AQUI, não pressupostas (mesmo molde de
 * `agente-papeis-operador`): `seed-e2e-capacidades` para o `mcp_agent` (a tela
 * de papéis é dele) e `seed-e2e-system-update` para o dono do servidor - o
 * `/admin/*` lê `platform_admins` e sem esta linha o login do dono cai em
 * `/admin/forbidden`.
 */
test.beforeAll(() => {
  execNpx(["tsx", "scripts/seed-e2e-capacidades.ts"], { stdio: "inherit" });
  execNpx(["tsx", "scripts/seed-e2e-system-update.ts"], { stdio: "inherit" });
  creds = lerCreds();
});

async function saudavel(page: Page) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
}

test("abas canônicas: 6 telas em ui/tabs + sub-nav do tenant com href", async ({ page }) => {
  await loginComoDono(page, creds);

  // 1. produtos - abas do catalogo
  await page.goto("/app/products");
  const catalogo = page.getByRole("tablist", { name: "Abas do catálogo" });
  await expect(catalogo).toBeVisible({ timeout: 15_000 });
  await catalogo.getByRole("tab", { name: "Promoções" }).click();
  await expect(catalogo.getByRole("tab", { name: "Promoções" })).toHaveAttribute("data-state", "active");
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-tabs-unicas/1-produtos-abas-desktop.png" });

  // 2. radar - categorias
  await page.goto("/app/radar");
  const categorias = page.getByRole("tablist", { name: "Categorias" });
  await expect(categorias).toBeVisible({ timeout: 15_000 });
  await categorias.getByRole("tab", { name: /^Oportunidade/ }).click();
  await expect(categorias.getByRole("tab", { name: /^Oportunidade/ })).toHaveAttribute("data-state", "active");
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-tabs-unicas/2-radar-categorias-desktop.png" });

  // 3. historico da agenda (vitrine - nao toca banco)
  await page.goto("/vitrine-agenda");
  const hist = page.getByTestId("historico-da-agenda");
  await expect(hist).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("aba-cancelados").click();
  await expect(hist).toHaveAttribute("data-aba", "cancelados");
  await expect(page.getByRole("tab", { name: /Cancelados/ })).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-tabs-unicas/3-agenda-historico-desktop.png" });

  // 4. dialog de novo cliente - tipo de pessoa
  await page.goto("/app/contacts");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  const tipo = page.getByRole("tablist", { name: "Tipo de pessoa" });
  await expect(tipo).toBeVisible({ timeout: 15_000 });
  await tipo.getByRole("tab", { name: "Pessoa física" }).click();
  await expect(tipo.getByRole("tab", { name: "Pessoa física" })).toHaveAttribute("data-state", "active");
  await page.screenshot({ path: "evidence/fase5-tabs-unicas/4-dialog-tipo-pessoa-desktop.png" });
  await page.keyboard.press("Escape");

  // 5. papel do agente
  await page.goto(`/app/ai/agents/${creds.capacidades!.agent_id}`);
  const papeis = page.getByRole("tablist", { name: "Papéis do agente" });
  await expect(papeis).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("papel-operacao").click();
  await expect(page.getByTestId("papel-operacao")).toHaveAttribute("data-state", "active");
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-tabs-unicas/5-agente-papeis-desktop.png" });

  // 6. sub-nav do detalhe de tenant (tabs com href - navegacao e' URL)
  await page.goto("/admin/tenants");
  await page.locator('a[href^="/admin/tenants/"]:not([href="/admin/tenants/new"])').first().click();
  await expect(page).toHaveURL(/\/admin\/tenants\/[0-9a-f-]{36}/, { timeout: 15_000 });
  const subnav = page.getByRole("tablist").first();
  await expect(subnav.getByRole("tab", { name: "Visão Geral" })).toBeVisible();
  await expect(subnav.getByRole("tab", { name: "Saúde" })).toHaveAttribute("href", /\/health$/);
  await expect(subnav.getByRole("tab", { name: /em breve/ })).toHaveCount(2);
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-tabs-unicas/6-admin-tenant-abas-desktop.png" });
});
