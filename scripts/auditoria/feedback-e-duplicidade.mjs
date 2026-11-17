/**
 * FEEDBACK IMEDIATO E PREVENÇÃO DE DUPLICIDADE — medido no clique, não no código.
 *
 * ─── O QUE ESTE INSTRUMENTO RESPONDE (item 2.10 do prompt) ────────────────
 *
 * "Todo formulário tem estado pendente?" e "dois cliques criam dois registros?"
 * não se respondem lendo `disabled={isPending}` no arquivo: respondem-se
 * clicando. E clicar num formulário que GRAVA é criar registro no banco de quem
 * instalou — o que este instrumento NÃO faz.
 *
 * ─── COMO ELE MEDE SEM GRAVAR ─────────────────────────────────────────────
 *
 * O POST é interceptado no navegador e **abortado** depois de 2,5 s. Nada chega
 * ao banco. Nesse intervalo o instrumento mede o que o usuário veria:
 *
 *   1. o botão de envio fica desabilitado? (feedback imediato);
 *   2. o rótulo muda ("Criando…" ou equivalente)?
 *   3. dois cliques no mesmo intervalo geram **quantas requisições**? (1 é o
 *      correto; 2 é duplicidade);
 *   4. abortada a requisição, a tela mostra o erro? (falha visível, não silêncio).
 *
 * Uso:
 *   node scripts/auditoria/feedback-e-duplicidade.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

/** Cada caso: abrir, preencher o mínimo válido, mirar o POST. */
const CASOS = [
  {
    nome: "Cliente (novo)",
    rota: "/app/contacts",
    abrir: async (page) => {
      await page.getByRole("button", { name: /novo cliente|novo contato/i }).first().click();
    },
    // O diálogo abre em "Pessoa jurídica": o campo é `#name` (razão social) e a
    // recusa do produto é "informe email ou telefone".
    preencher: async (page) => {
      await page.locator("#name").fill("E2E Feedback");
      await page.locator("#email").fill("feedback.e2e@example.com");
      await page.locator("#phone_number").fill("+5511987654321");
    },
    post: "**/api/v1/contacts",
    // Seletor ESTÁVEL: durante o envio o rótulo vira "Criando…", e um locator
    // por nome pararia de achar o botão no meio da medição.
    enviar: (page) => page.locator('[role="dialog"] button[type="submit"]').last(),
  },
  {
    nome: "Template (novo)",
    rota: "/app/templates",
    abrir: async (page) => {
      await page.getByRole("button", { name: /novo template/i }).first().click();
    },
    preencher: async (page) => {
      await page.locator("#tpl-title").fill("E2E Feedback");
      await page.locator("#tpl-body").fill("Mensagem de teste do instrumento de auditoria.");
    },
    // `/api/v1/message-templates` — a primeira versão deste instrumento mirou
    // `/api/v1/templates`, o POST passou e CRIOU um template no banco. Achado
    // antes de publicar: nada desta rodada entra como medida sem esta conferência.
    post: "**/api/v1/message-templates",
    enviar: (page) => page.locator('[role="dialog"] button[type="submit"]').last(),
  },
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
  storageState: ESTADO,
});

const resultados = [];

for (const caso of CASOS) {
  const pagina = await contexto.newPage();
  const requisicoes = [];
  const avisos = [];
  pagina.on("console", (m) => {
    if (m.type() === "error") avisos.push(m.text().slice(0, 160));
  });

  // Só POST entra na conta: o mesmo caminho serve a listagem (GET), e contar as
  // duas dava "5 requisições" para dois cliques — medida inválida, descartada.
  await pagina.route(caso.post, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requisicoes.push({ t: Date.now(), metodo: route.request().method(), url: route.request().url() });
    await new Promise((r) => setTimeout(r, 2500));
    await route.abort();
  });

  const registro = { caso: caso.nome, rota: caso.rota };
  try {
    await pagina.goto(`${BASE}${caso.rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await pagina.waitForTimeout(2500);

    await caso.abrir(pagina);
    await pagina.waitForTimeout(600);
    await caso.preencher(pagina);
    await pagina.waitForTimeout(200);

    const botao = caso.enviar(pagina);
    const rotuloAntes = (await botao.textContent())?.trim() ?? "";
    const desabilitadoAntes = await botao.isDisabled();

    // Dois cliques rápidos: o segundo é o que o usuário impaciente dá.
    await botao.click();
    await pagina.waitForTimeout(120);
    const desabilitadoDurante = await botao.isDisabled().catch(() => null);
    const rotuloDurante = (await botao.textContent().catch(() => ""))?.trim() ?? "";
    await botao.click({ force: true, timeout: 1500 }).catch(() => undefined);

    await pagina.waitForTimeout(3200);

    registro.rotuloAntes = rotuloAntes;
    registro.desabilitadoAntes = desabilitadoAntes;
    registro.desabilitadoDurante = desabilitadoDurante;
    registro.rotuloDurante = rotuloDurante;
    registro.mudouRotulo = rotuloDurante !== "" && rotuloDurante !== rotuloAntes;
    registro.requisicoes = requisicoes.length;
    registro.chamadas = requisicoes.map((r) => ({ metodo: r.metodo, url: r.url.replace(BASE, "") }));
    registro.erroVisivel = await pagina
      .locator('[role="alert"], [data-sonner-toast], .text-error-fg, [role="status"]')
      .first()
      .isVisible()
      .catch(() => false);
    registro.avisosDeConsole = avisos.slice(0, 3);
  } catch (e) {
    registro.erro = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }

  await pagina.close();
  resultados.push(registro);
  console.log(
    `${caso.nome.padEnd(26)} req=${registro.requisicoes ?? "?"} ` +
      `desabilitado=${registro.desabilitadoDurante ?? "?"} ` +
      `rótulo="${registro.rotuloDurante || registro.rotuloAntes || ""}" ` +
      `erroVisível=${registro.erroVisivel ?? "?"}` +
      (registro.erro ? ` ERRO ${registro.erro}` : ""),
  );
}

await contexto.close();
await navegador.close();

const arquivo = "docs/auditoria/capturas/feedback-e-duplicidade.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      metodo:
        "POST interceptado e abortado após 2,5 s: nada grava. Mede-se o estado pendente e a contagem de requisições por dois cliques.",
      resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
