/**
 * CAPTURA E MEDIÇÃO DA ROTA — ESTADOS DE PUBLICAÇÃO (fatia 3/3).
 *
 * Duas cargas, dois estados:
 *   - `montando`  → o botão "Publicar rota" existe e é a ação primária;
 *   - `em_rota`   → não existe publicar; existe o atalho do modo entregador.
 *
 * Mede o que a tarefa pede: presença/ausência das ações, overflow, console e
 * axe (crítico/sério), em claro/escuro × 1440/390.
 *
 * Uso: BASE=http://localhost:3313 npx tsx tests/captura-rota-publicar.ts depois
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3313";
const ROTULO = process.argv[2] ?? "antes";
const CREDS = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8"));
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-rota-publicar`);

const CARGAS = [
  {
    nome: "montando",
    id: process.env.CARGA_MONTANDO ?? "348a67c8-c554-4124-9682-29ff72b1b93f",
  },
  { nome: "em-rota", id: process.env.CARGA_EM_ROTA ?? "ad90f4b3-b0db-4657-9485-2b7638f30401" },
];

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector("#email", { timeout: 240_000 });
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    await page.locator("#email").fill(CREDS.users.manager.email, { timeout: 120_000 });
    await page.locator("#password").fill(CREDS.password, { timeout: 120_000 });
    // O botão do FORMULÁRIO: a página pública nova tem CTA com o mesmo texto.
    const enviar = page.locator('form button[type="submit"]').first();
    await enviar.waitFor({ state: "visible", timeout: 240_000 });
    await page
      .waitForFunction(
        () => {
          const b = document.querySelector(
            'form button[type="submit"]',
          ) as HTMLButtonElement | null;
          return !!b && !b.disabled;
        },
        null,
        { timeout: 240_000 },
      )
      .catch(() => {});
    await enviar.click({ timeout: 120_000 });
    try {
      await page.waitForURL(/\/app\//, { timeout: 90_000 });
      return;
    } catch {
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error("login não concluiu após 4 tentativas");
}

const medidas: unknown[] = [];

async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();
  const aquecimento = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await entrar(await aquecimento.newPage());
  await aquecimento.close();
  console.info("aquecimento: login compilado");

  for (const tema of ["light", "dark"] as const) {
    for (const tamanho of TAMANHOS) {
      const contexto = await browser.newContext({
        viewport: { width: tamanho.width, height: tamanho.height },
        deviceScaleFactor: 1,
        locale: "pt-BR",
      });
      await contexto.addInitScript((t) => window.localStorage.setItem("nexus-theme", t), tema);
      const page = await contexto.newPage();
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") erros.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
      await entrar(page);

      for (const carga of CARGAS) {
        erros.length = 0;
        await page.goto(`${BASE}/app/expedicao/${carga.id}/rota`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        let anterior = "";
        for (let i = 0; i < 25 && page.url() !== anterior; i++) {
          anterior = page.url();
          await page.waitForTimeout(700);
        }
        await page.waitForTimeout(1_200);

        const estado = await page.evaluate(() => {
          const publicar = document.querySelector('[data-testid="publicar-rota"]');
          const texto = document.body.innerText;
          return {
            overflow: Math.max(
              0,
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
            ),
            temPublicar: Boolean(publicar),
            publicarHabilitado: publicar instanceof HTMLButtonElement ? !publicar.disabled : null,
            temModoEntregador: /modo entregador/i.test(texto),
          };
        });

        await page.screenshot({
          path: path.join(RAIZ, `${carga.nome}_${tema}_${tamanho.nome}.png`),
        });

        const axe = await new AxeBuilder({ page }).analyze();
        const graves = axe.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        );
        const medida = {
          carga: carga.nome,
          tema,
          largura: tamanho.width,
          ...estado,
          consoleErros: erros.slice(0, 5),
          axe: {
            critica: axe.violations.filter((v) => v.impact === "critical").length,
            seria: graves.length,
            nos: graves.flatMap((v) =>
              v.nodes.slice(0, 2).map((n) => `${v.id}: ${n.target.join(" ")}`),
            ),
          },
        };
        medidas.push(medida);
        console.info(
          `${tema}/${tamanho.nome} ${carga.nome.padEnd(8)} overflow=${estado.overflow} ` +
            `publicar=${estado.temPublicar} habilitado=${estado.publicarHabilitado} ` +
            `modoEntregador=${estado.temModoEntregador} ` +
            `axe=${medida.axe.critica}/${medida.axe.seria} console=${erros.length}`,
        );
        for (const no of medida.axe.nos) console.info(`    → ${no}`);
        for (const e of erros.slice(0, 2)) console.info(`    console → ${e}`);
      }
      await contexto.close();
    }
  }

  writeFileSync(path.join(RAIZ, "medidas.json"), JSON.stringify(medidas, null, 2));
  await browser.close();
  console.info(`\ncapturas e medidas em ${RAIZ}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
