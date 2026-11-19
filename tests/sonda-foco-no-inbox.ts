/**
 * FOCO NO CABEÇALHO DA THREAD — o anel existe mesmo?
 *
 * `getComputedStyle` de um botão focado por teclado diz o que o browser pinta;
 * a captura diz se DÁ para ver. Os dois juntos, porque `outline: 2px none` com
 * cor definida passa no primeiro e não existe no segundo.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3313";
const c = JSON.parse(readFileSync(".e2e-creds.json", "utf8"));

async function main(): Promise<void> {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => window.localStorage.setItem("nexus-theme", "light"));
  const p = await ctx.newPage();

  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  for (let i = 0; i < 4; i++) {
    await p.locator("#email").fill(c.users.manager.email);
    await p.locator("#password").fill(c.password);
    await p
      .getByRole("button", { name: /entrar/i })
      .first()
      .click();
    try {
      await p.waitForURL(/\/app\//, { timeout: 40_000 });
      break;
    } catch {
      await p.waitForTimeout(2000);
    }
  }
  await p.goto(`${BASE}/app/inbox`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await p.locator("[data-conversation-id]").first().waitFor({ timeout: 120_000 });
  await p.locator("[data-conversation-id]").first().click();
  await p.waitForTimeout(1500);

  await p.evaluate(() => document.body.focus());
  let achou = false;
  for (let i = 0; i < 80 && !achou; i++) {
    await p.keyboard.press("Tab");
    achou = await p.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el.tagName !== "BUTTON") return false;
      const marca = document.querySelector('[data-testid="comando-da-conversa"]');
      const cab = marca ? marca.closest("div.flex.flex-wrap") : null;
      if (!cab || !cab.contains(el)) return false;
      const s = getComputedStyle(el);
      console.info(
        `FOCO: "${(el.textContent ?? "").trim()}" outline=${s.outlineStyle}/${s.outlineWidth}/${s.outlineColor} shadow=${s.boxShadow}`,
      );
      return true;
    });
  }
  await p.screenshot({ path: "/tmp/d-foco-cabecalho.png" });
  console.info("achou foco:", achou);
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
