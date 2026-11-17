/**
 * INP — a latência da INTERAÇÃO, que nenhum tempo de carregamento mede.
 *
 * ─── POR QUE FALTAVA ──────────────────────────────────────────────────────
 *
 * O trace de `desempenho.mjs` mede LCP, CLS e TBT. TBT é tempo de thread
 * principal **sem** interação; INP é o outro lado: quanto tempo a tela demora
 * para responder a um clique ou a uma tecla. Um produto pode carregar rápido e
 * travar em cada clique — e o Core Web Vitals cobra os dois.
 *
 * ─── COMO MEDIR (E O QUE NÃO DÁ PARA MEDIR AQUI) ──────────────────────────
 *
 * O navegador entrega `event` entries com `duration` por interação
 * (`interactionId`). INP de campo (CrUX) usa o p98 das interações reais de
 * muitos usuários; aqui é **laboratório**: interações roteirizadas, 6 telas, 2
 * condições. O número é uma amostra declarada, não um veredito de campo.
 *
 * Cada tela recebe o mesmo roteiro: uma tecla no primeiro campo de busca, um
 * clique na primeira aba (se existir) e um clique no primeiro botão de filtro.
 * Nada é submetido.
 *
 * Uso:
 *   node scripts/auditoria/inp.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const ROTAS = ["/app/pedidos", "/app/contacts", "/app/inbox", "/app/financeiro", "/app/kanban", "/app/ai"];

const CONDICOES = [
  { nome: "desktop", viewport: { width: 1440, height: 900 }, cpu: 1 },
  { nome: "celular", viewport: { width: 390, height: 844 }, cpu: 4 },
];

const OBSERVADOR = () => {
  window.__inp = [];
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        window.__inp.push({
          nome: e.name,
          duracao: Math.round(e.duration),
          inicio: Math.round(e.startTime),
          interacao: e.interactionId ?? 0,
          alvo: e.target?.tagName ?? null,
        });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {
    /* navegador sem event timing */
  }
};

const navegador = await chromium.launch();
const resultados = [];

for (const condicao of CONDICOES) {
  const contexto = await navegador.newContext({
    viewport: condicao.viewport,
    locale: "pt-BR",
    storageState: ESTADO,
  });
  await contexto.addInitScript(OBSERVADOR);

  for (const rota of ROTAS) {
    const pagina = await contexto.newPage();
    const cdp = await contexto.newCDPSession(pagina);
    if (condicao.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: condicao.cpu });

    const r = { rota, condicao: condicao.nome };
    try {
      await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await pagina.waitForTimeout(2500);

      const busca = pagina
        .locator("main input[type='search'], main input[placeholder*='uscar' i], main input[type='text']")
        .first();
      if ((await busca.count()) > 0) {
        await busca.click({ timeout: 5000 }).catch(() => undefined);
        await busca.pressSequentially("e2", { delay: 40 }).catch(() => undefined);
        await pagina.waitForTimeout(600);
      }

      const aba = pagina.getByRole("tab").nth(1);
      if ((await aba.count()) > 0) {
        await aba.click({ timeout: 5000 }).catch(() => undefined);
        await pagina.waitForTimeout(600);
      }

      const filtro = pagina.getByRole("button", { name: /filtro|filtrar|mais opç/i }).first();
      if ((await filtro.count()) > 0) {
        await filtro.click({ timeout: 5000 }).catch(() => undefined);
        await pagina.waitForTimeout(600);
      }

      const eventos = await pagina.evaluate(() => window.__inp ?? []);
      const porInteracao = new Map();
      // Só eventos que o INP conta: tecla e ponteiro. `pointerover`/`mouseover`
      // carregam `interactionId` mas NÃO entram na métrica — contá-los publicaria
      // "INP = hover", que não é o que o usuário sente ao clicar.
      const CONTA = new Set(["pointerdown", "pointerup", "click", "keydown", "keyup", "mousedown", "mouseup", "touchstart", "touchend"]);
      for (const e of eventos) {
        if (!e.interacao || !CONTA.has(e.nome)) continue;
        porInteracao.set(e.interacao, Math.max(porInteracao.get(e.interacao) ?? 0, e.duracao));
      }
      const duracoes = [...porInteracao.values()].sort((a, b) => b - a);
      const contados = eventos.filter((e) => e.interacao && CONTA.has(e.nome));
      r.interacoes = porInteracao.size;
      r.inp = duracoes[0] ?? 0;
      r.pior = contados.sort((a, b) => b.duracao - a.duracao)[0] ?? null;
      r.semInteracao = porInteracao.size === 0;
      r.acimaDe200 = duracoes.filter((d) => d > 200).length;
    } catch (e) {
      r.erro = e instanceof Error ? e.message.slice(0, 140) : String(e);
    }

    resultados.push(r);
    console.log(
      `${condicao.nome.padEnd(8)} ${rota.padEnd(16)} interações=${String(r.interacoes ?? "?").padStart(2)} ` +
        `INP=${String(r.inp ?? "?").padStart(4)}ms acimaDe200=${r.acimaDe200 ?? "?"} ` +
        `pior=${r.pior ? `${r.pior.nome}/${r.pior.alvo}` : "-"}` +
        (r.erro ? ` ERRO ${r.erro}` : ""),
    );
    await pagina.close();
  }

  await contexto.close();
}

await navegador.close();

const arquivo = "docs/auditoria/capturas/inp-producao.json";
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      base: BASE,
      medido_em: new Date().toISOString(),
      metodo:
        "Interações roteirizadas (tecla no primeiro campo, clique na primeira aba, clique em filtro). INP = maior duração por interactionId. Laboratório, não CrUX.",
      resultados,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nartefato: ${arquivo}`);
