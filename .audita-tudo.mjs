import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const hash = process.argv[2];
const base = "https://crm.billhigiene.tech";

const ROTAS = [
  "/", "/agenda", "/ai", "/ai/agents", "/ai/cases", "/ai/controle", "/ai/credentials",
  "/ai/decisoes", "/ai/evolution", "/ai/followups", "/ai/inbox", "/ai/knowledge/sources",
  "/ai/memory", "/ai/proposals", "/ai/providers", "/ai/routers", "/ai/runs", "/ai/skills",
  "/ai/usage", "/audit", "/busca", "/carteira", "/comissoes", "/compras", "/connections",
  "/contacts", "/estoque", "/expedicao", "/faturamento", "/financeiro", "/fiscal",
  "/fiscal/configuracoes", "/fiscal/eventos", "/fiscal/fornecedores", "/fiscal/manifestacoes",
  "/fiscal/notas", "/fiscal/pendentes", "/fiscal/produtos", "/fiscal/relatorios",
  "/fiscal/resumos", "/fiscal/sincronizacoes", "/fiscal/xml", "/inbox", "/indicadores",
  "/integrations/nuvemshop", "/inteligencia", "/kanban", "/laboratorio", "/lgpd/requests",
  "/metrics", "/meu-dia", "/notas", "/pedidos", "/products", "/prospeccao",
  "/prospeccao/nova", "/radar", "/radar/categorias", "/radar/oportunidades",
  "/radar/prospeccao", "/radar/recuperacao", "/radar/risco", "/recuperacao", "/relatorios",
  "/settings", "/settings/api-tokens", "/settings/atendimento", "/settings/atualizacao",
  "/settings/billing", "/settings/canal-oficial", "/settings/marca", "/settings/notifications",
  "/settings/profile", "/settings/security", "/settings/templates", "/settings/tenant",
];

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
const pagina = await ctx.newPage();

await pagina.goto(`${base}/auth/confirm?token_hash=${hash}&type=magiclink&next=%2Fapp`, {
  waitUntil: "domcontentloaded",
});
await pagina.waitForTimeout(3000);

const out = [];
for (const largura of [390, 768]) {
  await pagina.setViewportSize({ width: largura, height: 900 });
  for (const rota of ROTAS) {
    try {
      await pagina.goto(base + "/app" + rota, { waitUntil: "domcontentloaded", timeout: 25000 });
      await pagina.waitForTimeout(900);
      const r = await pagina.evaluate(() => {
        const doc = document.documentElement;
        const excesso = doc.scrollWidth - doc.clientWidth;
        // Scroll INTERNO: tabelas e faixas que rolam para o lado dentro da tela.
        const internos = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const cs = getComputedStyle(el);
            return (cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 12 && el.clientWidth > 0;
          })
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 60),
            diff: el.scrollWidth - el.clientWidth,
            temTabela: !!el.querySelector("table"),
          }))
          .sort((a, b) => b.diff - a.diff)
          .slice(0, 2);
        return { excesso, internos };
      });
      out.push({ largura, rota, ...r });
    } catch (e) {
      out.push({ largura, rota, erro: String(e).slice(0, 60) });
    }
  }
}

writeFileSync("/tmp/responsivo.json", JSON.stringify(out, null, 1));
const ruins = out.filter((x) => (x.excesso ?? 0) > 2 || (x.internos ?? []).length > 0);
console.log("rotas medidas:", out.length, "com overflow:", ruins.length);
for (const x of ruins) {
  console.log(`${x.largura}px ${x.rota} pagina+${x.excesso}px`, (x.internos ?? []).map((c) => `${c.tag}.${c.cls} +${c.diff}${c.temTabela ? " [tabela]" : ""}`).join(" | "));
}
await navegador.close();
