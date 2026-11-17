import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { lerCreds, loginComoDono } from "./helpers/login-admin";

test.use({ locale: "pt-BR" });
test.setTimeout(120_000);

/**
 * AXE NAS TELAS DE OPERAÇÃO — o gate que faltava.
 *
 * ─── O QUE ELE PEGOU NA PRIMEIRA RODADA (17/11/2026) ───────────────────────
 *
 *   - `/app/contacts`: `aria-sort` no `<button>` da coluna (o atributo é de
 *     `columnheader`) — **4 colunas** reprovadas como crítico;
 *   - `/app/inbox`: filtro construído com `Tabs` do Radix **sem painel**, então
 *     cada gatilho saía com `aria-controls="…-content-unassigned"` — valor ARIA
 *     inválido, crítico.
 *
 * As duas foram corrigidas. As outras 6 telas já passavam.
 *
 * ─── POR QUE SÓ SERIOUS/CRITICAL ─────────────────────────────────────────
 *
 * `minor` e `moderate` do axe incluem coisas que dependem de conteúdo (ex.:
 * link com texto repetido). O gate cobra o que quebra a navegação de quem usa
 * leitor de tela; o resto fica no relatório de auditoria com o nome.
 */
const TELAS = [
  "/app",
  "/app/pedidos",
  "/app/contacts",
  "/app/inbox",
  "/app/financeiro",
  "/app/notas",
  "/app/settings",
];

test.describe("acessibilidade (axe, wcag2a/2aa)", () => {
  test("login não tem violação séria/crítica", async ({ page }) => {
    await page.goto("/login");
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const bloqueantes = violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(bloqueantes, JSON.stringify(bloqueantes, null, 2)).toEqual([]);
  });

  for (const tela of TELAS) {
    test(`${tela} não tem violação séria/crítica`, async ({ page }) => {
      await loginComoDono(page, lerCreds());
      await page.goto(tela);
      await page.waitForTimeout(1500);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const bloqueantes = violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
      expect(bloqueantes, JSON.stringify(bloqueantes, null, 2)).toEqual([]);
    });
  }
});
