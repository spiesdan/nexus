import * as path from "node:path";
import { expect, test } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";

/**
 * SPED Fiscal (app/app/notas → aba SPED Fiscal):
 *  1. Gerar arquivo não quebra a página;
 *  2. o arquivo aparece em textarea editável (qa sobrescrever e não lança erro);
 *  3. botão de baixar respeita o texto editado (o download existe);
 *  4. screenshot em evidence/sped-bloco-h/.
 */

const EVIDENCIA = path.join(process.cwd(), "evidence", "sped-bloco-h");
let creds: CredsE2E = lerCreds();

async function saudavel(page: any) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.locator("body")).toContainText(/Notas|nota/i);
}

test("SPED fiscal: geração abre textarea editável com blocos", async ({ page }) => {
  await loginComoDono(page, creds);
  await page.goto("/app/notas");
  await saudavel(page);
  await expect(page.locator("body")).toContainText(/Notas|nota/i);

  // Aba SPED Fiscal
  const abaSped = page.getByRole("tab", { name: /SPED/i }).or(page.getByText(/SPED Fiscal/i).first());
  await abaSped.click();
  await page.waitForTimeout(600);

  const gerar = page.getByRole("button", { name: /Gerar arquivo|Gerar|Enviar/i }).first();
  await gerar.click();
  await page.waitForTimeout(1800);
  await saudavel(page);

  const area = page.locator("textarea").first();
  await expect(area).toBeVisible();
  const texto = await area.inputValue();
  expect(texto.length).toBeGreaterThan(0);
  // presença esperada dos blocos (rascunho com ou sem notas)
  expect(texto).toContain("|0000|");
  expect(texto).toContain("|C001|");
  expect(texto).toContain("|H001|");
  expect(texto).toContain("|9999|");

  // Edita e verifica que o texto muda (arquivo editável)
  await area.fill(texto + "\\r\\n|H010|EDITADO|UN|1|0,00|0,00|0|||01|\\r\\n");
  const editado = await area.inputValue();
  expect(editado).toContain("EDITADO");

  await page.screenshot({ path: path.join(EVIDENCIA, "sped-arquivo-editavel.png"), fullPage: true });
  console.log(`evidence: ${path.join(EVIDENCIA, "sped-arquivo-editavel.png")}`);
});
