/**
 * HIERARQUIA E DENSIDADE — medir o que se costuma "olhar e achar bonito".
 *
 * ─── O QUE O ITEM 2.4 PEDE ────────────────────────────────────────────────
 *
 * "Hierarquia e densidade". Hierarquia se perde quando há **duas ações
 * primárias** competindo (dois botões cheios lado a lado) ou **nenhuma** (tudo
 * é secundário e o olho não sabe por onde começar). Densidade se perde quando a
 * primeira tela tem mais de duas dezenas de alvos — ou poucos demais para o
 * espaço.
 *
 * ─── COMO TRANSFORMAR ISSO EM NÚMERO ──────────────────────────────────────
 *
 * Por tela, na primeira dobra (1440 × 900), conta-se:
 *   - **primárias**: botões com fundo cheio (`bg-accent`, `variant=default`);
 *   - **secundárias**: botões/link-buttons com borda ou fantasma;
 *   - **alvos**: todos os elementos clicáveis visíveis na dobra;
 *   - **linhas de texto** e comprimento mediano de linha (densidade de leitura).
 *
 * Nenhum número aqui diz "feio". Eles dizem o que a pessoa vê: quantas portas
 * iguais, quantos alvos, e se o texto ocupa a largura inteira.
 *
 * Uso:
 *   node scripts/auditoria/hierarquia-e-densidade.mjs --estado /tmp/aaa-state.json
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

const ROTAS = [
  "/app",
  "/app/pedidos",
  "/app/contacts",
  "/app/inbox",
  "/app/kanban",
  "/app/financeiro",
  "/app/notas",
  "/app/expedicao",
  "/app/prospeccao",
  "/app/ai",
  "/app/settings",
  "/admin",
];

// Largura por argumento: hierarquia/densidade em uma dobra só não cobre o
// celular, onde a "primeira dobra" é outra tela.
const indiceLargura = process.argv.indexOf("--largura");
const LARGURA = indiceLargura > 0 ? Number(process.argv[indiceLargura + 1]) : 1440;
const ALTURA = LARGURA <= 430 ? 844 : LARGURA <= 834 ? 1112 : 900;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: LARGURA, height: ALTURA },
  locale: "pt-BR",
  storageState: ESTADO,
});
const resultados = [];

for (const rota of ROTAS) {
  const pagina = await contexto.newPage();
  const r = { rota };
  try {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    // 4 s, não 2,5 s: em 320 a lista de Pedidos e o painel de /app ainda estavam
    // montando, e a régua contava ZERO alvos numa tela cheia de botões. Medido
    // em 17/11/2026 comparando com sonda independente.
    await pagina.waitForFunction(() => !!document.querySelector("main"), null, { timeout: 20000 }).catch(() => undefined);
    await pagina.waitForTimeout(4000);

    Object.assign(
      r,
      await pagina.evaluate(() => {
        const dobra = window.innerHeight;
        const visivel = (el) => {
          const rect = el.getBoundingClientRect();
          const estilo = getComputedStyle(el);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top < dobra &&
            rect.bottom > 0 &&
            estilo.visibility !== "hidden" &&
            estilo.display !== "none"
          );
        };
        const dentroDoMain = (el) => !!el.closest("main");

        // `a[href]` entra: no produto, ação primária muitas vezes é `<Button asChild>`
        // com `<Link>` por dentro. A primeira régua só olhava `button` e por isso
        // dizia "0 primárias" em Pedidos, onde "Criar pedido" está bem visível.
        const botoes = [...document.querySelectorAll("button, a[href], [role='menuitem']")]
          .filter((b) => visivel(b) && dentroDoMain(b));

        // "Primária" é decisão de COR, não de nome de classe: o `Button` compõe
        // as classes em tempo de build e o `asChild` vira `<a>`. A primeira
        // tentativa resolveu o token `--color-accent` e deu ZERO em toda tela —
        // o `@theme inline` do Tailwind deixa o custom property
        // autorreferente, e o valor lido vem vazio.
        //
        // A régua passou a olhar o que o olho vê: botão com fundo OPACO que se
        // DESTACA do fundo da página (razão ≥ 2,5). É isso que separa a ação
        // principal das secundárias — estas têm fundo transparente ou da mesma
        // família do cartão.
        const rgb = (texto) => (texto.match(/[\d.]+/g) ?? []).map(Number);
        const lum = (cor) => {
          const [r, g, b] = rgb(cor).slice(0, 3).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const razao = (a, b) => {
          const la = lum(a);
          const lb = lum(b);
          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
        };
        const main = document.querySelector("main");
        const fundoDaPagina = main ? getComputedStyle(main).backgroundColor : "rgb(255,255,255)";
        const alfa = (cor) => {
          const valores = rgb(cor);
          return valores.length === 4 ? valores[3] : 1;
        };
        const primarias = botoes.filter((b) => {
          const fundo = getComputedStyle(b).backgroundColor;
          return alfa(fundo) > 0.5 && razao(fundo, fundoDaPagina) >= 2.5;
        });
        const alvos = [
          ...document.querySelectorAll("a[href], button, input, select, textarea, [role='tab'], [role='checkbox']"),
        ].filter((el) => visivel(el) && dentroDoMain(el));

        // Caracteres por linha de verdade: a LARGURA da caixa não diz nada (um
        // subtítulo de 40 caracteres ocupa 1.100 px). Conta-se as linhas
        // renderizadas com um `Range` e divide-se o texto por elas. Parágrafo
        // curto (menos de 60 caracteres) não entra — cabe numa linha só e não
        // mede hábito de leitura.
        const maioresLinhas = [];
        for (const el of document.querySelectorAll("main p")) {
          const texto = (el.textContent ?? "").trim();
          if (texto.length < 60) continue;
          const faixa = document.createRange();
          faixa.selectNodeContents(el);
          const linhas = faixa.getClientRects().length;
          if (linhas < 2) continue;
          maioresLinhas.push({ ch: Math.round(texto.length / linhas), texto: texto.slice(0, 60) });
        }
        const maiorLinhaCh = maioresLinhas.length
          ? Math.max(...maioresLinhas.map((l) => l.ch))
          : null;
        const exemploDaLinhaLonga = maioresLinhas.sort((a, b) => b.ch - a.ch)[0]?.texto ?? null;
        return {
          // Título de PÁGINA: `h1` em qualquer lugar (no layout estreito o
          // cabeçalho fica fora do `main`) + `h2` de SEÇÃO dentro do main. Contar
          // todo `h2` somava os 9 cabeçalhos da barra lateral.
          titulos:
            [...document.querySelectorAll("h1")].filter(visivel).length +
            [...document.querySelectorAll("main h2")].filter(visivel).length,
          primarias: primarias.length,
          primariasComTexto: primarias
            .map((b) => (b.textContent ?? "").trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 6),
          secundarias: botoes.length - primarias.length,
          alvosNaDobra: alvos.length,
          maiorLinhaCh,
          exemploDaLinhaLonga,
          cards: [...document.querySelectorAll("main .rounded-card, main [class*='rounded-card']")].filter(visivel)
            .length,
        };
      }),
    );
  } catch (e) {
    r.erro = e instanceof Error ? e.message.slice(0, 140) : String(e);
  }
  resultados.push(r);
  console.log(
    `${rota.padEnd(18)} primárias=${r.primarias ?? "?"} secundárias=${r.secundarias ?? "?"} alvos=${r.alvosNaDobra ?? "?"} ` +
      `títulos=${r.titulos ?? "?"} linha≈${r.maiorLinhaCh ?? "?"}ch cards=${r.cards ?? "?"}` +
      (r.primariasComTexto?.length ? ` · ${r.primariasComTexto.join(" | ")}` : "") +
      (r.erro ? ` ERRO ${r.erro}` : ""),
  );
  await pagina.close();
}

await contexto.close();
await navegador.close();

const arquivo =
  LARGURA === 1440
    ? "docs/auditoria/capturas/hierarquia-e-densidade.json"
    : `docs/auditoria/capturas/hierarquia-e-densidade-${LARGURA}.json`;
writeFileSync(
  arquivo,
  JSON.stringify(
      { base: BASE, medido_em: new Date().toISOString(), viewport: `${LARGURA}x${ALTURA}`, resultados },
      null,
      2,
    ) +
    "\n",
);
console.log(`\nartefato: ${arquivo}`);
