/**
 * VARREDURA DE UM MÓDULO — as quatro perguntas de uma vez, em toda rota.
 *
 * ─── POR QUE UM INSTRUMENTO POR MÓDULO ────────────────────────────────────
 *
 * `captura-publica.mjs` prova que a tela abre; `contraste.mjs` conta a cor de
 * cada texto. Faltava o instrumento que responde, numa rodada só, o que a
 * matriz `41` cobra de uma superfície: **abriu? transbordou? reclamou no
 * console? tem alvo pequeno demais? tem texto ilegível?**
 *
 * Fazer isso tela a tela foi o caminho de meses. Aqui a unidade é o MÓDULO:
 * uma lista de rotas, dois temas, duas larguras — e um JSON por rota, para a
 * linha da matriz só virar `aplicado` quando houver medição daquela rota.
 *
 * ─── O QUE ELE NÃO PROVA ──────────────────────────────────────────────────
 *
 * Não prova que o fluxo funciona (isso é e2e), nem que o texto é bom. Prova
 * que a superfície renderizou e que as quatro réguas mecânicas passaram —
 * nada além disso é declarado como medido.
 *
 * ─── AS RÉGUAS ────────────────────────────────────────────────────────────
 *
 *   contraste  WCAG 2.1 AA: 4.5:1 (normal) e 3:1 (grande ≥ 24 px ou ≥ 18.66
 *              em negrito). Fundo composto com alfa, como o olho vê. Gradiente
 *              e `opacity < 0.95` ficam FORA da conta e são contados como
 *              "não medidos" — aprovar o que não se mediu é o defeito que esta
 *              auditoria mais combate.
 *   overflow   `scrollWidth - clientWidth` da raiz. Se houver, o elemento que
 *              estoura é nomeado: número sem culpado não se conserta.
 *   console    `console.error` e exceção de página. Ruído de dev server
 *              (`Fast Refresh`, HMR) é filtrado e listado no rodapé do JSON.
 *   toque      alvo interativo visível < 40 px em qualquer dimensão. Links
 *              dentro de parágrafo ficam de fora (são texto, não controle);
 *              botões, switches, inputs, selects e `summary` entram.
 *
 * Uso (app rodando e sessão salva):
 *   node scripts/auditoria/varredura-de-modulo.mjs \
 *     --estado /tmp/state-admin.json \
 *     --rotas /app/settings,/app/settings/profile \
 *     --saida docs/auditoria/capturas/varredura-settings
 *
 * `--rotas` aceita vírgula. `--saida` é o diretório das PNGs e do JSON; o nome
 * do arquivo diz tema e largura, então "antes" e "depois" são pastas distintas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) args.set(argv[i], argv[i + 1]);
  }
}

const estado = args.get("--estado");
if (!estado) {
  console.error("falta --estado <storageState.json>");
  process.exit(2);
}
const rotas = String(args.get("--rotas") ?? "").split(",").filter(Boolean);
if (rotas.length === 0) {
  console.error("falta --rotas /a,/b");
  process.exit(2);
}
const larguras = [1440, 390];
const temas = ["light", "dark"];
const saida = path.join(RAIZ, args.get("--saida") ?? "docs/auditoria/capturas/varredura");
mkdirSync(saida, { recursive: true });

const navegador = await chromium.launch();
const registros = [];

for (const rota of rotas) {
  for (const tema of temas) {
    for (const largura of larguras) {
      const altura = largura >= 1000 ? 900 : 844;
      const contexto = await navegador.newContext({
        storageState: estado,
        viewport: { width: largura, height: altura },
        locale: "pt-BR",
      });
      await contexto.addInitScript((escolhido) => {
        try {
          window.localStorage.setItem("nexus-theme", escolhido);
        } catch {
          /* modo privado */
        }
      }, tema);

      const pagina = await contexto.newPage();
      const consoleErros = [];
      const paginaErros = [];
      pagina.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const texto = msg.text();
        // Ruído do dev server e de recurso externo bloqueado não é defeito da
        // tela; fica no registro bruto e sai da régua.
        if (/\[Fast Refresh\]|Download the React DevTools|favicon|net::ERR_/i.test(texto)) return;
        consoleErros.push(texto.slice(0, 220));
      });
      pagina.on("pageerror", (err) => paginaErros.push(String(err).slice(0, 220)));

      const nome = `${rota.replace(/^\//, "").replace(/[/?=]+/g, "_") || "raiz"}_${tema}_${largura}.png`;
      const registro = { rota, tema, largura, arquivo: nome };
      try {
        const resposta = await pagina.goto(`${BASE}${rota}`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        registro.status = resposta?.status() ?? null;
        await pagina.evaluate(() => document.fonts?.ready).catch(() => {});
        // Mesma espera do instrumento de captura: título e fim do esqueleto.
        await pagina
          .waitForFunction(() => document.querySelector("h1") !== null, undefined, { timeout: 10_000 })
          .catch(() => {});
        await pagina
          .waitForFunction(
            () =>
              !/Carregando|Compilando|Preparando/.test(document.body.innerText ?? "") &&
              document.querySelector('[class*="animate-pulse"]') === null,
            undefined,
            { timeout: 30_000 },
          )
          .catch(() => {});
        await pagina.waitForTimeout(1200);
        registro.urlFinal = pagina.url().replace(BASE, "");

        /*
         * REDIRECT NÃO É TELA — a rota que respondeu é outra.
         *
         * `/settings/canal-oficial`, `/settings/templates` e
         * `/settings/tenant/whatsapp` são aliases para `/app/connections`; a
         * varredura media `Conexões` e gravava com o nome do alias. O mesmo
         * vale para `/titulos` → `/financeiro`. Aqui a diferença fica escrita;
         * quem lê a matriz sabe que a linha aponta para outro lugar.
         */
        {
          const pedido = new URL(`${BASE}${rota}`);
          const final = new URL(pagina.url());
          const caminho = (u) => `${u.pathname}${u.search}`;
          if (caminho(final) !== caminho(pedido)) {
            registro.redirecionaPara = caminho(final);
          }
        }

        /*
         * SESSÃO VENCIDA NÃO É TELA VERDE.
         *
         * A primeira varredura de notificações pós-conserto rodou com o cookie
         * de uma hora antes, caiu no `/login` e registrou "8 textos, 0
         * contraste, 0 console" — um resultado limpo da tela ERRADA. O mesmo
         * defeito que o `contraste.mjs` já fechava e este instrumento não.
         */
        if (
          (rota.startsWith("/app") || rota.startsWith("/admin")) &&
          /\/login/.test(registro.urlFinal)
        ) {
          throw new Error(`sessão inválida: ${rota} redirecionou para ${registro.urlFinal}`);
        }

        registro.medida = await pagina.evaluate(() => {
          const luminancia = ([r, g, b]) => {
            const c = [r, g, b].map((v) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
          };
          const razao = (a, b) => {
            const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
            return (l1 + 0.05) / (l2 + 0.05);
          };
          const parse = (cor) => {
            const m = /rgba?\(([^)]+)\)/.exec(cor);
            if (!m) return null;
            const p = m[1].split(",").map((v) => parseFloat(v));
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
          };
          const fundoDe = (el) => {
            let atual = el;
            let acumulado = null;
            while (atual) {
              const cs = getComputedStyle(atual);
              if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
              const cor = parse(cs.backgroundColor);
              if (cor && cor.a > 0) {
                acumulado = acumulado
                  ? {
                      r: cor.r * cor.a + acumulado.r * (1 - cor.a),
                      g: cor.g * cor.a + acumulado.g * (1 - cor.a),
                      b: cor.b * cor.a + acumulado.b * (1 - cor.a),
                    }
                  : { r: cor.r, g: cor.g, b: cor.b };
                if (cor.a === 1) break;
              }
              atual = atual.parentElement;
            }
            return acumulado ?? { r: 255, g: 255, b: 255 };
          };

          // ── contraste ─────────────────────────────────────────────────
          const textos = [];
          const foraPorImagem = [];
          for (const el of document.querySelectorAll("body *")) {
            const donoDoTexto = [...el.childNodes].some(
              (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 1,
            );
            if (!donoDoTexto) continue;
            if (el.closest('[aria-hidden="true"]')) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.display === "none") continue;
            if (parseFloat(cs.opacity) < 0.95) continue;
            if (cs.getPropertyValue("clip") !== "auto" && cs.position === "absolute") continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const fundo = fundoDe(el);
            const texto = parse(cs.color);
            if (!fundo || !texto) {
              foraPorImagem.push((el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40));
              continue;
            }
            const tamanho = parseFloat(cs.fontSize);
            const negrito = parseInt(cs.fontWeight, 10) >= 600;
            const grande = tamanho >= 24 || (tamanho >= 18.66 && negrito);
            const minimo = grande ? 3 : 4.5;
            const valor = razao([texto.r, texto.g, texto.b], [fundo.r, fundo.g, fundo.b]);
            textos.push({
              amostra: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 44),
              razao: Math.round(valor * 100) / 100,
              minimo,
              passa: valor >= minimo,
              corTexto: `rgba(${Math.round(texto.r)},${Math.round(texto.g)},${Math.round(texto.b)},${texto.a})`,
              corFundo: `rgb(${Math.round(fundo.r)},${Math.round(fundo.g)},${Math.round(fundo.b)})`,
              classe: (el.className || "").toString().slice(0, 70),
            });
          }
          const ruins = textos.filter((t) => !t.passa).sort((a, b) => a.razao - b.razao);

          // ── overflow ──────────────────────────────────────────────────
          const raiz = document.documentElement;
          const overflow = Math.max(0, raiz.scrollWidth - raiz.clientWidth);
          let estoura = null;
          if (overflow > 0) {
            const limite = raiz.clientWidth;
            const candidatos = [...document.querySelectorAll("body *")].filter((el) => {
              const r = el.getBoundingClientRect();
              return r.right > limite + 1 && r.width > 0 && r.height > 0;
            });
            const alvo = candidatos.sort(
              (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
            )[0];
            if (alvo) {
              estoura = {
                tag: alvo.tagName.toLowerCase(),
                classe: (alvo.className || "").toString().slice(0, 70),
                direita: Math.round(alvo.getBoundingClientRect().right),
                texto: (alvo.textContent || "").replace(/\s+/g, " ").trim().slice(0, 44),
              };
            }
          }

          // ── alvos de toque ────────────────────────────────────────────
          const controles = [
            ...document.querySelectorAll(
              'button, [role="button"], [role="switch"], [role="tab"], input, select, summary',
            ),
          ];
          const pequenos = [];
          for (const el of controles) {
            if (el.closest('[aria-hidden="true"]')) continue;
            const cs = getComputedStyle(el);
            if (cs.display === "none" || cs.visibility === "hidden") continue;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            // Input de texto dentro de formulário tem 36–40px; abaixo de 40 é
            // achado, mas o alvo real é o rótulo — registramos o número.
            if (r.width < 40 || r.height < 40) {
              pequenos.push({
                tag: el.tagName.toLowerCase(),
                tipo: el.getAttribute("type") ?? el.getAttribute("role") ?? null,
                texto: (
                  el.getAttribute("aria-label") ??
                  el.getAttribute("title") ??
                  el.textContent ??
                  ""
                )
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 40),
                largura: Math.round(r.width),
                altura: Math.round(r.height),
              });
            }
          }

          return {
            temaAplicado: raiz.getAttribute("data-theme"),
            h1: [...document.querySelectorAll("h1")].map((el) => el.textContent?.trim()),
            textos: textos.length,
            contrasteReprovados: ruins.length,
            pioresContrastes: ruins.slice(0, 6),
            naoMedidosPorImagem: foraPorImagem.length,
            overflow,
            estoura,
            alvosPequenos: pequenos.length,
            amostraAlvosPequenos: pequenos.slice(0, 8),
          };
        });

        registro.consoleErros = [...new Set(consoleErros)].slice(0, 6);
        registro.errosDePagina = [...new Set(paginaErros)].slice(0, 4);

        await pagina.screenshot({ path: path.join(saida, nome), fullPage: false });
        registros.push(registro);

        const m = registro.medida;
        const errosDeConsole = registro.consoleErros.length + registro.errosDePagina.length;
        const veredito =
          registro.status >= 400
            ? `HTTP ${registro.status}`
            : m.contrasteReprovados > 0 || m.overflow > 0 || errosDeConsole > 0
              ? "FALHOU"
              : "ok";
        process.stdout.write(
          `${rota.replace("/app", "~/app").padEnd(34)} ${tema.padEnd(5)} ${String(largura).padStart(4)} ` +
            `· ${veredito.padEnd(8)} · contraste ${m.contrasteReprovados}/${m.textos}` +
            ` · overflow ${m.overflow}` +
            ` · console ${errosDeConsole}` +
            ` · alvos<40 ${m.alvosPequenos}\n`,
        );
      } catch (erro) {
        registro.erro = String(erro).slice(0, 200);
        registros.push(registro);
        process.stdout.write(`${rota} ${tema} ${largura} · ERRO ${String(erro).slice(0, 120)}\n`);
      } finally {
        await contexto.close();
      }
    }
  }
}

