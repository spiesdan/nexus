/**
 * CAPTURA E MEDIÇÃO — as 9 superfícies de onboarding (matriz 41, §2.2).
 *
 * Mesma régua do passe de público/auth (`tests/lib/medir-pagina.ts`): contraste
 * AA sobre o que está pintado, overflow e axe. Antes/depois na mesma base.
 *
 * A sessão é de uma organização **não onboardada** (`scripts/seed-onboarding-captura.ts`);
 * com a organização de E2E, todo `/onboarding/*` redireciona para `/app/inbox` e
 * a captura provaria a tela errada — por isso o `urlFinal` entra em toda medida.
 *
 * Uso:
 *   BASE=http://127.0.0.1:3311 pnpm exec tsx tests/captura-onboarding.ts antes
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { medir, type Medida } from "./lib/medir-pagina";

const BASE = process.env.BASE ?? "http://127.0.0.1:3311";
const ROTULO = process.argv[2] ?? "antes";
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-onboarding`);
const CREDS = JSON.parse(
  readFileSync(path.join(process.cwd(), ".captura-onboarding.json"), "utf8"),
) as { email: string; password: string };

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

const ROTAS = [
  { slug: "welcome", path: "/onboarding/welcome", espera: /Boas-vindas|negócio|Vamos montar/i },
  { slug: "connect-whatsapp", path: "/onboarding/connect-whatsapp", espera: /WhatsApp|telefone|celular/i },
  { slug: "connect-nuvemshop", path: "/onboarding/connect-nuvemshop", espera: /Nuvemshop|loja/i },
  { slug: "setup-ai", path: "/onboarding/setup-ai", espera: /Treinar|IA|inteligência|chave/i },
  { slug: "funil", path: "/onboarding/funil", espera: /funil|quadro|etapa/i },
  { slug: "testar", path: "/onboarding/testar", espera: /testar|conversa|atender/i },
  { slug: "invite-team", path: "/onboarding/invite-team", espera: /equipe|convidar|time/i },
  { slug: "done", path: "/onboarding/done", espera: /pronto|conclu|tudo|começar/i },
] as const;

async function entrar(page: Page): Promise<void> {
  /*
   * O LOGIN É UMA CORRIDA COM A HIDRATAÇÃO (mesmo achado do
   * `captura-inbox-lista`): em `next dev`, a primeira visita compila a server
   * action; com o HTML já na tela e o React ainda não pendurado, o clique cai
   * num submit NATIVO e a página fica em /login sem erro. Repetir o clique
   * resolve as duas causas; falhar quatro vezes é defeito de verdade.
   */
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator("#email").fill(CREDS.email, { timeout: 60_000 });
    await page.locator("#password").fill(CREDS.password);
    await page.getByRole("button", { name: /entrar/i }).first().click();
    try {
      await page.waitForURL(/\/onboarding/, { timeout: 45_000 });
      return;
    } catch {
      const corpo = (await page.locator("body").innerText()).slice(0, 300).replace(/\s+/g, " ");
      console.info(`   login tentativa ${tentativa}: ${page.url()} · ${corpo}`);
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error("login de onboarding não concluiu após 4 tentativas");
}

async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();
  const medidas: Medida[] = [];

  for (const tema of ["light", "dark"] as const) {
    for (const tamanho of TAMANHOS) {
      const contexto = await browser.newContext({
        viewport: { width: tamanho.width, height: tamanho.height },
        deviceScaleFactor: 1,
        locale: "pt-BR",
      });
      await contexto.addInitScript((t) => {
        window.localStorage.setItem("nexus-theme", t);
      }, tema);
      const page = await contexto.newPage();
      const erros: string[] = [];
      const ruido = (texto: string) =>
        /_next\/hmr|WebSocket connection|Download the React DevTools|Fast Refresh/i.test(texto);
      page.on("console", (m) => {
        if (m.type() === "error" && !ruido(m.text())) erros.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) => {
        if (!ruido(String(e))) erros.push(String(e).slice(0, 200));
      });

      await entrar(page);

      for (const rota of ROTAS) {
        const antes = erros.length;
        const m = await (async (): Promise<Medida> => {
          try {
            await page.goto(`${BASE}${rota.path}`, {
              waitUntil: "domcontentloaded",
              timeout: 120_000,
            });
            try {
              await page.getByText(rota.espera).first().waitFor({ timeout: 20_000 });
            } catch {
              // redirect: o `urlFinal` denuncia
            }
            await page.waitForTimeout(600);
            await page.screenshot({
              path: path.join(RAIZ, `${rota.slug}_${tema}_${tamanho.nome}.png`),
            });
            return await medir(page, rota.slug, tema);
          } catch (e) {
            return {
              rota: rota.slug,
              urlFinal: page.url().replace(BASE, ""),
              tema,
              largura: tamanho.width,
              overflow: 0,
              console: [`navegação: ${String(e).slice(0, 160)}`],
              contraste: { total: 0, abaixo: 0, piores: [] },
              axe: { critica: 0, seria: 0, ids: [], nos: [] },
            };
          }
        })();
        m.console = [...m.console, ...erros.slice(antes)];
        medidas.push(m);

        console.info(
          [
            `${rota.slug.padEnd(18)} ${tema}/${tamanho.nome}`,
            `overflow=${m.overflow}`,
            `contraste=${m.contraste.abaixo}/${m.contraste.total}`,
            `axe=${m.axe.critica}/${m.axe.seria}`,
            `console=${m.console.length}`,
            `url=${m.urlFinal}`,
          ].join("  "),
        );
        for (const p of m.contraste.piores.slice(0, 3)) {
          console.info(
            `   contraste ${p.razao}:1 (piso ${p.piso}) ${p.seletor} "${p.texto}" ${p.cor} sobre ${p.fundo}`,
          );
        }
        for (const id of m.axe.ids.slice(0, 3)) console.info(`   axe ${id}`);
        for (const e of m.console.slice(0, 2)) console.info(`   console ${e}`);
      }
      await contexto.close();
    }
  }

  writeFileSync(
    path.join(RAIZ, "medidas.json"),
    JSON.stringify({ base: BASE, rotulo: ROTULO, medidas }, null, 2),
  );
  await browser.close();

  const ruins = medidas.filter(
    (m) => m.overflow > 0 || m.contraste.abaixo > 0 || m.axe.critica > 0 || m.console.length > 0,
  ).length;
  console.info(`\n${medidas.length} medições · ${ruins} com achado · capturas em ${RAIZ}`);
  process.exit(ruins > 0 ? 1 : 0);
}

void main();
