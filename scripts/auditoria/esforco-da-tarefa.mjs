/**
 * QUANTO CUSTA UMA TAREFA — cliques e teclas até o objetivo, contados no
 * navegador (item 2.6).
 *
 * ─── POR QUE CONTAR ────────────────────────────────────────────────────────
 *
 * "Cliques/digitação em tarefas frequentes" é a diferença entre um produto que
 * respeita o dia de quem usa e um que cobra pedágio. A suíte E2E conta o caminho
 * de UMA jornada (`jornada-venda`: 5 cliques e 5 digitações do login ao pedido).
 *
 * Aqui o instrumento conta **eventos reais** (`pointerdown` e `keydown`) com um
 * listener injetado antes do primeiro script, e executa três tarefas de leitura,
 * das mais repetidas: achar um cliente, abrir uma conversa, filtrar os vencidos.
 * Nenhuma grava dado.
 *
 * Uso:
 *   node scripts/auditoria/esforco-da-tarefa.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const CONTADOR = () => {
  window.__esforco = { cliques: 0, teclas: 0 };
  window.addEventListener(
    "pointerdown",
    () => {
      window.__esforco.cliques += 1;
    },
    true,
  );
  window.addEventListener(
    "keydown",
    (e) => {
      // Tab/Shift não é "digitação": é navegação. Conta o que a pessoa digita.
      if (e.key === "Tab" || e.key === "Shift") return;
      window.__esforco.teclas += 1;
    },
    true,
  );
};

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "pt-BR",
  storageState: ESTADO,
});
const resultados = [];
// O contador PRECISA ser injetado antes do primeiro script da página — sem
// isto, `window.__esforco` não existe e a medida falha em silêncio.
await contexto.addInitScript(CONTADOR);

async function tarefa(nome, rota, executar) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pagina.waitForTimeout(2500);
  const r = { tarefa: nome, rota };
  try {
    const conclusao = await executar(pagina, () => pagina.evaluate(() => window.__esforco));
    const marca = await pagina.evaluate(() => window.__esforco);
    Object.assign(r, { cliques: marca.cliques, teclas: marca.teclas, ...conclusao });
  } catch (e) {
    r.erro = e instanceof Error ? e.message.slice(0, 140) : String(e);
  }
  resultados.push(r);
  console.log(
    `${nome.padEnd(38)} cliques=${r.cliques ?? "?"} teclas=${r.teclas ?? "?"} ` +
      `${r.chegou ? "chegou" : "NÃO chegou"}${r.erro ? ` ERRO ${r.erro}` : ""}`,
  );
  await pagina.close();
}

await tarefa("achar cliente e abrir a ficha", "/app/contacts", async (pagina) => {
  // `pressSequentially`, não `fill`: `fill` escreve o valor por código e conta
  // ZERO teclas — a primeira medição disse "0 teclas para achar um cliente",
  // que era o instrumento mentindo, não o produto sendo econômico.
  await pagina.locator("#busca-contatos").click();
  await pagina.locator("#busca-contatos").pressSequentially("Escalação", { delay: 30 });
  await pagina.waitForTimeout(1500);
  const linha = pagina.locator("table tbody tr a").first();
  const nome = (await linha.textContent())?.trim() ?? "";
  await linha.click();
  await pagina.waitForURL(/\/app\/contacts\/[0-9a-f-]{8}/, { timeout: 15000 });
  return { chegou: true, abriu: nome.slice(0, 40) };
});

await tarefa("abrir o pedido do topo da lista", "/app/pedidos", async (pagina) => {
  // O Inbox ficou de fora desta medição: a lista não expõe item clicável por
  // seletor estável (as linhas são `div` de lista virtualizada), e medir o
  // clique em "Todas" não responderia "quanto custa abrir uma conversa".
  // O primeiro link do `main` é "Criar pedido" (`/app/pedidos/novo`) — a
  // primeira rodada abriu o formulário e a régua chamou de "não chegou".
  const link = pagina
    .locator('main a[href^="/app/pedidos/"]')
    .filter({ hasNot: pagina.locator("xpath=.") , hasText: /#|\d/ })
    .first();
  const hrefs = await pagina.locator('main a[href^="/app/pedidos/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const alvo = hrefs.find((h) => /\/app\/pedidos\/[0-9a-f-]{8}/.test(h ?? ""));
  if (!alvo) return { chegou: false, motivo: "nenhum pedido na lista" };
  await pagina.locator(`main a[href="${alvo}"]`).first().click({ timeout: 8000 });
  await pagina.waitForTimeout(2000);
  // Pode navegar para a ficha OU abrir painel na mesma tela — as duas são
  // "abrir o pedido". A régua aceita as duas e registra qual foi.
  const url = pagina.url();
  const navegou = /\/app\/pedidos\/[0-9a-f-]{8}/.test(url);
  const painel = await pagina
    .locator("[role='dialog'], [data-state='open'][role='dialog']")
    .first()
    .isVisible()
    .catch(() => false);
  const titulo = (await pagina.locator("h1").first().textContent())?.trim() ?? "";
  return { chegou: navegou || painel, navegou, painel, abriu: titulo.slice(0, 40) };
});

await tarefa("ver os recebíveis vencidos", "/app/financeiro", async (pagina) => {
  const vencidos = pagina.getByRole("button", { name: /^vencidos$/i }).first();
  await vencidos.click({ timeout: 8000 });
  await pagina.waitForTimeout(1500);
  const linhas = await pagina.locator("table tbody tr").count();
  return { chegou: linhas > 0, linhas };
});

await contexto.close();
await navegador.close();

const arquivo = "docs/auditoria/capturas/esforco-da-tarefa.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      metodo:
        "Eventos reais (pointerdown/keydown) contados por listener injetado antes do primeiro script. Tarefas de leitura, nenhum dado é gravado.",
      resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