await navegador.close();

const resumo = rotas.map((rota) => {
  const daRota = registros.filter((r) => r.rota === rota);
  const falhas = daRota.filter(
    (r) =>
      r.erro ||
      (r.status ?? 200) >= 400 ||
      (r.medida?.contrasteReprovados ?? 0) > 0 ||
      (r.medida?.overflow ?? 0) > 0 ||
      (r.consoleErros?.length ?? 0) + (r.errosDePagina?.length ?? 0) > 0,
  );
  return {
    rota,
    combinacoes: daRota.length,
    falhas: falhas.length,
    status: [...new Set(daRota.map((r) => r.status))],
    contrasteReprovados: daRota.reduce((n, r) => n + (r.medida?.contrasteReprovados ?? 0), 0),
    errosDeConsole: daRota.reduce(
      (n, r) => n + (r.consoleErros?.length ?? 0) + (r.errosDePagina?.length ?? 0),
      0,
    ),
    overflowMax: Math.max(0, ...daRota.map((r) => r.medida?.overflow ?? 0)),
    alvosPequenosMax: Math.max(0, ...daRota.map((r) => r.medida?.alvosPequenos ?? 0)),
  };
});

const arquivo = path.join(saida, "varredura.json");
writeFileSync(
  arquivo,
  JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, resumo, registros }, null, 2) + "\n",
);

process.stdout.write(`\n${rotas.length} rotas · ${registros.length} combinações\n`);
for (const r of resumo) {
  process.stdout.write(
    `${r.falhas === 0 ? "OK    " : "FALHA "} ${r.rota.padEnd(36)} ` +
      `status=${r.status.join("/")} contraste=${r.contrasteReprovados} ` +
      `console=${r.errosDeConsole} overflow=${r.overflowMax} alvos<40=${r.alvosPequenosMax}\n`,
  );
}
process.stdout.write(`\n→ ${path.relative(RAIZ, arquivo)}\n`);
