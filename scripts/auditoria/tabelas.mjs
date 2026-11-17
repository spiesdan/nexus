/**
 * TABELA, DENSIDADE E PAGINAÇÃO — o que "tabela grande" quer dizer neste produto.
 *
 * ─── A PERGUNTA ────────────────────────────────────────────────────────────
 *
 * O prompt pede "tabelas grandes" nos casos extremos e "paginação" na avaliação
 * por tela. Nenhum dos dois aparece numa captura de tela: uma lista com 8 linhas
 * e uma com 800 têm o mesmo PNG quando o servidor devolve as 800.
 *
 * Aqui a medida é o DOM: quantas linhas foram RENDERIZADAS, quantas colunas, e
 * existe controle de paginação/scroll infinito? O número de linhas é o do
 * servidor — este instrumento não cria dado.
 *
 * ─── POR QUE ISSO VIRA ACHADO ──────────────────────────────────────────────
 *
 * Três leituras possíveis, e cada uma tem consequência:
 *
 *   `linhas > 100` sem paginação  → a tela manda tudo de uma vez: pesa no
 *                                    celular e no 3G, e é o defeito que o
 *                                    prompt chama de "tabela grande";
 *   `linhas == 0`                 → estado vazio; importa se ELE explica o que
 *                                    fazer (já medido em V-09);
 *   paginação presente            → o produto tem o controle; mede-se se ele
 *                                    mostra em que página está.
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 *
 * Não ordena, não filtra, não pagina por você — isso é interação e a suíte E2E
 * cobre por tela. Aqui é só o retrato da densidade: quantas linhas, quantas
 * colunas, tem paginação, tem contagem.
 *
 * Uso:
 *   node scripts/auditoria/tabelas.mjs --estado /tmp/sessao.json [--json]
 */
import { existsSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args.set(argv[i], argv[i + 1]?.startsWith("--") ? true : argv[++i]);
  }
}
const estado = args.get("--estado");
if (!estado || !existsSync(estado)) {
  console.error("falta --estado <storageState.json>");
  process.exit(2);
}

/** Telas de lista do produto — as que têm tabela. */
const ROTAS = [
  "/app/pedidos",
  "/app/contacts",
  "/app/products",
  "/app/estoque",
  "/app/compras",
  "/app/compras?aba=fornecedores",
  "/app/financeiro",
  "/app/comissao",
  "/app/notas",
  "/app/fiscal/notas",
  "/app/fiscal/pendentes",
  "/app/team",
  "/app/audit",
  "/app/ai/runs",
  "/app/ai/usage",
  "/app/expedicao",
  "/app/comissoes",
  "/app/frota",
  "/admin/tenants",
  "/admin/users",
  "/admin/audit",
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  storageState: estado,
  viewport: { width: 1440, height: 900 },
  locale: "pt-BR",
});

const resultados = [];
for (const rota of ROTAS) {
  const pagina = await contexto.newPage();
  let registro = { rota };
  try {
    const resp = await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    registro.status = resp?.status() ?? 0;
    // Lista que busca no cliente precisa de tempo; 2 s cobre o que foi medido.
    await pagina.waitForTimeout(2_200);

    registro = {
      ...registro,
      ...(await pagina.evaluate(() => {
        const linhas = [...document.querySelectorAll("table tbody tr")];
        const primeira = linhas[0];
        const colunas = primeira ? primeira.querySelectorAll("td,th").length : 0;
        const corpo = (document.body.innerText || "").replace(/\s+/g, " ");
        return {
          linhas: linhas.length,
          colunas,
          // Paginação: controle explícito ou "carregar mais".
          temPaginacao:
            /aria-label="[^"]*p[áa]gina/i.test(document.body.innerHTML) ||
            /pr[óo]xima p[áa]gina|carregar mais|ver mais/i.test(corpo),
          // Contagem declarada ("47 pedidos", "1–20 de 47").
          declaraTotal: /\bde\s+\d+|\d+\s+(resultado|registro|item|pedido|cliente|produto)/i.test(corpo),
          // Truncamento de célula: nome longo não estoura a coluna?
          celulasTruncadas: [...document.querySelectorAll("table tbody td")]
            .filter((td) => td.querySelector(".truncate, [class*='line-clamp']")).length,
          url: location.pathname + location.search,
        };
      })),
    };
  } catch (e) {
    registro.erro = String(e).slice(0, 160);
  }
  resultados.push(registro);
  await pagina.close();
}

await contexto.close();
await navegador.close();

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(resultados, null, 2) + "\n");
} else {
  process.stdout.write(
    `${"rota".padEnd(32)} ${"lin".padStart(4)} ${"col".padStart(3)}  pag  total  trunc\n`,
  );
  for (const r of resultados) {
    const marca = r.erro ? `ERRO ${r.erro}` : "";
    process.stdout.write(
      `${r.rota.padEnd(32)} ${String(r.linhas ?? "-").padStart(4)} ${String(r.colunas ?? "-").padStart(3)}` +
        `  ${r.temPaginacao ? "sim" : "—  "}  ${r.declaraTotal ? "sim " : "—  "}  ${r.celulasTruncadas ?? "-"}` +
        `  ${marca}\n`,
    );
  }
  const grandes = resultados.filter((r) => (r.linhas ?? 0) > 100 && !r.temPaginacao);
  process.stdout.write(
    `\n> 100 linhas sem paginação: ${grandes.length}` +
      (grandes.length ? ` (${grandes.map((g) => g.rota).join(", ")})` : "") +
      "\n",
  );
}
