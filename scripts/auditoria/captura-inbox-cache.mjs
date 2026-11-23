/** Captura o Inbox com o canal realtime bloqueado (estado de cache). */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3027";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/state-inbox.json";
const SAIDA = process.env.AUDIT_SAIDA ?? "docs/auditoria/capturas/inbox-cache";
const ROTA = "/app/inbox?id=97cce84e-ca55-4f41-bf65-68dc1f92f4df";
mkdirSync(SAIDA, { recursive: true });
const b = await chromium.launch();
for (const tema of ["light", "dark"])
  for (const largura of [1440, 390]) {
    const ctx = await b.newContext({
      storageState: ESTADO,
      viewport: { width: largura, height: largura >= 1000 ? 900 : 844 },
      locale: "pt-BR",
    });
    await ctx.addInitScript((t) => localStorage.setItem("nexus-theme", t), tema);
    await ctx.routeWebSocket(/realtime/, (ws) => ws.close());
    const p = await ctx.newPage();
    await p.goto(`${BASE}${ROTA}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await p
      .waitForFunction(
        () =>
          document.querySelector('[class*="animate-pulse"]') === null &&
          document.body.innerText.includes("Selecione uma conversa") === false,
        undefined,
        { timeout: 60000 },
      )
      .catch(() => {});
    await p.waitForTimeout(3000);
    const selo = await p.locator('[data-testid="inbox-selo-cache"]').count();
    const painel = await p.locator('[data-testid="painel-handoff"]').count();
    const nome = `inbox_cache_${tema}_${largura}.png`;
    await p.screenshot({ path: path.join(SAIDA, nome) });
    console.log(`${tema} ${largura} · selo=${selo} painel=${painel} · ${nome}`);
    await ctx.close();
  }
await b.close();
