/**
 * BUSCA, FILTRO E "CARREGAR MAIS" — o item 2.7 medido no clique, não na matriz.
 *
 * ─── POR QUE ISSO PRECISA DE INSTRUMENTO ──────────────────────────────────
 *
 * A matriz de telas prova que `/app/pedidos` TEM filtro e tabela; ela não prova
 * que digitar no filtro filtra. Um `<input>` ligado a um `useState` que ninguém
 * usa no `fetch` passa na matriz e falha com o usuário.
 *
 * Aqui se digita de verdade e se contam as linhas antes/depois, com o termo
 * batendo em dado que o seed deixou (E2E). Se a contagem não mudar, o achado é
 * do produto — mas antes de acusar, o instrumento confere se existe dado com o
 * termo (senão o zero é da base, não do filtro).
 *
 * Uso:
 *   node scripts/auditoria/lista-busca-e-paginacao.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

/** Termo que existe no seed e é curto o bastante para casar com poucos. */
const TERMO = "E2E";

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
  storageState: ESTADO,
});
const resultados = [];

async function contar(pagina, seletor) {
  return pagina.locator(seletor).count();
}

// ── Contatos: busca + carregar mais ───────────────────────────────────────
{
  const pagina = await contexto.newPage();
  const r = { rota: "/app/contacts" };
  await pagina.goto(`${BASE}/app/contacts`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pagina.waitForTimeout(3000);

  const linhas = "table tbody tr";
  r.linhasIniciais = await contar(pagina, linhas);

  const busca = pagina.getByTestId("busca-contatos").or(pagina.locator("#busca-contatos"));
  await busca.fill(TERMO);
  await pagina.waitForTimeout(2000);
  r.termo = TERMO;
  r.linhasComTermo = await contar(pagina, linhas);
  r.urlComTermo = (await pagina.evaluate(() => location.pathname + location.search)).slice(0, 160);

  await busca.fill("");
  await pagina.waitForTimeout(2000);
  const mais = pagina.getByRole("button", { name: /carregar mais/i });
  r.temCarregarMais = await mais.isVisible().catch(() => false);
  if (r.temCarregarMais) {
    await mais.click();
    await pagina.waitForTimeout(2500);
    r.linhasDepoisDeMais = await contar(pagina, linhas);
  }

  resultados.push(r);
  console.log(
    `contatos · linhas ${r.linhasIniciais} → com "${TERMO}": ${r.linhasComTermo} · carregar mais: ${r.temCarregarMais ? `${r.linhasDepoisDeMais} linhas` : "ausente"}`,
  );
  await pagina.close();
}

// ── Pedidos: busca + seleção ──────────────────────────────────────────────
{
  const pagina = await contexto.newPage();
  const r = { rota: "/app/pedidos" };
  await pagina.goto(`${BASE}/app/pedidos`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pagina.waitForTimeout(3000);

  // A visão padrão é a de CARTÕES agrupados por dia (`visao === "cartoes"`),
  // então não há `<table>` na tela. Conta-se o que identifica um pedido na
  // lista: o link para o detalhe.
  const linhas = 'a[href^="/app/pedidos/"]';
  r.linhasIniciais = await contar(pagina, linhas);
  r.visoes = await pagina
    .getByRole("button", { name: /cart(õ|o)es|quadro|tabela/i })
    .allTextContents()
    .catch(() => []);

  const busca = pagina.getByPlaceholder(/Número do pedido, cliente ou CNPJ/i);
  await busca.fill(TERMO);
  await pagina.waitForTimeout(2500);
  r.termo = TERMO;
  r.linhasComTermo = await contar(pagina, linhas);
  r.urlComTermo = (await pagina.evaluate(() => location.pathname + location.search)).slice(0, 160);

  await busca.fill("");
  await pagina.waitForTimeout(2500);

  // A seleção em massa vive na visão de TABELA (a de cartões é leitura por dia).
  const tabela = pagina.getByRole("button", { name: /^tabela$/i }).first();
  if ((await tabela.count()) > 0) {
    await tabela.click().catch(() => undefined);
    await pagina.waitForTimeout(1500);
    r.linhasNaTabela = await contar(pagina, "table tbody tr");
  }

  const todos = pagina.getByLabel(/selecionar todos/i).first();
  r.temSelecionarTodos = (await todos.count()) > 0;
  if (r.temSelecionarTodos) {
    await todos.click().catch(() => undefined);
    await pagina.waitForTimeout(800);
    r.textoAposSelecionar = (
      await pagina
        .locator("text=/\\d+\\s+selecionad/i")
        .first()
        .textContent()
        .catch(() => null)
    )?.trim();
  }

  resultados.push(r);
  console.log(
    `pedidos · linhas ${r.linhasIniciais} → com "${TERMO}": ${r.linhasComTermo} · tabela: ${r.linhasNaTabela ?? "?"} linhas · selecionar todos: ${r.temSelecionarTodos ? (r.textoAposSelecionar ?? "sem contador legível") : "ausente"}`,
  );
  await pagina.close();
}

await contexto.close();
await navegador.close();

const arquivo = "docs/auditoria/capturas/lista-busca-e-paginacao.json";
writeFileSync(
  arquivo,
  JSON.stringify({ base: BASE, medido_em: new Date().toISOString(), termo: TERMO, resultados }, null, 2) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
