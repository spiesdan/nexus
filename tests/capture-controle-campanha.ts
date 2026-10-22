/**
 * Prova visual do assistente de campanha e da tela de controle.
 *
 * Navega como usuário real (login pela tela, cliques), do mesmo jeito que os
 * capturadores de wave: os PNGs vão para `evidence/controle-campanha/`.
 *
 * O que ele prova, e por que cada tela:
 *
 *   1. a lista é a aba inicial e mostra o ENVIO ("4 de 8 enviadas"), não só
 *      o funil;
 *   2. o assistente lista as cidades que existem na base, com a contagem, e
 *      a prévia mostra as empresas de verdade ANTES de criar — a seleção que
 *      resulta em zero é barrada de propósito (a tela diz por quê);
 *   3. a revisão confirma o público da prévia;
 *   4. o controle responde as três perguntas do dono: quem já foi, quem falta
 *      e quem ficou sem comprovante — com a ação de liberar reservas.
 *
 * Pré-requisitos: app rodando (E2E_PORT, padrão 3020), Supabase local semeado
 * (`.e2e-creds.json` + `business_prospects`) e uma campanha de descoberta com
 * envios — o id dela vem em `CAMPANHA_ID`.
 *
 * Run:
 *   CAMPANHA_ID=<uuid> E2E_PORT=3020 pnpm exec tsx tests/capture-controle-campanha.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { chromium } from "@playwright/test";

import { BASE, login } from "./qa-helpers";

const OUT = path.join("evidence", "controle-campanha");
const CAMPANHA = process.env.CAMPANHA_ID;

async function main(): Promise<void> {
  if (!CAMPANHA) {
    // Sem id não há o que provar: a tela de controle é por campanha, e um id
    // inventado produziria um 404 que parece defeito da tela.
    throw new Error("CAMPANHA_ID é obrigatório (uma campanha com envios no banco local).");
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(String(e)));

  await login(page, "manager");

  // ── 1. A lista, que agora é a aba inicial ────────────────────────────────
  await page.goto(`${BASE}/app/prospeccao?aba=campanhas`, { waitUntil: "domcontentloaded" });
  const nova = page.getByRole("button", { name: /Nova campanha/i }).first();
  await nova.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: path.join(OUT, "01-lista-de-campanhas.png"), fullPage: true });
  console.info("[ok] 01 lista");

  // ── 2. O assistente: cidade real + prévia da base ────────────────────────
  await nova.click();
  await page.locator("#wiz-nome").fill("Prova visual — prévia real");
  // Mafra: as empresas dela estão LIVRES no seed. Uma cidade cujas empresas já
  // estão reservadas responde 0 na prévia e barra o "Continuar" — correto, mas
  // não é o que esta captura precisa mostrar.
  await page.getByRole("button", { name: /Mafra/i }).first().click();
  await page.getByRole("button", { name: /oficina mec/i }).first().click();

  const previa = page.waitForResponse((r) => r.url().includes("/campaigns/preview"), {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /Ver empresas/i }).click();
  const resposta = await previa;
  console.info("[info] preview status", resposta.status());
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: path.join(OUT, "02-assistente-previa.png"), fullPage: true });
  console.info("[ok] 02 assistente");

  // ── 3. Mensagens e revisão ───────────────────────────────────────────────
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  await page.locator("#wiz-msg-0").fill("Olá {{primeiro_nome}}! Aqui é da oficina — tudo bem?");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "03-assistente-mensagens.png"), fullPage: true });
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: path.join(OUT, "04-assistente-revisao.png"), fullPage: true });
  console.info("[ok] 03/04 mensagens e revisão");

  // ── 4. O controle da campanha que já enviou ──────────────────────────────
  await page.goto(`${BASE}/app/prospeccao/campanhas/${CAMPANHA}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByText(/Controle de envio/i).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: path.join(OUT, "05-controle-da-campanha.png"), fullPage: true });
  console.info("[ok] 05 controle");

  if (erros.length > 0) {
    throw new Error(
      `a tela registrou ${erros.length} erro(s) de console:\n${erros
        .slice(0, 10)
        .map((e) => `  - ${e.slice(0, 300)}`)
        .join("\n")}`,
    );
  }
  console.info("[console] nenhum erro");

  await browser.close();
}

void main().catch((e) => {
  console.error("[falhou]", e);
  process.exit(1);
});
