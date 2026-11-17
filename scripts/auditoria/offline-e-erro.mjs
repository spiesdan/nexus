/**
 * SEM REDE — o produto diz alguma coisa?
 *
 * ─── O QUE O ITEM 2.9 PEDE ────────────────────────────────────────────────
 *
 * Estados: carregando, vazio, erro recuperável, sucesso, **offline** e
 * permissão negada. Os quatro primeiros já foram medidos (V-07, V-09, V-12,
 * V-25). "Offline" não: e é o estado que o usuário encontra no celular na rua,
 * no elevador, no galpão.
 *
 * ─── COMO MEDIR SEM INVENTAR ──────────────────────────────────────────────
 *
 * O navegador é colocado em modo offline (`context.setOffline(true)`) DEPOIS da
 * tela carregada, e então se provoca uma busca de dados: recarregar, ou pedir
 * "Carregar mais". O que se registra é o que aparece — mensagem de erro com
 * ação, skeleton parado, tela em branco, ou os dados antigos mantidos.
 *
 * Nada aqui julga de antemão: o veredito ("bom", "ruim") mora no doc, com o
 * texto medido ao lado. O que este instrumento garante é que a afirmação do doc
 * tem um número e uma string exata por trás.
 *
 * Uso:
 *   node scripts/auditoria/offline-e-erro.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const ROTAS = process.env.AUDIT_ROTAS
  ? process.env.AUDIT_ROTAS.split(",")
  : ["/app/pedidos", "/app/contacts", "/app/inbox", "/app/financeiro"];

const navegador = await chromium.launch();
const resultados = [];

for (const rota of ROTAS) {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    storageState: ESTADO,
  });
  const pagina = await contexto.newPage();
  const r = { rota };

  try {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await pagina.waitForTimeout(2500);

    // O service worker precisa estar ATIVO e controlando a página para o modo
    // offline fazer sentido. Na primeira visita ele registra mas ainda não
    // controla; recarregar uma vez com rede é o que o usuário faz ao voltar.
    // Sem este passo a medida registra a página "Sem internet" do navegador —
    // defeito da régua, não do produto (medido em 17/11/2026).
    r.serviceWorker = await pagina.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { suportado: false };
      const registro = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (registro) await navigator.serviceWorker.ready.catch(() => null);
      return {
        suportado: true,
        registro: !!registro,
        ativo: registro?.active?.state ?? null,
        controlando: !!navigator.serviceWorker.controller,
      };
    });
    await pagina.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => undefined);
    await pagina.waitForTimeout(2500);
    r.textoAntes = (await pagina.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 120);

    await contexto.setOffline(true);

    // 1) AÇÃO com a tela já carregada: é o caso real de "o celular perdeu o
    // sinal no meio do uso". "Carregar mais" é o gesto mais comum que busca
    // dados sem recarregar.
    const mais = pagina.getByRole("button", { name: /carregar mais/i }).first();
    if ((await mais.count()) > 0) {
      await mais.click().catch(() => undefined);
      await pagina.waitForTimeout(2500);
      r.toastDeErro = (
        await pagina
          .locator("[data-sonner-toast], [role='status'], [role='alert']")
          .first()
          .textContent()
          .catch(() => null)
      )?.trim().slice(0, 160);
      r.textoAposAcaoOffline = (await pagina.locator("main").innerText().catch(() => ""))
        .replace(/\s+/g, " ")
        .slice(0, 160);
    } else {
      r.toastDeErro = null;
      r.semAcaoParaMedir = true;
    }

    // 2) RECARREGAR com a rede fora: aqui o documento é servido pelo navegador,
    // não pelo produto — o que a tela mostra é a página de erro DELE.
    await pagina.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
    await pagina.waitForTimeout(4000);

    r.textoDepois = (await pagina.locator("main").innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 400);
    r.paginaTemMain = (await pagina.locator("main").count()) > 0;
    r.titulo = await pagina.title();
    // Mensagem de erro recuperável: role=alert, texto de erro do produto, ou o
    // NexusErrorState (que tem botão de tentar de novo).
    r.temAlerta = await pagina
      .locator('[role="alert"]')
      .first()
      .isVisible()
      .catch(() => false);
    r.temBotaoTentar = await pagina
      .getByRole("button", { name: /tentar (de novo|novamente)/i })
      .first()
      .isVisible()
      .catch(() => false);
    // O ALERTA primeiro: o título da página ("Visão geral") não é a mensagem
    // de erro e já apareceu como "texto de erro" na primeira rodada.
    r.textoDeErro = (
      await pagina.locator('[role="alert"]').first().textContent().catch(() => null)
    )?.trim().slice(0, 220);
    r.tituloDaPagina = (await pagina.locator("h1").first().textContent().catch(() => null))?.trim();
  } catch (e) {
    r.erro = e instanceof Error ? e.message.slice(0, 160) : String(e);
  }

  resultados.push(r);
  console.log(
    `${rota.padEnd(16)} main=${r.paginaTemMain} alerta=${r.temAlerta} tentarDeNovo=${r.temBotaoTentar} ` +
      `texto="${(r.textoDeErro ?? r.textoDepois ?? "").slice(0, 90)}"`,
  );
  await contexto.close();
}

await navegador.close();

const arquivo = "docs/auditoria/capturas/offline-e-erro.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      metodo:
        "Tela carregada; navegador em modo offline; reload. Registra-se o que aparece — nada é julgado aqui.",
      resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
