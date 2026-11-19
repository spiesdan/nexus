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

/**
 * O RECORTE. Além das sete telas de operação, o despacho de 18/11/2026 pediu as
 * que estavam fora: **estoque, compras, expedição, faturamento e sentinel**.
 *
 * `--rotas a,b,c` restringe (ou acrescenta rota dinâmica, como
 * `/app/expedicao/<id>/rota`, que não cabe numa lista fixa).
 */
const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) args.set(argv[i], argv[i + 1]?.startsWith("--") ? true : argv[++i]);
  }
}

const PADRAO = [
  "/app",
  "/app/pedidos",
  "/app/contacts",
  "/app/inbox",
  "/app/financeiro",
  "/app/notas",
  "/app/settings",
  // ── fora do recorte anterior (despacho de 18/11) ──
  "/app/estoque",
  "/app/compras",
  "/app/expedicao",
  "/app/faturamento",
  "/app/sentinel",
  "/login",
];

const ROTAS = args.has("--rotas")
  ? String(args.get("--rotas")).split(",").filter(Boolean)
  : PADRAO;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", storageState: ESTADO });
const resultados = [];

for (const rota of ROTAS) {
  const pagina = await contexto.newPage();
  const r = { rota };
  try {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    /*
     * SESSÃO INVÁLIDA NÃO É TELA LIMPA.
     *
     * Se a rota autenticada redireciona para `/login`, o axe mede a tela de
     * login e grava "0 violações" com o nome da rota — o instrumento afirmando
     * o que não mediu (mesma classe da V-10/V-33). Aqui o redirect é erro.
     */
    if (/^\/app|^\/admin/.test(rota) && /\/login/.test(pagina.url())) {
      throw new Error(`sessão inválida: ${rota} redirecionou para /login`);
    }
    await pagina.waitForTimeout(2500);
    const analise = await new AxeBuilder({ page: pagina }).withTags(["wcag2a", "wcag2aa"]).analyze();
    r.violacoes = analise.violations.map((v) => ({
      id: v.id,
      impacto: v.impact,
      ajuda: v.help,
      nos: v.nodes.length,
      exemplo: v.nodes[0]?.target?.join(" "),
    }));
    /*
     * NÚMEROS, NÃO "ok".
     *
     * "0 violações" numa página que não renderizou (vazia, 404, esqueleto) é
     * indistinguível de uma tela limpa. Estes campos provam que havia tela: o
     * `h1`, quantos caracteres de texto e quantos elementos o axe visitou.
     */
    r.contexto = await pagina.evaluate(() => ({
      titulo: document.title,
      h1: [...document.querySelectorAll("h1")].map((el) => (el.textContent ?? "").trim()),
      textoCaracteres: (document.body.innerText ?? "").trim().length,
      elementos: document.querySelectorAll("body *").length,
    }));
    r.regrasAvaliadas = analise.passes.length;
    r.nosAvaliados = analise.passes.reduce((soma, p) => soma + p.nodes.length, 0);
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

/**
 * O ARTEFATO É MESCLADO POR ROTA.
 *
 * Uma execução parcial (só as telas do despacho) apagava as sete anteriores —
 * o defeito V-33, que já foi corrigido no contraste e na captura. Aqui a mesma
 * regra: a rota medida substitui a sua entrada, o resto sobrevive.
 */
let anterior = { resultados: [] };
try {
  const { readFileSync } = await import("node:fs");
  anterior = JSON.parse(readFileSync(arquivo, "utf8"));
} catch {
  /* primeira execução */
}
const porRota = new Map((anterior.resultados ?? []).map((r) => [r.rota, r]));
for (const r of resultados) porRota.set(r.rota, r);
const mesclados = [...porRota.values()].sort((a, b) => String(a.rota).localeCompare(String(b.rota)));

writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      regras: "wcag2a + wcag2aa",
      resultados: mesclados,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(`artefato com ${mesclados.length} telas (mesclado)\n`);
console.log(`\nartefato: ${arquivo}`);
