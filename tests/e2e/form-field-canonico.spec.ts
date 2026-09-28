import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";
import { execNpx } from "./utils/npx";

test.setTimeout(240_000);
test.use({ locale: "pt-BR" });
test.describe.configure({ mode: "serial" });

let creds: CredsE2E = lerCreds();

/**
 * Fase 5e - `FormField` canônico nos 7 forms de configuração:
 *
 *   - o rótulo liga ao controle (label com `htmlFor` + `id` injetado pelo
 *     clone no controle único);
 *   - a ajuda e a recusa saem com `aria-describedby`/`aria-invalid` ligados
 *     ao controle e a recusa com `role="alert"`, o que antes cada form
 *     refazia à mão (ou não fazia);
 *   - copy, placeholders e testids intactos - só a moldura é nova.
 *
 * Precondição semeada AQUI: `seed-e2e-system-update` promove o dono a
 * platform_admin (o `/admin/*` lê `platform_admins`; sem a linha o login cai
 * em `/admin/forbidden`).
 */
test.beforeAll(() => {
  execNpx(["tsx", "scripts/seed-e2e-system-update.ts"], { stdio: "inherit" });
  creds = lerCreds();
});

async function saudavel(page: Page) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
}

test("FormField canônico nos 6 forms", async ({ page }) => {
  await loginComoDono(page, creds);

  // 1. admin/marca - campo nome com ajuda longa (hint via prop)
  await page.goto("/admin/marca");
  const nomeDoSistema = page.getByLabel("Nome do sistema");
  await expect(nomeDoSistema).toBeVisible({ timeout: 15_000 });
  await expect(nomeDoSistema).toHaveAttribute("id", "app_name");
  await expect(nomeDoSistema).toHaveAttribute("aria-describedby", "app_name-hint");
  // clicar no rótulo foca o controle - o vínculo label->input está vivo
  // (label[for] e não getByText: a seção "De onde vem cada coisa" tem o
  // mesmo texto num span)
  await page.locator('label[for="app_name"]').click();
  await expect(nomeDoSistema).toBeFocused();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-formfield/1-admin-marca-desktop.png" });

  // 2. admin/tenants/new - 6 campos RHF com recusa, ajuda e asterisco
  await page.goto("/admin/tenants/new");
  const slug = page.getByLabel("Slug");
  await expect(slug).toBeVisible({ timeout: 15_000 });
  await expect(slug).toHaveAttribute("id", "slug");
  await expect(slug).toHaveAttribute("aria-describedby", "slug-hint");
  await expect(page.getByText("Gerado automaticamente.")).toBeVisible();
  await expect(slug).not.toHaveAttribute("aria-invalid", "true");
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-formfield/2-admin-tenants-new-desktop.png" });

  // 3. settings/profile - 5 campos (2 Selects Radix com id no trigger)
  await page.goto("/app/settings/profile");
  await expect(page.getByLabel("Nome completo")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Idioma")).toBeVisible();
  await expect(page.getByLabel("Fuso horário")).toBeVisible();
  await expect(page.getByLabel("Avatar URL")).toHaveAttribute(
    "aria-describedby",
    "avatar_url-hint",
  );
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-formfield/3-settings-profile-desktop.png" });

  // 4. settings/tenant - 9 campos em grid + motivos com ajuda
  await page.goto("/app/settings/tenant");
  await expect(page.getByLabel("Nome de exibição")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Razão social")).toBeVisible();
  const motivos = page.getByLabel("Motivos de perda extras");
  await expect(motivos).toHaveAttribute("aria-describedby", "lost_reasons-hint");
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-formfield/4-settings-tenant-desktop.png" });

  // 5. settings/atendimento - campos numéricos só aparecem no rodízio
  await page.goto("/app/settings/atendimento");
  await expect(page.getByTestId("opcao-modo-round_robin")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("opcao-modo-round_robin").click();
  const tentativas = page.getByLabel("Tentativas antes de desistir");
  await expect(tentativas).toBeVisible();
  await expect(tentativas).toHaveAttribute("aria-describedby", "max_retries-hint");
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-formfield/5-settings-atendimento-desktop.png" });

  // 6. settings/marca - hint com o nome EM VIGOR interpolado
  await page.goto("/app/settings/marca");
  const nomeDaEmpresa = page.getByLabel("Nome da sua empresa");
  await expect(nomeDaEmpresa).toBeVisible({ timeout: 15_000 });
  await expect(nomeDaEmpresa).toHaveAttribute("aria-describedby", "org_app_name-hint");
  await expect(page.getByText("Deixe em branco para usar")).toBeVisible();
  await saudavel(page);
  await page.screenshot({ path: "evidence/fase5-formfield/6-settings-marca-desktop.png" });
});
