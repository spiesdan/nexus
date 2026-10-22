/**
 * Prova visual da nova estrutura da Prospecção e das mensagens por categoria.
 *
 * Navega como usuário real (login pela tela, cliques) e grava os PNGs em
 * `evidence/prospeccao-nova/`. O que cada tela prova:
 *
 *   1. a tela abre em DUAS superfícies (Campanhas e Empresas); as ferramentas
 *      (Encontrar empresas, Pesquisas, Mercado, Configuração) ficam ao lado,
 *      sem competir com o trabalho do dia;
 *   2. Configuração mostra "Mensagens por categoria" e, quando não há padrão,
 *      DIZ isso em vez de esconder a seção;
 *   3. salvar três mensagens para "Oficina mecânica" grava o padrão e a tela
 *      passa a listar a categoria como configurada;
 *   4. o assistente de campanha nasce PREENCHIDO com o padrão da categoria
 *      escolhida, e diz de onde veio o texto — sem reescrever a cada campanha.
 *
 * Pré-requisitos: app rodando (E2E_PORT, padrão 3020), Supabase local semeado
 * (`.e2e-creds.json` + `business_prospects`) e a migração 0283 aplicada.
 *
 * Run:
 *   E2E_PORT=3020 pnpm exec tsx tests/capture-prospeccao-nova.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { chromium } from "@playwright/test";

import { BASE, login } from "./qa-helpers";

const OUT = path.join("evidence", "prospeccao-nova");
const CATEGORIA = "Oficina mecânica";
const MENSAGENS = [
  "Olá {{primeiro_nome}}! Aqui é da oficina — fazemos revisão e diagnóstico com orçamento na hora. Quer que eu passe aí essa semana?",
  "Oi {{primeiro_nome}}, tudo bem? Somos da oficina aqui da região. Você já tem alguém para cuidar da revisão do carro?",
  "{{primeiro_nome}}, bom dia! Estamos com agenda aberta para revisão e troca de óleo. Posso te mandar os valores?",
];

async function main(): Promise<void> {
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

  // ── 1. A tela com duas superfícies ──────────────────────────────────────
  await page.goto(`${BASE}/app/prospeccao?aba=campanhas`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Nova campanha/i }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: path.join(OUT, "01-duas-superficies.png"), fullPage: true });
  console.info("[ok] 01 estrutura");

  // ── 2. Configuração › Mensagens por categoria (vazio) ───────────────────
  await page.getByRole("button", { name: /^Configuração$/ }).click();
  await page.locator("#preset-categoria").waitFor({ timeout: 30_000 });
  // Reexecução não pode mentir: se uma rodada anterior deixou o padrão salvo,
  // remove antes de fotografar o estado vazio.
  const jaConfigurada = page.getByRole("button", { name: new RegExp(CATEGORIA, "i") });
  if ((await jaConfigurada.count()) > 0) {
    await jaConfigurada.first().click();
    await page.getByRole("button", { name: /^Remover padrão$/ }).click();
    await page.waitForTimeout(1_500);
  }
  await page.waitForTimeout(1_200);
  await page.screenshot({
    path: path.join(OUT, "02-config-mensagens-vazio.png"),
    fullPage: true,
  });
  console.info("[ok] 02 config vazio");

  // ── 3. Salvar o padrão da categoria ────────────────────────────────────
  await page.locator("#preset-categoria").selectOption({ label: CATEGORIA });
  for (const [i, texto] of MENSAGENS.entries()) {
    await page.locator(`#preset-msg-${i}`).fill(texto);
  }
  await page.getByRole("button", { name: /^Salvar mensagens$/ }).click();
  await page.getByText(/Mensagens salvas para esta categoria/i).first().waitFor({
    timeout: 30_000,
  });
  await page.waitForTimeout(1_200);
  await page.screenshot({
    path: path.join(OUT, "03-config-mensagens-salvas.png"),
    fullPage: true,
  });
  console.info("[ok] 03 config salvo");

  // ── 4. O assistente nasce preenchido ───────────────────────────────────
  await page.goto(`${BASE}/app/prospeccao/nova`, { waitUntil: "domcontentloaded" });
  await page.locator("#wiz-nome").waitFor({ timeout: 60_000 });
  // A primeira visita compila a rota; um remonte no meio da digitação zeraria o
  // campo. Espera estabilizar e confere o valor antes de seguir.
  await page.waitForTimeout(2_000);
  await page.locator("#wiz-nome").fill("Prova visual — padrão por categoria");
  await page.waitForTimeout(500);
  if ((await page.locator("#wiz-nome").inputValue()).trim() === "") {
    await page.locator("#wiz-nome").fill("Prova visual — padrão por categoria");
  }
  await page.getByRole("button", { name: /Mafra/i }).first().click();
  await page.getByRole("button", { name: /^Oficina mecânica$/ }).first().click();

  const previa = page.waitForResponse((r) => r.url().includes("/campaigns/preview"), {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: /Ver empresas/i }).click();
  const resposta = await previa;
  const corpoPrevia = await resposta.json().catch(() => null);
  console.info(
    "[info] preview status",
    resposta.status(),
    "total",
    corpoPrevia?.data?.total ?? "?",
  );

  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: /^Continuar$/ }).click();
  try {
    await page.locator("#wiz-msg-0").waitFor({ timeout: 15_000 });
  } catch {
    await page.screenshot({
      path: path.join(OUT, "diagnostico-passo-2.png"),
      fullPage: true,
    });
    const texto = (await page.locator("body").innerText()).slice(0, 1_200);
    throw new Error(`o passo 2 não abriu. Texto da tela:\n${texto}`);
  }
  const valor = await page.locator("#wiz-msg-0").inputValue();
  const primeira = MENSAGENS[0] ?? "";
  if (valor.trim() !== primeira) {
    throw new Error(
      `o assistente não herdou o padrão da categoria. Esperado: ${primeira.slice(0, 40)}… Recebido: ${valor.slice(0, 40)}…`,
    );
  }
  await page.waitForTimeout(1_200);
  await page.screenshot({
    path: path.join(OUT, "04-assistente-com-padrao.png"),
    fullPage: true,
  });
  console.info("[ok] 04 assistente com padrão");

  // ── 5. Empresas, a outra superfície ────────────────────────────────────
  await page.goto(`${BASE}/app/prospeccao?aba=empresas`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: path.join(OUT, "05-empresas.png"), fullPage: true });
  console.info("[ok] 05 empresas");

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
