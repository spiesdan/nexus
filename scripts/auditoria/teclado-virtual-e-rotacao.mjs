/**
 * TECLADO VIRTUAL E ROTAÇÃO — os dois estados de celular que captura de tela não mostra
 * (item 2.13).
 *
 * ─── POR QUE ───────────────────────────────────────────────────────────────
 *
 * A varredura cobre 320, 360, 390, 430, 834, 1440 e zoom 200%. Faltam dois
 * estados que só existem em aparelho de verdade:
 *
 *   1. **teclado virtual aberto** — o viewport perde ~40 % da altura e o campo
 *      focado pode ficar embaixo do teclado. Emula-se reduzindo a altura e
 *      focando um campo: o que se mede é se ele continua visível;
 *   2. **rotação** — 844 × 390. A largura dobra e a altura cai; cabeçalho
 *      `sticky`, barra de ações e tabelas costumam quebrar aqui, não em retrato.
 *
 * Uso:
 *   node scripts/auditoria/teclado-virtual-e-rotacao.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const ROTAS = ["/app/contacts", "/app/pedidos", "/app/financeiro", "/app/notas", "/app/inbox", "/app/ai"];

const navegador = await chromium.launch();
const resultados = { rotacao: [], teclado: [] };

// ── 1. Rotação ─────────────────────────────────────────────────────────────
{
  const contexto = await navegador.newContext({
    viewport: { width: 844, height: 390 },
    locale: "pt-BR",
    storageState: ESTADO,
  });
  for (const rota of ROTAS) {
    const pagina = await contexto.newPage();
    let medida = { rota, erro: null };
    try {
      await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await pagina.waitForTimeout(3000);
      medida = {
        rota,
        ...(await pagina.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          headerVisivel: (() => {
            const h = document.querySelector("header, h1");
            if (!h) return null;
            const r = h.getBoundingClientRect();
            return r.height > 0 && r.top < window.innerHeight;
          })(),
          alturaPagina: document.documentElement.scrollHeight,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        }))),
      };
    } catch (e) {
      medida.erro = String(e).slice(0, 120);
    }
    resultados.rotacao.push(medida);
    console.log(`rotação ${rota.padEnd(16)} overflow=${medida.overflow ?? "?"} header=${medida.headerVisivel ?? "?"} altura=${medida.alturaPagina ?? "?"}`);
    await pagina.close();
  }
  await contexto.close();
}

// ── 2. Teclado virtual ─────────────────────────────────────────────────────
{
  // 844 de altura menos ~336 do teclado (padrão do iOS em aparelho de 6,1").
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 508 },
    locale: "pt-BR",
    storageState: ESTADO,
  });
  for (const rota of ROTAS) {
    const pagina = await contexto.newPage();
    let medida = { rota, erro: null };
    try {
      await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await pagina.waitForTimeout(3000);
      const campo = pagina
        .locator("main input[type='text'], main input[type='search'], main textarea")
        .first();
      if ((await campo.count()) === 0) {
        medida.semCampo = true;
      } else {
        await campo.click({ timeout: 5000 }).catch(() => undefined);
        await pagina.waitForTimeout(600);
        medida = {
          rota,
          ...(await pagina.evaluate(() => {
            const el = document.activeElement;
            if (!el) return { semFoco: true };
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              topo: Math.round(r.top),
              base: Math.round(r.bottom),
              alturaDoCampo: Math.round(r.height),
              viewport: window.innerHeight,
              // O campo está ACIMA do teclado se a base dele couber na altura útil.
              visivelAcimaDoTeclado: r.bottom <= window.innerHeight && r.top >= 0,
            };
          })),
        };
      }
    } catch (e) {
      medida.erro = String(e).slice(0, 120);
    }
    resultados.teclado.push(medida);
    console.log(
      `teclado ${rota.padEnd(16)} ${medida.semCampo ? "sem campo" : `campo=${medida.topo}..${medida.base} viewport=${medida.viewport} visível=${medida.visivelAcimaDoTeclado}`}`,
    );
    await pagina.close();
  }
  await contexto.close();
}

await navegador.close();

const arquivo = "docs/auditoria/capturas/teclado-virtual-e-rotacao.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      metodo:
        "Rotação = viewport 844x390. Teclado virtual = viewport 390x508 (altura menos ~336 px de teclado) com o primeiro campo focado; mede-se se o campo fica acima da dobra útil.",
      ...resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
