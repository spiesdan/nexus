import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * BARRA DE AVANÇO DA NOVA CARGA — COMPÕE COM O DOCK E COM O TECLADO.
 *
 * Duas dívidas do PR #959, medidas em 390 px:
 *
 *  a) quando o `MobileDock` devolve `null` (papel sem destinos ou rota em
 *     `SEM_DOCK`), a barra ficava 57 px acima do rodapé, flutuando. Agora o
 *     dock sinaliza presença (`DockPresence`) e a barra desce a `bottom: 0` com
 *     a safe area do aparelho;
 *  b) teclado aberto no passo 2: a barra `fixed` ficava ancorada no rodapé de
 *     baixo do teclado. Medida pelo `visualViewport`, ela sobe junto.
 *
 * O proxy do teclado é explícito: o `visualViewport.height` é reduzido em 300
 * px e um `resize` é disparado — a mesma coisa que o iOS faz ao abrir o
 * teclado, sem precisar de aparelho físico.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("barra fica acima do dock, dentro da viewport curta e sobe com o teclado", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Espelho do teclado: `alturaCoberta` px ficam por baixo dele.
    (window as unknown as { __tecladoPx: number }).__tecladoPx = 0;
    const vv = window.visualViewport;
    if (!vv) return;
    Object.defineProperty(vv, "height", {
      configurable: true,
      get: () =>
        window.innerHeight -
        (window as unknown as { __tecladoPx: number }).__tecladoPx,
    });
  });

  await loginComoAdmin(page, lerCreds());
  await page.goto("/app/expedicao/nova");

  const dock = page.getByRole("navigation", { name: "Navegação rápida" });
  const barra = page.getByTestId("barra-avancar");
  const avancar = page.getByRole("button", { name: /^Continuar:/ });

  // Passo 1 → 2, onde vivem a placa e o motorista (o teclado abre ali).
  await expect(barra).toHaveAttribute("data-dock", "presente");
  await avancar.click();
  await expect(page.locator("#placa")).toBeVisible({ timeout: 20_000 });

  // a) A barra encosta no topo do dock, não flutua.
  await expect(dock).toBeVisible();
  const caixaDock = (await dock.boundingBox())!;
  const caixaBarra = (await barra.boundingBox())!;
  expect(
    Math.abs(caixaBarra.y + caixaBarra.height - caixaDock.y),
    `barra termina em ${caixaBarra.y + caixaBarra.height}, dock começa em ${caixaDock.y}`,
  ).toBeLessThanOrEqual(1);

  // b1) Viewport curta (proxy do teclado): o alvo continua inteiro na tela e
  // sem ser coberto pelo dock.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.locator("#placa").focus();
  const alvoCurto = (await avancar.boundingBox())!;
  expect(alvoCurto.y).toBeGreaterThanOrEqual(0);
  expect(alvoCurto.y + alvoCurto.height).toBeLessThanOrEqual(420);
  const dockCurto = (await dock.boundingBox())!;
  const barraCurta = (await barra.boundingBox())!;
  expect(barraCurta.y + barraCurta.height).toBeLessThanOrEqual(dockCurto.y + 1);

  // b2) O teclado de verdade encobre 300 px: a barra sobe para cima dele.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    (window as unknown as { __tecladoPx: number }).__tecladoPx = 300;
    window.visualViewport?.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => {
      const caixa = (await barra.boundingBox())!;
      return Math.round(844 - (caixa.y + caixa.height));
    })
    .toBeGreaterThanOrEqual(299);
  const alvoComTeclado = (await avancar.boundingBox())!;
  expect(
    alvoComTeclado.y + alvoComTeclado.height,
    "o botão 'Continuar: revisão' precisa ficar acima do teclado",
  ).toBeLessThanOrEqual(844 - 300 + 1);
});

test("sem dock a barra desce ao rodapé (SEM_DOCK) e o shell diz que não há dock", async ({
  page,
}) => {
  await loginComoAdmin(page, lerCreds());
  // `/app/pedidos/novo` é a rota documentada em `SEM_DOCK`.
  await page.goto("/app/pedidos/novo");
  await expect(page.locator("[data-dock='ausente']")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("navigation", { name: "Navegação rápida" })).toHaveCount(0);
});
