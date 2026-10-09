/**
 * VARREDURA DE PRODUÇÃO, TELA POR TELA.
 *
 * Abre cada rota do sistema em `https://crm.billhigiene.tech` e recolhe o que
 * não aparece na tela: erro de JavaScript no console, resposta HTTP ≥ 400,
 * requisição falha, e página que não chegou a pintar conteúdo.
 *
 * ─── Por que isto existe e o que ele NÃO é ──────────────────────────────────
 *
 * O teste unitário passa, a CI passa, e a tela mostra "500" com o banco
 * sãozinho. Nenhum dos dois vê o que o dono vê. Esta varredura é o único
 * instrumento que mede a coisa que ele relata.
 *
 * E o que ela **não** afirma: uma tela que renderiza pode ter o botão errado,
 * o texto trocado ou a conta errada. Ausência de erro não é prova de
 * funcionamento. Por isso ela recolhe e mostra — a leitura é de quem lê.
 *
 * ─── Por que as rotas vêm do CÓDIGO e não de uma lista ──────────────────────
 *
 * Uma lista escrita à mão envelhece: alguém cria `/app/relatorios/x` e a
 * varredura nunca olha. Aqui as rotas saem do próprio `app/app`, então tela
 * nova é medida sozinha, sem ninguém lembrar de cadastrar.
 */
import { readdirSync, statSync } from "node:fs";
import * as path from "node:path";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoDono } from "../e2e/helpers/login-admin";

const RAIZ_APP = path.join(process.cwd(), "app", "app");

interface Achado {
  rota: string;
  consoleErros: string[];
  httpRuins: string[];
  requisicoesFalhadas: string[];
  pintou: boolean;
  tempoMs: number;
}

/** Toda rota estática de tela, do próprio código. */
function rotasEstaticas(dir = RAIZ_APP, prefixo = "/app"): string[] {
  const achadas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const cheio = path.join(dir, entrada);
    if (entrada.startsWith("_") || entrada.startsWith(".")) continue;
    const ehDir = statSync(cheio).isDirectory();
    if (ehDir) {
      achadas.push(...rotasEstaticas(cheio, `${prefixo}/${entrada}`));
    } else if (entrada === "page.tsx") {
      achadas.push(prefixo);
    }
  }
  return achadas.filter((r) => !/\/\[[^\/]+\]/.test(r)).sort();
}

test.setTimeout(600_000);

test("nenhuma tela de produção devolve erro", async ({ page }) => {
  await loginComoDono(page, lerCreds());

  const rotas = rotasEstaticas();
  console.log("telas estaticas medidas:", rotas.length);
  expect(rotas.length, "nenhuma rota encontrada — o inventário está errado").toBeGreaterThan(30);

  const achados: Achado[] = [];

  for (const rota of rotas) {
    const consoleErros: string[] = [];
    const httpRuins: string[] = [];
    const requisicoesFalhadas: string[] = [];

    const onConsole = (msg: { type(): string; text(): string }) => {
      if (msg.type() !== "error") return;
      const t = msg.text();
      // Ruído conhecido de terceiro, que não é defeito deste sistema:
      if (/favicon|Download the React DevTools/i.test(t)) return;
      consoleErros.push(t.slice(0, 220));
    };
    const onResponse = (res: { url(): string; status(): number }) => {
      const s = res.status();
      if (s < 400) return;
      const u = res.url();
      // `/monitoring?o=…&p=…&r=us` não existe em nenhum arquivo deste
      // repositório — medido: `grep -rn "monitoring?o=" app lib components` não
      // acha. É instrumentação de terceiro que devolve 429 por cota. Contar
      // como defeito nosso faz a varredura gritar por algo que não controlamos,
      // e uma varredura que grita é uma que ninguém lê.
      if (/favicon|\/api\/health|supabase\/auth\/v1\/(user|settings)|\/monitoring\?/.test(u))
        return;
      httpRuins.push(`${s} ${u.replace(/^https?:\/\/[^/]+/, "").slice(0, 110)}`);
    };
    const onFailed = (req: { url(): string; failure(): { errorText: string } | null }) => {
      const u = req.url();
      if (/favicon|whatsapp|waha|sentry|\/monitoring\?/i.test(u)) return;
      requisicoesFalhadas.push(
        `${u.replace(/^https?:\/\/[^/]+/, "").slice(0, 100)} (${req.failure()?.errorText ?? "?"})`,
      );
    };

    page.on("console", onConsole);
    page.on("response", onResponse);
    page.on("requestfailed", onFailed);

    const inicio = Date.now();
    let status = 0;
    try {
      const res = await page.goto(rota, { waitUntil: "domcontentloaded", timeout: 45_000 });
      status = res?.status() ?? 0;
      // Espera a rede acalmar: a maioria dos erros de dados só aparece quando a
      // página termina de buscar — e é ali que nasce o "carregou mas ficou vazio".
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(350);
    } catch (e) {
      httpRuins.push(`NAVEGACAO: ${(e as Error).message.slice(0, 140)}`);
    }

    const pintou = await page
      .locator("main, [role=main]")
      .first()
      .isVisible()
      .catch(() => false);

    page.off("console", onConsole);
    page.off("response", onResponse);
    page.off("requestfailed", onFailed);

    achados.push({
      rota,
      consoleErros,
      httpRuins,
      requisicoesFalhadas,
      pintou,
      tempoMs: Date.now() - inicio,
    });

    const marca = status >= 400 || consoleErros.length || httpRuins.length ? "ERRO" : "ok";
    console.log(
      `  ${marca.padEnd(4)} ${status || "???"} ${String(Date.now() - inicio).padStart(5)}ms  ${rota}`,
    );
    if (consoleErros.length) console.log(`        console: ${consoleErros[0]?.slice(0, 130)}`);
    for (const h of httpRuins.slice(0, 2)) console.log(`        http:    ${h}`);
    for (const f of requisicoesFalhadas.slice(0, 2)) console.log(`        rede:    ${f}`);
  }

  // O relatório completo no stdout: quem roda isto tem a impressao de tudo, não só
  // da primeira falha — o defeito de uma tela costuma vir acompanhado de outro.
  console.log("\n===== RESUMO =====");
  const comProblema = achados.filter(
    (a) => a.consoleErros.length || a.httpRuins.length || a.requisicoesFalhadas.length || !a.pintou,
  );
  console.log(`telas medidas: ${achados.length} | com sinal de erro: ${comProblema.length}`);
  for (const a of comProblema) {
    console.log(`\n${a.rota}  (${a.tempoMs}ms, pintou=${a.pintou})`);
    for (const c of a.consoleErros) console.log(`  console: ${c}`);
    for (const h of a.httpRuins) console.log(`  http:    ${h}`);
    for (const f of a.requisicoesFalhadas) console.log(`  rede:    ${f}`);
  }
  const maisLenta = [...achados].sort((a, b) => b.tempoMs - a.tempoMs).slice(0, 5);
  console.log("\n===== MAIS lentas =====");
  for (const a of maisLenta) console.log(`  ${String(a.tempoMs).padStart(6)}ms  ${a.rota}`);

  expect(
    comProblema.map((a) => a.rota),
    "telas com sinal de erro em produção — o relatório está acima, com o detalhe de cada uma",
  ).toEqual([]);
});
