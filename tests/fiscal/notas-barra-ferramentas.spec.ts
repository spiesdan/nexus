import * as path from "node:path";
import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "../e2e/helpers/login-admin";

/**
 * Evidência da PR #32: a barra de ferramentas de Notas deve aparecer
 * mesmo sem notas (GradeNotas sem condicional errado).
 */
const EVIDENCIA = path.join(process.cwd(), "evidence", "notas-barra");

test("Barra de ferramentas de notas visível mesmo vazia", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());
  await page.goto("/app/notas");
  await expect(page.getByRole("heading", { name: /Notas fiscais/i })).toBeVisible({ timeout: 15_000 });

  // A barra que antes sumia: Emitir nota / Exportar CSV / Importar do SEFAZ
  await expect(page.getByText("Emitir nota", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Exportar CSV", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Importar histórico do SEFAZ", { exact: false }).first()).toBeVisible();

  await page.screenshot({ path: path.join(EVIDENCIA, "1-barra-notas-ainda-vazia.png"), fullPage: true });
  console.log(`evidence: ${path.join(EVIDENCIA, "1-barra-notas-ainda-vazia.png")}`);
});
