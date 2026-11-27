import fs from "node:fs";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * MEDIÇÃO do aceite do #975 (folga do dock no Radar em 390), pedida pelo QA.
 *
 * Números exigidos, no scroll máximo em 390×844:
 *   1. scrollTop + clientHeight >= scrollHeight - 1
 *   2. gap = dockTop - cardBottom >= 8 px no ÚLTIMO cartão
 *   3. scrollWidth - clientWidth <= 0
 *
 * A prova é o número medido aqui + a imagem do último cartão; não é opinião.
 * Roda no mesmo ambiente do e2e (Supabase local + baseline + build de produção)
 * e sobre o commit que está na main, para o número ser do produto publicado.
 */
test.setTimeout(600_000);

const RAIZ = "evidence/radar-medida";
const DOCK = 'nav[aria-label="Navegação rápida"]';

test("mede a folga do dock no Radar em 390", async ({ page }) => {
  fs.mkdirSync(RAIZ, { recursive: true });
  await loginComoAdmin(page, lerCreds());
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/app/prospeccao?aba=empresas", {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 180_000,
  });

  // Se não houver cartão, o diagnóstico vem da própria API — não de suposição.
  const cartoesVisiveis = await page.locator("li").evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height > 0).length,
  );
  if (cartoesVisiveis === 0) {
    const resposta = await page.request.get("/api/v1/prospecting/prospects?limite=6");
    console.log(`[diagnostico] GET prospects status=${resposta.status()} corpo=${(await resposta.text()).slice(0, 600)}`);
  }

  // Rola até o FIM da lista: é lá que o defeito aparecia.
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = main.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500);

  const medida = await page.evaluate((seletor) => {
    const main = document.querySelector("main") as HTMLElement | null;
    const rolagem = main ?? (document.scrollingElement as HTMLElement);
    const dock = document.querySelector(seletor);
    const topoDock = dock ? dock.getBoundingClientRect().top : window.innerHeight;

    const todos = Array.from(document.querySelectorAll("li"));
    const candidatos = todos
      .map((el) => ({ texto: (el.textContent ?? "").trim().slice(0, 24), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 0 && r.width > 0)
      .sort((a, b) => b.r.bottom - a.r.bottom);
    const ultimo = candidatos[0];

    return {
      scrollTop: Math.round(rolagem.scrollTop),
      clientHeight: rolagem.clientHeight,
      scrollHeight: rolagem.scrollHeight,
      dockTop: Math.round(topoDock),
      cardBottom: ultimo ? Math.round(ultimo.r.bottom) : -1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cartoes: todos.length,
      candidatos: candidatos.length,
      topo3: candidatos.slice(0, 3).map((c) => `${c.texto}|bottom=${Math.round(c.r.bottom)}`),
    };
  }, DOCK);

  const gap = medida.cardBottom >= 0 ? medida.dockTop - medida.cardBottom : Number.NaN;
  const sobraRolagem = medida.scrollTop + medida.clientHeight - medida.scrollHeight;
  const overflow = medida.scrollWidth - medida.clientWidth;

  console.log(
    `[medida] 390: scrollTop=${medida.scrollTop} clientHeight=${medida.clientHeight} ` +
      `scrollHeight=${medida.scrollHeight} (sobra=${sobraRolagem})`,
  );
  console.log(`[medida] 390: dockTop=${medida.dockTop} cardBottom=${medida.cardBottom} gap=${gap}px`);
  console.log(`[medida] 390: scrollWidth=${medida.scrollWidth} clientWidth=${medida.clientWidth} overflow=${overflow}px`);
  console.log(`[medida] 390: cartoes=${medida.cartoes} candidatos=${medida.candidatos}`);
  console.log(`[medida] 390: top3 ${JSON.stringify(medida.topo3)}`);

  await page.screenshot({ path: `${RAIZ}/radar-390-ultimo-cartao.png` });

  expect(medida.candidatos, "precisa haver 6 cartões medíveis (nunca 0)").toBe(6);
  expect(sobraRolagem, "scrollTop + clientHeight >= scrollHeight - 1").toBeGreaterThanOrEqual(-1);
  expect(gap, "gap entre o último cartão e o dock >= 8 px").toBeGreaterThanOrEqual(8);
  expect(overflow, "sem rolagem horizontal").toBeLessThanOrEqual(0);
});
