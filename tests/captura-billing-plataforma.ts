/**
 * CAPTURA DE EVIDÊNCIA — `/admin/billing` (1440 e 390).
 *
 * Uso, com o app JÁ de pé e apontando para o Supabase LOCAL:
 *   BASE=http://localhost:3311 npx tsx tests/captura-billing-plataforma.ts estados
 *   BASE=http://localhost:3312 npx tsx tests/captura-billing-plataforma.ts sem-stripe
 *
 * `estados` pressupõe as quatro organizações `demo-cobranca-*` no banco (ativa,
 * em atraso, sem assinatura e não verificada). `sem-stripe` pressupõe um
 * servidor iniciado SEM `STRIPE_SECRET_KEY` — é o estado da instalação que não
 * cobra, e a tela precisa abrir e explicar.
 *
 * Só loopback: o instrumento loga como o `dono` (platform_admin) e uma captura
 * de admin nunca aponta para a VPS.
 */
import { mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

import { chromium, type Page } from "@playwright/test";

import { loginComoDono, type CredsE2E } from "./e2e/helpers/login-admin";

const BASE = process.env.BASE ?? "http://localhost:3311";
const ROTULO = (process.argv[2] ?? "estados").trim();
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas");

const CREDS = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as CredsE2E;

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

async function capturar(page: Page, nome: string, largura: number, altura: number): Promise<void> {
  await page.setViewportSize({ width: largura, height: altura });
  await page.goto(`${BASE}/admin/billing`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const titulo = await page.locator("h1").first().innerText();
  if (!/cobran/i.test(titulo)) {
    throw new Error(`/admin/billing não pintou o título esperado (h1="${titulo}")`);
  }
  await page.waitForSelector("[data-soma-cobranca]", { state: "visible" });
  const overflow = await page.evaluate(() => {
    const raiz = document.documentElement;
    return Math.max(0, raiz.scrollWidth - raiz.clientWidth);
  });
  await page.screenshot({
    path: path.join(RAIZ, `billing-plataforma-${ROTULO}-${nome}.png`),
    fullPage: true,
  });
  console.info(`[captura] ${nome}px · overflow=${overflow}px · ${path.basename(`${ROTULO}-${nome}`)}`);
}

async function main(): Promise<void> {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(BASE)) {
    throw new Error(`BASE não é loopback: ${BASE}`);
  }
  mkdirSync(RAIZ, { recursive: true });

  const browser = await chromium.launch();
  const contexto = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  await contexto.addInitScript(() => window.localStorage.setItem("nexus-theme", "light"));
  const page = await contexto.newPage();
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));

  await loginComoDono(page, CREDS);
  for (const tamanho of TAMANHOS) {
    await capturar(page, tamanho.nome, tamanho.width, tamanho.height);
  }

  await browser.close();
  if (erros.length > 0) throw new Error(`console/pageerror: ${erros.join(" | ")}`);
  console.info(`[captura] ${ROTULO}: 2 telas salvas em ${RAIZ}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
