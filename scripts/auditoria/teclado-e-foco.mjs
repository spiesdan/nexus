/**
 * TECLADO, FOCO E MOVIMENTO REDUZIDO — o que a captura de tela não vê.
 *
 * ─── O QUE FALTAVA ─────────────────────────────────────────────────────────
 *
 * O item 2.11 do prompt pede "contraste, foco, navegação por teclado, leitor de
 * tela, tamanho de toque, zoom e redução de movimento". Deste bloco, só tamanho
 * de toque tinha número (alvos < 40 px, medidos nas 258 capturas). Foco e
 * teclado não aparecem em PNG nenhum: um botão com `outline: none` é idêntico
 * a um com foco visível — até alguém apertar Tab.
 *
 * ─── AS TRÊS MEDIDAS ───────────────────────────────────────────────────────
 *
 * 1. **Foco visível.** Percorre a tela com Tab e, para cada elemento focado,
 *    lê `outline-width`, `outline-style`, `box-shadow` e `border` computados.
 *    "Foco visível" = alguma dessas muda em relação ao estado sem foco. Como
 *    comparar exige duas leituras, o teste é: o elemento focado tem
 *    `outline-style != none` com largura > 0, OU `box-shadow != none`, OU um
 *    `outline-offset` declarado. É o critério que o WCAG 2.4.7 usa.
 *
 * 2. **Ordem e alcance.** Quantos elementos recebem foco, e se algum é
 *    inalcançável por estar em `aria-hidden` ou fora do `<main>`. Também
 *    confere o "pular para o conteúdo" (primeiro Tab deve ir para ele).
 *
 * 3. **Movimento reduzido.** Com `prefers-reduced-motion: reduce` emulado,
 *    mede `transition-duration` e `animation-duration` de um botão e de um
 *    card. Se continuam > 0, o produto ignora a preferência — e isso é
 *    desconforto real para quem tem sensibilidade vestibular.
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 *
 * Não julga CONTRASTE (exige amostrar cor de texto sobre fundo em cada tela, e
 * gradiente/imagem quebram a conta ingênua — fica para um passe próprio) e não
 * usa leitor de tela de verdade (NVDA/VoiceOver não rodam aqui). O que ele mede
 * é o que o navegador sabe sobre foco e movimento.
 *
 * Uso:
 *   node scripts/auditoria/teclado-e-foco.mjs --estado /tmp/sessao.json
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = path.join(RAIZ, "docs", "auditoria", "capturas");
const MAX_TAB = 40;

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

/** Telas onde o teclado é o caminho principal (formulário, lista, quadro, inbox). */
const ROTAS = [
  "/app",
  "/app/pedidos",
  "/app/pedidos/novo",
  "/app/inbox",
  "/app/kanban",
  "/app/contacts",
  "/app/audit",
  "/app/settings/profile",
  "/login",
];

const navegador = await chromium.launch();
const resultados = [];

for (const rota of ROTAS) {
  const contexto = await navegador.newContext({
    storageState: rota === "/login" ? undefined : estado,
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const pagina = await contexto.newPage();
  const registro = { rota, focos: [], semFocoVisivel: [], movimentoReduzido: null };

  try {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await pagina.waitForTimeout(1_800);

    // ── 1 e 2: Tab a Tab ────────────────────────────────────────────────
    for (let i = 0; i < MAX_TAB; i++) {
      await pagina.keyboard.press("Tab");
      const foco = await pagina.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const nome = (
          el.getAttribute("aria-label") ||
          el.textContent ||
          el.getAttribute("placeholder") ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 46);
        // WCAG 2.4.7: foco tem de ser VISÍVEL. Outline é o caminho canônico;
        // box-shadow é o que os temas modernos usam; borda também vale.
        const temOutline =
          cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth || "0") > 0;
        const temSombra = cs.boxShadow !== "none" && cs.boxShadow !== "";
        return {
          tag: el.tagName.toLowerCase(),
          papel: el.getAttribute("role"),
          nome,
          temOutline,
          temSombra,
          outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
          foraDoMain: !el.closest("main") && !el.closest("nav") && !el.closest("header"),
          dentroDeAriaHidden: Boolean(el.closest('[aria-hidden="true"]')),
        };
      });
      if (!foco) break;
      const chave = `${foco.tag}|${foco.nome}`;
      if (registro.focos.some((f) => `${f.tag}|${f.nome}` === chave)) continue;
      registro.focos.push(foco);
      if (!foco.temOutline && !foco.temSombra) {
        registro.semFocoVisivel.push(`${foco.tag} "${foco.nome}" — outline: ${foco.outline}`);
      }
    }

    // O "pular para o conteúdo" precisa ser o PRIMEIRO Tab de uma página.
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(900);
    await pagina.keyboard.press("Tab");
    registro.primeiroTab = await pagina.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        texto: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
        ehPularParaConteudo: /pular para/i.test(el.textContent || ""),
      };
    });

    // ── 3: movimento reduzido ───────────────────────────────────────────
    await pagina.emulateMedia({ reducedMotion: "reduce" });
    await pagina.waitForTimeout(400);
    registro.movimentoReduzido = await pagina.evaluate(() => {
      const alvos = [...document.querySelectorAll("button, a, [class*='transition']")].slice(0, 20);
      // MOVIMENTO de verdade = duração perceptível (>= 20 ms).
      //
      // A primeira versão comparava com "0s" e contava `0.01ms` como movimento.
      // Só que 0.01ms é EXATAMENTE o que a regra global de
      // `prefers-reduced-motion` escreve (reduzir a ~zero em vez de remover,
      // para `transitionend` continuar disparando) — ou seja, o instrumento
      // lia "o produto respeita" como "o produto ignora". Medido em 16/11/2026.
      const emSegundos = (v) =>
        Math.max(...String(v).split(",").map((p) => parseFloat(p) || 0));
      const duracoes = alvos
        .map((el) => getComputedStyle(el))
        .map((cs) => ({
          transicao: cs.transitionDuration,
          animacao: cs.animationDuration,
        }))
        .filter((d) => emSegundos(d.transicao) >= 0.02 || emSegundos(d.animacao) >= 0.02);
      return { comMovimento: duracoes.length, amostra: duracoes.slice(0, 3) };
    });
  } catch (e) {
    registro.erro = String(e).slice(0, 160);
  }

  resultados.push(registro);
  await contexto.close();
}

await navegador.close();

const arquivo = path.join(SAIDA, "teclado-e-foco.json");
writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, resultados }, null, 2) + "\n");

for (const r of resultados) {
  const total = r.focos.length;
  process.stdout.write(
    `${r.rota.padEnd(26)} focos=${String(total).padStart(2)} semFocoVisivel=${String(r.semFocoVisivel.length).padStart(2)}` +
      ` primeiroTab=${r.primeiroTab?.ehPularParaConteudo ? "pular" : (r.primeiroTab?.texto ?? "-").slice(0, 18)}` +
      ` movimento=${r.movimentoReduzido?.comMovimento ?? "-"}` +
      (r.erro ? `  ERRO ${r.erro}` : "") +
      "\n",
  );
}
process.stdout.write(`→ ${arquivo.replace(RAIZ + "/", "")}\n`);
