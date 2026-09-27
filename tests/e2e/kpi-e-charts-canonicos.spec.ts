import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";
import { execNpx } from "./utils/npx";

test.setTimeout(240_000);
test.use({ locale: "pt-BR" });
test.describe.configure({ mode: "serial" });

let creds: CredsE2E = lerCreds();

/**
 * Fase 5d - `NexusKpi` único + primitivos `NexusChart`:
 *
 *   - os 5 conjuntos de KPI (CrmKpi da home/financeiro, KPICards do dashboard
 *     admin, e os 3 StatCard locais de AI usage, AI evolution e TenantOverview)
 *     montam o card canônico;
 *   - os 2 gráficos irmãos byte a byte (UsageChart de AI × UsageCharts do
 *     admin) e o tooltip do GraficoDiario da evolution usam os primitivos
 *     (ChartCard/ChartEmpty/tooltip/eixo/cores) de `nexus-chart.tsx`.
 *
 * As precondições são semeadas AQUI: `seed-e2e-capacidades` dá dado de IA à
 * organização e `seed-e2e-system-update` promove o dono a platform_admin (o
 * `/admin/*` lê `platform_admins`; sem a linha o login cai em `/admin/forbidden`).
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

test("NexusKpi e NexusChart nas 7 telas", async ({ page }) => {
  await loginComoDono(page, creds);

  // 1. home do tenant - NexusKpiGrid (era CrmKpiGrid)
  await page.goto("/app");
  await expect(page.getByText("Vendido hoje")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Previsão de fechamento")).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-kpi-charts/1-home-kpi-desktop.png" });

  // 2. financeiro - 4 grids do fluxo (era CrmKpi)
  await page.goto("/app/financeiro");
  await expect(page.getByText("Vence hoje / 7 dias")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Recebido (período)")).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-kpi-charts/2-financeiro-kpi-desktop.png" });

  // 3. dashboard admin - KPICards sobre NexusKpi
  await page.goto("/admin");
  await expect(page.getByText("Tenants Ativos")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Budgets IA")).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-kpi-charts/3-admin-dashboard-kpi-desktop.png" });

  // 4. AI usage - 4 StatCards + UsageChart com primitivos canonicos
  await page.goto("/app/ai/usage");
  await expect(page.getByText("Custo no período")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Atendimentos com IA")).toBeVisible();
  await expect(page.getByText("Quanto gastou por dia (R$)")).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-kpi-charts/4-ai-usage-kpi-chart-desktop.png" });

  // 5. AI evolution - 8 StatCards + GraficoDiario com tooltip canonico
  await page.goto("/app/ai/evolution");
  await expect(page.getByText("Regras que você ensinou")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Negócios fechados pelo agente")).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-kpi-charts/5-ai-evolution-kpi-desktop.png" });

  // 6. admin usage - UsageCharts com ChartCard/ChartEmpty canonicos
  await page.goto("/admin/usage");
  await expect(page.getByText("Mensagens / dia")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI Tokens / dia")).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-kpi-charts/6-admin-usage-chart-desktop.png" });

  // 7. detalhe de tenant - os 5 StatCards de Volumes (era value number ja pt-BR)
  await page.goto("/admin/tenants");
  await page.locator('a[href^="/admin/tenants/"]:not([href="/admin/tenants/new"])').first().click();
  await expect(page).toHaveURL(/\/admin\/tenants\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await expect(page.getByText("Volumes")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Usuários", { exact: true })).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-kpi-charts/7-tenant-volume-kpi-desktop.png" });
});
