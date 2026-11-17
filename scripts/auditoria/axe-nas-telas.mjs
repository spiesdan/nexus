/**
 * AXE NAS TELAS PRINCIPAIS — o que o leitor de tela encontra antes de qualquer
 * pessoa (item 9.6 e reforço do 2.11).
 *
 * ─── POR QUE AQUI, E NÃO SÓ NO INSTRUMENTO ────────────────────────────────
 *
 * O `AxeBuilder` existe em 2 das 99 specs (`auth`, `rbac-roles`). Nas outras 97,
 * a acessibilidade foi medida por instrumento próprio (contraste, foco,
 * teclado) — bom, mas não é o mesmo conjunto de regras do axe, que cobre nome
 * acessível, papel, ordem de título e atributos ARIA.
 *
 * Este instrumento roda o axe nas telas de operação e lista as violações por
 * impacto, para separar o que é gate possível do que precisa de decisão.
 *
 * Uso:
 *   node scripts/auditoria/axe-nas-telas.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const ROTAS = [
  "/app",
  "/app/pedidos",
  "/app/contacts",
  "/app/inbox",
  "/app/financeiro",
  "/app/notas",
  "/app/settings",
  "/login",
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", storageState: ESTADO });
const resultados = [];

for (const rota of ROTAS) {
  const pagina = await contexto.newPage();
  const r = { rota };
  try {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await pagina.waitForTimeout(2500);
    const analise = await new AxeBuilder({ page: pagina }).withTags(["wcag2a", "wcag2aa"]).analyze();
    r.violacoes = analise.violations.map((v) => ({
      id: v.id,
      impacto: v.impact,
      ajuda: v.help,
      nos: v.nodes.length,
      exemplo: v.nodes[0]?.target?.join(" "),
    }));
    r.total = analise.violations.length;
    r.porImpacto = analise.violations.reduce((acc, v) => {
      const k = v.impact ?? "n/a";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  } catch (e) {
    r.erro = e instanceof Error ? e.message.slice(0, 140) : String(e);
  }
  resultados.push(r);
  console.log(
    `${rota.padEnd(18)} violações=${r.total ?? "?"} ${r.porImpacto ? JSON.stringify(r.porImpacto) : ""}` +
      (r.violacoes?.length ? ` · ${r.violacoes.map((v) => v.id).slice(0, 4).join(", ")}` : "") +
      (r.erro ? ` ERRO ${r.erro}` : ""),
  );
  await pagina.close();
}

await contexto.close();
await navegador.close();

const arquivo = "docs/auditoria/capturas/axe-nas-telas.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      regras: "wcag2a + wcag2aa",
      resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
