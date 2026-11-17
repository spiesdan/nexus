/**
 * A CASCA E A NAVEGAÇÃO — medido no navegador (itens 4.3 e 4.7).
 *
 * ─── O QUE SE MEDE ────────────────────────────────────────────────────────
 *
 * Por tela: a casca está completa (sidebar, topbar, busca, avisos, menu do
 * usuário, troca de tenant) e orienta (trilha nas telas profundas)?
 *
 * E o atalho: a paleta de comando abre com o atalho anunciado, o foco cai no
 * campo de busca, `Escape` fecha — e ela é DESCOBRÍVEL (o botão de busca mostra
 * o atalho)?
 *
 * No celular: a gaveta abre pelo botão "Abrir navegação" e fecha.
 *
 * Uso:
 *   node scripts/auditoria/shell-e-navegacao.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const ROTAS = [
  "/app",
  "/app/pedidos",
  "/app/contacts",
  "/app/financeiro",
  "/app/settings",
  // Três segmentos de verdade: é onde a trilha tem o que mostrar (a
  // `Breadcrumb` devolve `null` com menos de duas migalhas).
  "/app/ai/knowledge/sources",
  "/app/settings/tenant/agenda",
];

const navegador = await chromium.launch();
const resultados = { telas: [], paleta: null, celular: null };

// ── 1. Casca por tela (1440) ───────────────────────────────────────────────
{
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", storageState: ESTADO });
  for (const rota of ROTAS) {
    const pagina = await contexto.newPage();
    try {
      await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await pagina.waitForTimeout(2500);
      resultados.telas.push({
        rota,
        ...(await pagina.evaluate(() => {
          const visivel = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          const texto = document.body.innerText;
          return {
            sidebar: !!document.querySelector("aside, nav[aria-label*='Navegação']"),
            topbar: visivel("header"),
            busca: !!document.querySelector('[aria-label*="Buscar em todo o sistema"]'),
            avisos: !!document.querySelector('[aria-label*="avisos"], [aria-label*="Central"]'),
            menuDoUsuario: !!document.querySelector('[aria-label*="Menu do usuário"]'),
            trilha: !!document.querySelector('[aria-label*="Trilha"]'),
            atalhoVisivel: /⌘K|Ctrl\+K/i.test(texto),
            tenant: /E2E|Nexus/i.test(texto),
          };
        })),
      });
    } catch (e) {
      resultados.telas.push({ rota, erro: String(e).slice(0, 120) });
    }
    await pagina.close();
  }

  // ── 2. Paleta de comando ─────────────────────────────────────────────────
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  const paleta = { atalhoTestado: "Meta+K" };
  try {
    await pagina.keyboard.press("Meta+KeyK");
    await pagina.waitForTimeout(900);
    paleta.abriu = await pagina.getByRole("dialog").first().isVisible().catch(() => false);
    const focado = await pagina.evaluate(() => {
      const el = document.activeElement;
      return { tag: el?.tagName ?? null, placeholder: el?.getAttribute?.("placeholder") ?? null };
    });
    paleta.focoNoCampo = focado.tag === "INPUT" || !!focado.placeholder;
    paleta.foco = focado;
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(600);
    paleta.fechouComEscape = !(await pagina.getByRole("dialog").first().isVisible().catch(() => false));
  } catch (e) {
    paleta.erro = String(e).slice(0, 140);
  }
  resultados.paleta = paleta;
  await pagina.close();
  await contexto.close();
}

// ── 3. Gaveta no celular ───────────────────────────────────────────────────
{
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR", storageState: ESTADO });
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  const celular = {};
  try {
    const abrir = pagina.getByRole("button", { name: /abrir navegação/i }).first();
    celular.temBotao = (await abrir.count()) > 0;
    if (celular.temBotao) {
      await abrir.click();
      await pagina.waitForTimeout(800);
      celular.gavetaAbriu = await pagina.getByRole("dialog").first().isVisible().catch(() => false);
      await pagina.keyboard.press("Escape");
      await pagina.waitForTimeout(500);
      celular.gavetaFechou = !(await pagina.getByRole("dialog").first().isVisible().catch(() => false));
    }
  } catch (e) {
    celular.erro = String(e).slice(0, 140);
  }
  resultados.celular = celular;
  await pagina.close();
  await contexto.close();
}

await navegador.close();

const arquivo = "docs/auditoria/capturas/shell-e-navegacao.json";
writeFileSync(arquivo, JSON.stringify({ base: BASE, medido_em: new Date().toISOString(), ...resultados }, null, 2) + "\n");

for (const t of resultados.telas) {
  console.log(
    `${t.rota.padEnd(26)} sidebar=${t.sidebar} topbar=${t.topbar} busca=${t.busca} avisos=${t.avisos} usuário=${t.menuDoUsuario} trilha=${t.trilha} atalho=${t.atalhoVisivel}` +
      (t.erro ? ` ERRO ${t.erro}` : ""),
  );
}
console.log("paleta:", JSON.stringify(resultados.paleta));
console.log("celular:", JSON.stringify(resultados.celular));
console.log(`\nartefato: ${arquivo}`);
