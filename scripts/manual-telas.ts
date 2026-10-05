/**
 * Captura as telas do manual de uso — o produto COMO ESTÁ, sem passar por git.
 *
 * Loga como o admin do seed (com TOTP e o deslocamento de relógio medido contra
 * o GoTrue, o mesmo caminho dos e2e) e fotografia cada tela principal em 1440x900,
 * gravando também um manifesto que o gerador do PDF lê.
 *
 * Uso: pnpm exec tsx scripts/manual-telas.ts <baseURL> <outDir>
 * Ex.:  pnpm exec tsx scripts/manual-telas.ts http://127.0.0.1:3009 manual/telas
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  agoraNoServidor,
  generateTotp,
  medirDeslocamentoRelogio,
  msUntilNextTotpWindow,
} from "../tests/e2e/utils/totp";

const [, , baseURL = "http://127.0.0.1:3009", outDir = "manual/telas"] = process.argv;

/** As telas do manual, na ordem em que aparecem no índice. */
const TELAS: { rota: string; titulo: string }[] = [
  { rota: "/app", titulo: "Dashboard" },
  { rota: "/app/meu-dia", titulo: "Meu Dia" },
  { rota: "/app/radar", titulo: "Radar" },
  { rota: "/app/inbox", titulo: "Inbox" },
  { rota: "/app/ai/followups", titulo: "Follow-ups" },
  { rota: "/app/pedidos", titulo: "Pedidos" },
  { rota: "/app/contacts", titulo: "Clientes" },
  { rota: "/app/products", titulo: "Produtos" },
  { rota: "/app/kanban", titulo: "Funis" },
  { rota: "/app/prospeccao", titulo: "Prospecção" },
  { rota: "/app/estoque", titulo: "Estoque" },
  { rota: "/app/expedicao", titulo: "Expedição" },
  { rota: "/app/financeiro", titulo: "Contas a Receber" },
  { rota: "/app/titulos", titulo: "Títulos" },
  { rota: "/app/notas", titulo: "Notas fiscais" },
  { rota: "/app/ai", titulo: "IA" },
  { rota: "/app/team", titulo: "Equipe" },
  { rota: "/app/settings", titulo: "Configurações" },
  { rota: "/app/settings/tenant", titulo: "Organização" },
];

function slug(i: number, rota: string): string {
  const nome = rota.replace(/^\/app\/?/, "").replace(/\//g, "-") || "dashboard";
  return `${String(i + 1).padStart(2, "0")}-${nome}`;
}

async function main(): Promise<void> {
  if (!existsSync(".e2e-creds.json")) {
    throw new Error("Sem .e2e-creds.json — rode: pnpm exec tsx scripts/seed-e2e-credentials.ts");
  }
  const creds = JSON.parse(readFileSync(".e2e-creds.json", "utf-8"));
  const email: string = creds.users.admin.email;
  const password: string = creds.password;
  const secret: string = creds.admin_totp?.secret;
  if (!secret) throw new Error(".e2e-creds.json sem admin_totp.secret");

  mkdirSync(outDir, { recursive: true });
  await medirDeslocamentoRelogio();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${baseURL}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/login\/mfa/, { timeout: 30_000 });
  // O campo tem auto-submit no onComplete: digitar, não fill().
  const digito = page.locator('input[aria-label="Dígito 1"]');
  await digito.waitFor({ state: "visible", timeout: 15_000 });
  if (msUntilNextTotpWindow(agoraNoServidor()) < 3_000) {
    await page.waitForTimeout(msUntilNextTotpWindow(agoraNoServidor()) + 300);
  }
  await digito.click();
  await page.keyboard.type(generateTotp(secret), { delay: 40 });
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 30_000 });

  const manifesto: { indice: number; rota: string; titulo: string; arquivo: string; url: string }[] = [];

  for (const [i, tela] of TELAS.entries()) {
    const arquivo = `${slug(i, tela.rota)}.png`;
    await page.goto(`${baseURL}${tela.rota}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    // Deixa entrar o que ainda carrega por streaming (Realtime, gráficos).
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: join(outDir, arquivo) });
    manifesto.push({
      indice: i + 1,
      rota: tela.rota,
      titulo: tela.titulo,
      arquivo,
      url: page.url(),
    });
    process.stdout.write(`ok ${i + 1}/20 ${tela.rota}\n`);
  }

  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifesto, null, 2)}\n`, "utf-8");
  await browser.close();
  process.stdout.write(`TELAS_OK ${manifesto.length}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
