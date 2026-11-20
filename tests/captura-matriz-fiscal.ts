/**
 * CAPTURA E MEDIÇÃO — as telas fiscais (matriz 41 §2) e o Financeiro.
 *
 * Mesma régua dos outros passes (`tests/lib/medir-pagina.ts`): contraste AA sobre
 * o que está pintado, overflow e axe — mais as duas provas da matriz: **h1 com
 * timeout** (a tela certa renderizou) e **destino do redirect**.
 *
 * Diferente do público/auth, aqui há sessão: o script entra com o admin do E2E
 * (`loginComoAdmin`, que resolve MFA/TOTP) e só então visita as rotas.
 *
 * Uso:
 *   BASE=http://localhost:3311 pnpm exec tsx tests/captura-matriz-fiscal.ts antes
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { lerCreds, loginComoAdmin } from "./e2e/helpers/login-admin";
import { ROTAS_FISCAIS } from "./lib/rotas-fiscais";
import { medir, type Medida } from "./lib/medir-pagina";

const BASE = process.env.BASE ?? "http://localhost:3311";
const ROTULO = process.argv[2] ?? "antes";
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-matriz-fiscal`);

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

const creds = lerCreds();

async function entrar(page: Page): Promise<void> {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      await loginComoAdmin(page, creds);
      return;
    } catch {
      // A primeira visita compila a action; a segunda acha módulo quente.
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error("login do fiscal não concluiu após 3 tentativas");
}

async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  const so = (process.env.SO_ROTAS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const rotas = so.length > 0 ? ROTAS_FISCAIS.filter((r) => so.includes(r.slug)) : ROTAS_FISCAIS;

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

      for (const rota of rotas) {
        const antes = erros.length;
        let h1: string | null = null;
        const m = await (async (): Promise<Medida> => {
          try {
            await page.goto(`${BASE}${rota.path}`, {
              waitUntil: "domcontentloaded",
              timeout: 120_000,
            });
            try {
              const titulo = page.getByRole("heading", { level: 1 }).first();
              await titulo.waitFor({ timeout: 25_000 });
              h1 = (await titulo.textContent())?.trim() ?? null;
            } catch {
              h1 = null;
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

        m.h1 = h1;
        const url = m.urlFinal;
        const redirecionouCerto =
          "destino" in rota && rota.destino ? url.startsWith(rota.destino) : url.startsWith(rota.path);
        const h1Certo = h1 !== null && rota.h1.test(h1);
        m.medidaOk = h1Certo && redirecionouCerto;
        m.motivoNaoMedido = m.medidaOk
          ? null
          : !h1Certo
            ? `h1 inesperado: ${h1 === null ? "(ausente no timeout)" : JSON.stringify(h1)}`
            : `destino inesperado: ${url}`;
        m.console = [...m.console, ...erros.slice(antes)];
        medidas.push(m);

        console.info(
          [
            `${rota.slug.padEnd(22)} ${tema}/${tamanho.nome}`,
            `overflow=${m.overflow}`,
            `contraste=${m.contraste.abaixo}/${m.contraste.total}`,
            `axe=${m.axe.critica}/${m.axe.seria}`,
            `console=${m.console.length}`,
            `h1=${m.h1 ?? "—"}`,
            `medida=${m.medidaOk ? "ok" : "NAO"}${m.motivoNaoMedido ? ` (${m.motivoNaoMedido})` : ""}`,
            `url=${m.urlFinal}`,
          ].join("  "),
        );
        for (const p of m.contraste.piores.slice(0, 3)) {
          console.info(`   contraste ${p.razao}:1 (piso ${p.piso}) ${p.seletor} "${p.texto}"`);
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

  const naoMedidas = medidas.filter((m) => m.medidaOk !== true).length;
  const ruins = medidas.filter(
    (m) => m.overflow > 0 || m.contraste.abaixo > 0 || m.axe.critica > 0 || m.console.length > 0,
  ).length;
  console.info(
    `\n${medidas.length} medições · ${naoMedidas} não medidas · ${ruins} com achado · capturas em ${RAIZ}`,
  );
  process.exit(ruins > 0 || naoMedidas > 0 ? 1 : 0);
}

void main();
