/**
 * Capturas da auditoria visual — docs/design-overhaul/evidence/.
 * Roteiro: login como dono, visita as rotas críticas em 7 larguras × 2 temas.
 * Uso: `pnpm exec playwright test --config playwright.auditoria.config.ts`
 * (ver playwright.auditoria.config.ts). Não é gate: é evidência p/ decisão.
 */
import { test, expect } from "@playwright/test";

import { lerCreds, loginComoDono } from "./helpers/login-admin";

const ROTAS = [
  "/app",
  "/app/meu-dia",
  "/app/inbox",
  "/app/contacts",
  "/app/pedidos",
  "/app/radar",
  "/app/financeiro",
  "/app/products",
  "/app/estoque",
  "/app/comissoes",
];

const LARGURAS = [1920, 1440, 1280, 1024, 768, 430, 390];

test.describe("auditoria visual — capturas", () => {
  for (const tema of ["dark", "light"] as const) {
    for (const largura of LARGURAS) {
      // Só o conjunto completo em 1440+390; nas demais, as 3 críticas.
      const rotas =
        largura === 1440 || largura === 390
          ? ROTAS
          : ["/app", "/app/inbox", "/app/contacts"];
      for (const rota of rotas) {
        test(`${tema} ${largura}px ${rota}`, async ({ page }) => {
          await page.setViewportSize({ width: largura, height: 900 });
          const creds = lerCreds();
          await loginComoDono(page, creds);
          await page.addInitScript((t) => {
            window.localStorage.setItem("deskcomm-theme", t);
          }, tema);
          await page.goto(rota);
          // Espera a hidratação assentar em vez de sleep fixo.
          await page.waitForLoadState("networkidle").catch(() => {});
          await expect(page.locator("main, [role='main']").first()).toBeVisible({
            timeout: 20_000,
          });
          const nome = `evidence/auditoria/${tema}-${largura}${rota.replace(/\//g, "-")}.png`;
          await page.screenshot({ path: nome, fullPage: false });
        });
      }
    }
  }
});
