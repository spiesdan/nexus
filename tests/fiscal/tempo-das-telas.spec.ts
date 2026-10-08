import { expect, test } from "@playwright/test";

/**
 * TEMPORO DE TODAS AS TELAS, na organização real.
 *
 * O relato era "demora para carregar"; até aqui a medição era do painel. Este
 * arquivo varre a navegação inteira e mede o MESMO em cada rota, porque o que
 * custava 10 s no `/app` pode estar custando em outra tela com o mesmo defeito,
 * e porque só comparar com o `/app` esconde a ordem de grandeza do resto.
 *
 * A métrica é o tempo até o CONTEÚDO — um número da tela aparecer — e não o
 * `load`, que dispara antes de a pessoa ver qualquer coisa. É a mesma espera
 * que o usuário descreve ao dizer que "demora para aparecer os dados".
 *
 * Medir sem corrigir não gera conserto; o que existe aqui é a linha de base.
 */
const TOKEN = process.env.SONDA_ACCESS_TOKEN ?? "";

const ROTAS = [
  "/app",
  "/app/inbox",
  "/app/pedidos",
  "/app/contacts",
  "/app/products",
  "/app/estoque",
  "/app/agenda",
  "/app/financeiro",
  "/app/indicadores",
  "/app/radar",
  "/app/prospeccao",
  "/app/expedicao",
  "/app/compras",
  "/app/ai",
  "/app/kanban",
  "/app/busca",
] as const;

test.setTimeout(1_800_000);

test("tempo de cada tela", async ({ page }) => {
  test.skip(!TOKEN, "defina SONDA_ACCESS_TOKEN");

  await page.context().addCookies([
    {
      name: "sb-deskcomm-auth",
      value: `base64-${Buffer.from(
        JSON.stringify({
          access_token: TOKEN,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: process.env.SONDA_REFRESH_TOKEN ?? "",
          user: {},
        }),
      ).toString("base64")}`,
      domain: "crm.billhigiene.tech",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    },
  ]);

  // Aquece sessão e chunks: a medição que interessa é TROCAR de tela, não a
  // primeira pintura depois do login — que mede o login.
  await page.goto("https://crm.billhigiene.tech/app/inbox", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  const linhas: { rota: string; ms: number }[] = [];

  for (const rota of ROTAS) {
    const t0 = Date.now();
    await page.goto(`https://crm.billhigiene.tech${rota}`, { waitUntil: "domcontentloaded" });
    const dom = Date.now() - t0;

    // O critério é texto SUFICIENTE e a ausência de estado de carregamento —
    // não a existência de `h1`. Metade das telas não tem `h1` (o inbox abre
    // direto na lista), e exigir um elemento que nem existe faria este teste
    // reprovar por um motivo que não é lentidão.
    const conteudo = await page
      .waitForFunction(
        (min) => {
          const t = document.body.innerText;
          if (/carregando|loading/i.test(t.slice(0, 150))) return false;
          return t.length >= min;
        },
        rota === "/app" ? 400 : 250,
        { timeout: 60_000 },
      )
      .then(() => Date.now() - t0)
      .catch(() => -1);

    const titulo = await page
      .locator("h1")
      .first()
      .innerText()
      .catch(() => "(sem h1 — abre na lista)");
    linhas.push({ rota, ms: conteudo });
    console.log(
      `  ${String(conteudo).padStart(7)} ms  (dom ${String(dom).padStart(5)} ms)  ${rota.padEnd(18)} ${titulo.slice(0, 30)}`,
    );
    await page.waitForTimeout(800);
  }

  console.log(">>> PIORES TEMPOS");
  for (const l of [...linhas].sort((a, b) => b.ms - a.ms).slice(0, 6)) {
    console.log(`     ${String(l.ms).padStart(7)} ms  ${l.rota}`);
  }
  const fotos = linhas.filter((l) => l.ms > 0);
  expect(fotos.length, "nenhuma tela mediu").toBeGreaterThan(3);
});
