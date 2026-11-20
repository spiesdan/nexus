/**
 * CAPTURA E MEDIÇÃO — superfícies de público/auth/estado (matriz 41, §2.2).
 *
 * Não é gate de CI: é o instrumento da prova do passe de design. Mede o que o
 * passe promete (hierarquia, estados, tema) e o que ele NÃO pode quebrar:
 * **contraste AA**, **overflow** e **console** — além do axe (serious/critical)
 * que os passes anteriores já usavam.
 *
 * A régua de contraste é calculada no browser, sobre o que está PINTADO:
 * cor computada do texto × fundo efetivo (subindo os ancestrais e compondo
 * alfa). O piso é WCAG 1.4.3: 4,5:1 para texto normal e 3:1 para texto grande
 * (>= 24px, ou >= 18,66px em negrito). Medir token contra token diria o que o
 * CSS promete; medir o pixel diria o que a tela entrega.
 *
 * Uso:
 *   BASE=http://127.0.0.1:3002 npx tsx tests/captura-publico-auth.ts antes
 *   BASE=http://127.0.0.1:3002 npx tsx tests/captura-publico-auth.ts depois
 */
import { chromium } from "@playwright/test";

import { medir, type Medida } from "./lib/medir-pagina";
import { ROTAS } from "./lib/rotas-publico-auth";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3002";
const ROTULO = process.argv[2] ?? "antes";
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-publico-auth`);

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

/**
 * As 16 superfícies públicas/auth/estado (as 9 de onboarding ficam no
 * instrumento próprio — exigem organização não finalizada).
 *
 * `espera` é o sinal de que a TELA certa renderizou: sem ele, um redirect para
 * /login geraria captura bonita de outra página. `urlFinal` no registro prova.
 */


async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  /*
   * `SO_ROTAS=404,404-rota` limita a captura às superfícies pedidas. Existe
   * porque medir uma superfície nova não justifica 72 cargas no servidor de
   * quem está rodando outra frente — a regra de memória da máquina vale
   * também para o servidor dos outros.
   */
  const so = (process.env.SO_ROTAS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rotas = so.length > 0 ? ROTAS.filter((r) => so.includes(r.slug)) : ROTAS;
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
      for (const rota of rotas) {
        const erros: string[] = [];
        // RUÍDO DE INSTRUMENTO, não da tela: o alvo é um `next dev`, e cada
        // contexto novo abre um HMR que o servidor (ocupado) recusa. Sem este
        // filtro, toda rota "tem erro de console" e o número não mede nada.
        const ruido = (texto: string) =>
          /_next\/hmr|WebSocket connection|Download the React DevTools|Fast Refresh/i.test(texto);
        const aoConsole = (m: { type: () => string; text: () => string }) => {
          if (m.type() !== "error") return;
          const t = m.text().slice(0, 200);
          if (!ruido(t)) erros.push(t);
        };
        const aoErro = (e: Error) => {
          const t = String(e).slice(0, 200);
          if (!ruido(t)) erros.push(t);
        };
        page.on("console", aoConsole);
        page.on("pageerror", aoErro);

        let h1: string | null = null;
        const m = await (async (): Promise<Medida> => {
          try {
            await page.goto(`${BASE}${rota.path}`, {
              waitUntil: "domcontentloaded",
              timeout: 120_000,
            });
            // H1 COM TIMEOUT: é a prova de que a TELA certa renderizou. Texto
            // solto deixava a captura passar com a tela errada (foi o caso de
            // `/login/mfa`, que redireciona para `/login`).
            try {
              const titulo = page.getByRole("heading", { level: 1 }).first();
              await titulo.waitFor({ timeout: 20_000 });
              h1 = (await titulo.textContent())?.trim() ?? null;
            } catch {
              h1 = null;
            }
            await page.waitForTimeout(400);
            await page.screenshot({ path: path.join(RAIZ, `${rota.slug}_${tema}_${tamanho.nome}.png`) });
            return await medir(page, rota.slug, tema);
          } catch (e) {
            // Rota que não carrega é ACHADO, não motivo para derrubar as outras
            // 63 medições.
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
        // A RÉGUA: h1 esperado + destino. Sem os dois, a linha NÃO foi medida.
        m.h1 = h1 ?? null;
        const url = m.urlFinal;
        const redirecionouCerto = "destino" in rota && rota.destino
          ? url.startsWith(rota.destino)
          : url.startsWith(rota.path);
        const h1Certo = h1 !== null && rota.h1.test(h1);
        m.medidaOk = h1Certo && redirecionouCerto;
        m.motivoNaoMedido = m.medidaOk
          ? null
          : !h1Certo
            ? `h1 inesperado: ${h1 === null ? "(ausente no timeout)" : JSON.stringify(h1)}`
            : `destino inesperado: ${url}`;
        m.console = [...m.console, ...erros];
        medidas.push(m);

        const linhas = [
          `${rota.slug.padEnd(16)} ${tema}/${tamanho.nome}`,
          `overflow=${m.overflow}`,
          `contraste=${m.contraste.abaixo}/${m.contraste.total}`,
          `axe=${m.axe.critica}/${m.axe.seria}`,
          `console=${m.console.length}`,
          `h1=${m.h1 ?? "—"}`,
          `medida=${m.medidaOk ? "ok" : "NAO"}${m.motivoNaoMedido ? ` (${m.motivoNaoMedido})` : ""}`,
          `url=${m.urlFinal}`,
        ];
        console.info(linhas.join("  "));
        if (m.overflow > 0 || m.contraste.abaixo > 0 || m.axe.critica > 0 || m.console.length > 0) {
          for (const p of m.contraste.piores.slice(0, 3)) {
            console.info(`   contraste ${p.razao}:1 (piso ${p.piso}) ${p.seletor} "${p.texto}" ${p.cor} sobre ${p.fundo}`);
          }
          for (const id of m.axe.ids.slice(0, 3)) console.info(`   axe ${id}`);
          for (const e of m.console.slice(0, 2)) console.info(`   console ${e}`);
        }

        page.off("console", aoConsole);
        page.off("pageerror", aoErro);
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
  // Sai ≠ 0 quando há achado: o instrumento é a régua, não o relatório.
  process.exit(ruins > 0 ? 1 : 0);
}

void main();
