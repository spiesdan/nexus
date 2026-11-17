/**
 * O CUSTO DE DESENHAR GRÁFICO — o pedaço do 2.15 que faltava.
 *
 * ─── O QUE FALTAVA ─────────────────────────────────────────────────────────
 *
 * LCP, CLS, TBT e INP já estão medidos. Falta a pergunta específica do item:
 * quanto custa **renderizar os gráficos**? TBT alto pode ser qualquer coisa;
 * aqui se compara a mesma condição (celular, CPU 4×) entre telas com gráfico e
 * uma tela sem gráfico, contando tarefas longas e tempo bloqueado.
 *
 * ─── O QUE ELE MEDE ────────────────────────────────────────────────────────
 *
 * Por rota: quantos `<svg>` de gráfico existem, quantas tarefas longas (> 50 ms)
 * aconteceram desde o início da navegação e quanto tempo de thread ficou
 * bloqueado. A diferença entre uma tela de gráfico e `/app/settings` (sem
 * gráfico) é o custo atribuível ao desenho.
 *
 * Uso:
 *   node scripts/auditoria/graficos-custo.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const ROTAS = [
  { rota: "/app/indicadores", temGrafico: true },
  { rota: "/app", temGrafico: true },
  { rota: "/app/financeiro", temGrafico: false },
  { rota: "/app/radar", temGrafico: true },
  { rota: "/app/settings", temGrafico: false },
];

const OBSERVADOR = () => {
  window.__tarefas = [];
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        window.__tarefas.push({ duracao: Math.round(e.duration), inicio: Math.round(e.startTime) });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* navegador sem longtask */
  }
};

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  locale: "pt-BR",
  storageState: ESTADO,
});
await contexto.addInitScript(OBSERVADOR);

const resultados = [];
for (const { rota, temGrafico } of ROTAS) {
  const pagina = await contexto.newPage();
  const sessao = await contexto.newCDPSession(pagina);
  await sessao.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pagina.waitForTimeout(4000);
    const medida = await pagina.evaluate(() => {
      const tarefas = window.__tarefas ?? [];
      const bloqueado = tarefas.reduce((soma, t) => soma + Math.max(0, t.duracao - 50), 0);
      return {
        // `svg` sozinho conta ÍCONE (o produto tem 14 num formulário). Gráfico
        // de verdade é o `svg.recharts-surface` ou um container `.recharts-*`.
        graficos:
          document.querySelectorAll("main svg.recharts-surface").length ||
          document.querySelectorAll("main .recharts-wrapper").length,
        svgs: document.querySelectorAll("main svg").length,
        canvases: document.querySelectorAll("main canvas").length,
        tarefasLongas: tarefas.length,
        tbt: Math.round(bloqueado),
        maiorTarefa: tarefas.length ? Math.max(...tarefas.map((t) => t.duracao)) : 0,
      };
    });
    resultados.push({ rota, temGrafico, ...medida });
    console.log(
      `${rota.padEnd(18)} gráficos=${String(medida.graficos).padStart(2)} svg=${String(medida.svgs).padStart(2)} tarefasLongas=${String(medida.tarefasLongas).padStart(2)} ` +
        `TBT=${String(medida.tbt).padStart(4)}ms maior=${medida.maiorTarefa}ms`,
    );
  } catch (e) {
    resultados.push({ rota, temGrafico, erro: e instanceof Error ? e.message.slice(0, 120) : String(e) });
    console.log(`${rota} ERRO`);
  }
  await pagina.close();
}

await contexto.close();
await navegador.close();

const arquivo = "docs/auditoria/capturas/graficos-custo.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      metodo:
        "Celular 390 com CPU 4× (mesma condição do desempenho.mjs). Conta longtasks desde o início da navegação e o tempo bloqueado acima de 50 ms por tarefa.",
      resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
