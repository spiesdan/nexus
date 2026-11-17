/**
 * DESEMPENHO PERCEBIDO — o que o navegador mede na tela, não o que o servidor
 * responde.
 *
 * ─── POR QUE ESTE INSTRUMENTO EXISTE ───────────────────────────────────────
 *
 * A V-05 mediu `domcontentloaded` + assentamento e provou que o produto não
 * demora 9 s. Isso é tempo de **servidor + navegador começar a desenhar**, não
 * de a tela ficar utilizável: um `<img>` grande, um layout que pula ou um
 * script longo passariam por ali sem aparecer. O item 2.15 pede o que o usuário
 * sente — LCP, CLS e TBT — e este instrumento lê os três do próprio navegador.
 *
 * ─── AS DUAS CONDIÇÕES, E POR QUE AS DUAS ──────────────────────────────────
 *
 * `localhost` sem estrangulamento não se parece com o celular de quem vende na
 * rua. Rodamos duas séries:
 *
 *   - **desktop** — 1440 px, sem estrangulamento: mede o produto no melhor caso,
 *     que é o piso do que o código permite;
 *   - **celular** — 390 px, CPU 4× mais lenta e rede de 1,6 Mbps / 150 ms: o
 *     cenário que o Lighthouse usa como "mobile".
 *
 * Nenhuma das duas é dado de campo (CrUX); as duas são **laboratório**, e o
 * relatório diz isso. Sem a série estrangulada, "LCP 400 ms" seria propaganda.
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 *
 * Não usa Lighthouse (mais uma dependência, e o score esconde os números), não
 * mede gráficos por canvas e não mede INP — INP precisa de interação real, e
 * interagir com cada tela é o que a suíte E2E faz, não este instrumento.
 *
 * Uso:
 *   node scripts/auditoria/desempenho.mjs                      # 12 rotas, 2 condições
 *   node scripts/auditoria/desempenho.mjs --rotas /app,/app/inbox
 *   node scripts/auditoria/desempenho.mjs --estado /tmp/aaa-state.json
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const SAIDA = "docs/auditoria/capturas";

/** As telas que a operação abre todo dia — não uma amostra aleatória de 129. */
const ROTAS_PADRAO = [
  "/app",
  "/app/inbox",
  "/app/agenda",
  "/app/pedidos",
  "/app/contacts",
  "/app/notas",
  "/app/expedicao",
  "/app/prospeccao",
  "/app/compras",
  "/app/ai",
  "/app/financeiro",
  "/app/settings",
];

const CONDICOES = [
  {
    nome: "desktop",
    viewport: { width: 1440, height: 900 },
    cpu: 1,
    rede: null,
  },
  {
    nome: "celular",
    viewport: { width: 390, height: 844 },
    cpu: 4,
    // 1,6 Mbps de download, 750 kbps de upload, 150 ms de latência — o perfil
    // "Slow 4G" do Lighthouse em bytes por segundo.
    rede: { downloadThroughput: 200_000, uploadThroughput: 93_750, latency: 150 },
  },
];

/**
 * O que roda ANTES de qualquer script da página: três observadores.
 *
 * `buffered: true` importa: sem ele, o LCP do primeiro paint (que pode acontecer
 * antes da injeção) some — e o relatório diria "sem LCP" numa tela que tem.
 */
const OBSERVADORES = () => {
  const estado = { lcp: 0, cls: 0, tbt: 0, longTasks: 0 };
  window.__desempenho = estado;
  try {
    new PerformanceObserver((lista) => {
      const entradas = lista.getEntries();
      const ultima = entradas[entradas.length - 1];
      if (ultima) estado.lcp = ultima.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* navegador sem LCP */
  }
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        // Só deslocamento sem entrada do usuário conta como CLS.
        if (!e.hadRecentInput) estado.cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    /* navegador sem layout-shift */
  }
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        estado.longTasks += 1;
        // TBT é o tempo acima de 50 ms por tarefa longa, somado.
        estado.tbt += Math.max(0, e.duration - 50);
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* navegador sem longtask */
  }
};

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};

const rotas = (opcao("--rotas") ?? ROTAS_PADRAO.join(",")).split(",").map((r) => r.trim());
const arquivoEstado = opcao("--estado") ?? "/tmp/aaa-state.json";

mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();
const resultados = [];

for (const condicao of CONDICOES) {
  const contexto = await navegador.newContext({
    viewport: condicao.viewport,
    locale: "pt-BR",
    storageState: arquivoEstado,
  });
  await contexto.addInitScript(OBSERVADORES);

  for (const rota of rotas) {
    const pagina = await contexto.newPage();
    const cdp = await contexto.newCDPSession(pagina);

    if (condicao.cpu > 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: condicao.cpu });
    }
    if (condicao.rede) {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: condicao.rede.latency,
        downloadThroughput: condicao.rede.downloadThroughput,
        uploadThroughput: condicao.rede.uploadThroughput,
      });
    }

    let status = 0;
    let erro = null;
    try {
      const resposta = await pagina.goto(`${BASE}${rota}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      status = resposta?.status() ?? 0;
      // O LCP só é final depois do primeiro input ou de um tempo sem novas
      // entradas; 2,5 s de silêncio é o suficiente para a tela assentar sem
      // transformar a medição em espera artificial.
      await pagina.waitForTimeout(2500);
    } catch (e) {
      erro = e instanceof Error ? e.message.slice(0, 200) : String(e);
    }

    let medida = null;
    try {
      medida = await pagina.evaluate(() => {
        const e = window.__desempenho ?? { lcp: 0, cls: 0, tbt: 0, longTasks: 0 };
        const recursos = performance.getEntriesByType("resource");
        const bytes = recursos.reduce((soma, r) => soma + (r.transferSize || 0), 0);
        const navegacao = performance.getEntriesByType("navigation")[0];
        return {
          lcp: Math.round(e.lcp),
          cls: Math.round(e.cls * 1000) / 1000,
          tbt: Math.round(e.tbt),
          longTasks: e.longTasks,
          requisicoes: recursos.length,
          bytes,
          ttfb: navegacao ? Math.round(navegacao.responseStart) : null,
          domContentLoaded: navegacao ? Math.round(navegacao.domContentLoadedEventEnd) : null,
        };
      });
    } catch (e) {
      erro = erro ?? (e instanceof Error ? e.message.slice(0, 200) : String(e));
    }

    resultados.push({ rota, condicao: condicao.nome, status, erro, ...(medida ?? {}) });
    console.log(
      `${condicao.nome.padEnd(8)} ${rota.padEnd(20)} ${String(status).padEnd(4)} ` +
        (medida
          ? `LCP ${String(medida.lcp).padStart(5)}ms  CLS ${String(medida.cls).padEnd(5)}  TBT ${String(
              medida.tbt,
            ).padStart(5)}ms  req ${String(medida.requisicoes).padStart(3)}  ${Math.round(
              medida.bytes / 1024,
            )} KB`
          : `ERRO ${erro}`),
    );

    await pagina.close();
  }

  await contexto.close();
}

await navegador.close();

const arquivo = join(SAIDA, "desempenho-producao.json");
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      condicoes: CONDICOES.map((c) => ({
        nome: c.nome,
        viewport: c.viewport,
        cpu: c.cpu,
        rede: c.rede,
      })),
      resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo} (${resultados.length} medições)`);
