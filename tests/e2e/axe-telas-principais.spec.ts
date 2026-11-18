import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { lerCreds, loginComoDono } from "./helpers/login-admin";

test.use({ locale: "pt-BR" });
test.setTimeout(120_000);

/**
 * AXE NAS TELAS DE OPERAÇÃO — o gate que faltava.
 *
 * ─── 9.6 (17/11/2026): 10 telas e WCAG 2.2 ─────────────────────────────────
 *
 * O conjunto passou a incluir `/app/ai` e `/app/expedicao` — as duas telas de
 * operação que faltavam — e as tags subiram para WCAG 2.0/2.1 **e 2.2** AA.
 * A régua nova achou violação real de 2.5.8 (alvo de toque) no gráfico de
 * vendas: botões de 15–20 px com 19,2 px de espaço seguro. Corrigidos no
 * componente (`crm-sales-chart.tsx`), não mascarados com `disableRules`.
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
  // 9.6 — as duas que faltavam do conjunto de operação. `/app/ai` é o painel
  // de IA; `/app/expedicao` é a carga/mapa, com os controles mais densos.
  "/app/ai",
  "/app/expedicao",
];

/**
 * WCAG 2.2 (AA) além de 2.0/2.1.
 *
 * `wcag22aa` existe no axe-core usado pelo repo e cobre os critérios novos que
 * dá para testar automaticamente (alvo de toque, foco não obscurecido). Rodar
 * só 2.0/2.1 deixava a régua que o prompt pede pela metade.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("acessibilidade (axe, wcag2a/2aa)", () => {
  test("login não tem violação séria/crítica", async ({ page }) => {
    await page.goto("/login");
    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
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
        .withTags(TAGS)
        .analyze();
      const bloqueantes = violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
      expect(bloqueantes, JSON.stringify(bloqueantes, null, 2)).toEqual([]);
    });
  }
});
