/**
 * VARREDURA DE `app/app` — o mapa de defeitos de uma vez.
 *
 * ─── POR QUE UMA VARREDURA, E NÃO 96 PASSES ────────────────────────────────
 *
 * Medido em 20/11/2026: 13 rotas em 104 s (~8 s/rota). As 96 restantes do
 * `app/app` cabem numa rodada — e o mapa que sai dela responde "qual defeito
 * aparece em mais telas?" antes de alguém desenhar a primeira. Consertar por
 * concentração é o que transforma 30 telas num componente.
 *
 * ─── AS RÉGUAS ────────────────────────────────────────────────────────────
 *
 *   contraste  WCAG 2.1 AA: 4,5:1 normal / 3:1 grande (≥24 px, ou ≥18,66 em
 *              negrito). Fundo composto com alfa. Gradiente e `opacity < 0,95`
 *              ficam FORA e são contados como não medidos.
 *   overflow   `scrollWidth - clientWidth` da raiz; o elemento que estoura é
 *              nomeado.
 *   console    `console.error` + `pageerror`. Ruído de HMR é filtrado.
 *   alvo       44×44 px (regra da casa: `40-expedicao-design.md:104` e `41`
 *              §12) em qualquer controle visível: botão, switch, tab, input,
 *              select, summary. Links de parágrafo ficam fora — são texto.
 *   axe        `critical` e `serious` do `@axe-core/playwright`, com o alvo.
 *
 * ─── MEDIDO ≠ VISITADO ────────────────────────────────────────────────────
 *
 * Linha sem `url` ou sem `<h1>` é `valida: false` com `motivo`, e as métricas
 * ficam `null` — nunca zero. Rota dinâmica sem id, sessão vencida, redirect
 * para `/login` e tela que não pintou o título não entram como "limpa".
 * Redirect legítimo é medido no DESTINO e marcado com `redirecionaPara`.
 *
 * Uso:
 *   node scripts/auditoria/varredura-de-modulo.mjs \
 *     --estado /tmp/state-sweep.json \
 *     --grupo fiscal \
 *     --saida docs/auditoria/capturas/varredura-fiscal
 *
 *   … --excluir-grupo fiscal --saida docs/auditoria/capturas/varredura-app
 *   … --rotas /app/pedidos,/app/contacts
 *
 * `--capturar` grava PNG por combinação; sem ele, só o JSON (o padrão — 97
 * rotas × 4 combinações de PNG é peso que ninguém abre).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const MATRIZ = path.join(RAIZ, "docs/auditoria/41-matriz-rotas.json");

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const proximo = argv[i + 1];
      args.set(argv[i], proximo && !proximo.startsWith("--") ? proximo : true);
    }
  }
}

const estado = args.get("--estado");
if (!estado || estado === true || !existsSync(estado)) {
  console.error("falta --estado <storageState.json>");
  process.exit(2);
}

const matriz = JSON.parse(readFileSync(MATRIZ, "utf8"));
const grupoPorRota = new Map(matriz.rotas.map((r) => [r.rota, r.grupo]));
const grupo = args.get("--grupo");
const excluirGrupo = args.get("--excluir-grupo");
const lista = args.get("--rotas");

let rotas = matriz.rotas.map((r) => r.rota);
if (grupo && grupo !== true) rotas = rotas.filter((r) => grupoPorRota.get(r) === grupo);
if (excluirGrupo && excluirGrupo !== true)
  rotas = rotas.filter((r) => grupoPorRota.get(r) !== excluirGrupo);
if (lista && lista !== true) {
  const pedidas = String(lista).split(",").filter(Boolean);
  rotas = pedidas.filter((r) => rotas.includes(r));
}
if (rotas.length === 0) {
  console.error("nenhuma rota selecionada");
  process.exit(2);
}

/** Ids reais do banco de teste, para as dinâmicas que têm fixture. */
const IDS = {
  "/pedidos/[id]": { id: process.env.ID_PEDIDO ?? "f0597235-ba27-4d32-98c5-e0f881dc667d" },
  "/compras/[id]": { id: process.env.ID_COMPRA ?? "1595e588-f87d-4323-b434-13039b4938a7" },
  "/inbox/[id]": { id: process.env.ID_CONVERSA ?? "75119f51-edee-47ff-a968-71094203b5a3" },
  "/contacts/[id]": { id: process.env.ID_CONTATO ?? "70fd026e-6759-4aa1-a55d-4ff2d8b65f4b" },
  "/leads/[id]": { id: process.env.ID_LEAD ?? "56563958-a491-416f-8ec8-db3fe251f636" },
  "/pipelines/[id]": { id: process.env.ID_PIPELINE ?? "714dbeb6-8873-4771-9b72-6c5240109f34" },
  "/fiscal/notas/[id]": { id: process.env.ID_NOTA ?? "a6d2935c-8ada-49da-a33b-957642f4c3a2" },
};

function urlDe(rota) {
  if (!rota.includes("[")) return `/app${rota}`;
  const patch = IDS[rota];
  if (!patch) return null;
  let url = rota;
  for (const [chave, valor] of Object.entries(patch)) url = url.replace(`[${chave}]`, valor);
  return url.includes("[") ? null : `/app${url}`;
}

const larguras = [1440, 390];
const temas = ["light", "dark"];
const saida = path.join(RAIZ, args.get("--saida") ?? "docs/auditoria/capturas/varredura");
const capturar = args.has("--capturar");
mkdirSync(saida, { recursive: true });

const navegador = await chromium.launch();
const registros = [];
const comecou = Date.now();

function invalida(rota, tema, largura, motivo, consoleErros = []) {
  return {
    rota,
    tema,
    largura,
    valida: false,
    motivo,
    urlFinal: "",
    overflow: null,
    contraste: null,
    alvosPequenos: null,
    axe: null,
    consoleErros: consoleErros.slice(0, 6),
    errosDePagina: [],
  };
}

for (const rota of rotas) {
  const caminho = urlDe(rota);
  for (const tema of temas) {
    for (const largura of larguras) {
      if (!caminho) {
        registros.push(invalida(rota, tema, largura, "rota dinâmica sem id de exemplo em IDS"));
        process.stdout.write(
          `${rota.padEnd(40)} ${tema} ${largura} · NÃO MEDIDA (sem id)\n`,
        );
        continue;
      }

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
        if (/\[Fast Refresh\]|Download the React DevTools|favicon|net::ERR_/i.test(texto)) return;
        consoleErros.push(texto.slice(0, 220));
      });
      pagina.on("pageerror", (err) => paginaErros.push(String(err).slice(0, 220)));

      const nome = `${rota.replace(/^\//, "").replace(/[/?=]+/g, "_") || "raiz"}_${tema}_${largura}.png`;
      const registro = {
        rota,
        modulo: grupoPorRota.get(rota) ?? null,
        tema,
        largura,
        arquivo: capturar ? nome : null,
      };
      const t0 = Date.now();
      try {
        const resposta = await pagina.goto(`${BASE}${caminho}`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        registro.status = resposta?.status() ?? null;
        await pagina.evaluate(() => document.fonts?.ready).catch(() => {});

        // Esqueleto primeiro: é o sinal caro (compilar/renderizar o corpo).
        await pagina
          .waitForFunction(
            () =>
              !/Carregando|Compilando|Preparando/.test(document.body.innerText ?? "") &&
              document.querySelector('[class*="animate-pulse"]') === null,
            undefined,
            { timeout: 45_000 },
          )
          .catch(() => {});

        // Depois o título, com timeout curto — 3 s é folga, não corrida.
        let temH1 = false;
        try {
          await pagina.waitForFunction(() => document.querySelector("h1") !== null, undefined, {
            timeout: 3_000,
          });
          temH1 = true;
        } catch {
          /* sem título */
        }

        await pagina.waitForTimeout(600);
        registro.urlFinal = pagina.url().replace(BASE, "");

        {
          const pedido = new URL(`${BASE}${caminho}`);
          const final = new URL(pagina.url());
          const url = (u) => `${u.pathname}${u.search}`;
          if (url(final) !== url(pedido)) registro.redirecionaPara = url(final);
        }

        if (/\/login/.test(registro.urlFinal)) {
          throw new Error(`sessão inválida: redirecionou para ${registro.urlFinal}`);
        }
        if (!temH1) {
          throw new Error("sem <h1> 3 s após o esqueleto — a tela não terminou de renderizar");
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

          // Alvo da casa: 44×44, não o mínimo WCAG de 24.
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
            if (r.width < 44 || r.height < 44) {
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

        // axe: crítico/sério, com o alvo. Roda depois do corpo montado.
        try {
          const axe = await new AxeBuilder({ page: pagina }).analyze();
          const graves = axe.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious",
          );
          registro.axe = {
            critica: axe.violations.filter((v) => v.impact === "critical").length,
            seria: graves.filter((v) => v.impact === "serious").length,
            ids: graves.map((v) => `${v.id} (${v.impact})`),
            nos: graves.flatMap((v) =>
              v.nodes
                .slice(0, 2)
                .map((n) => `${v.id}: ${n.target.join(" ")} :: ${(n.html ?? "").slice(0, 180)}`),
            ),
          };
        } catch (erro) {
          registro.axeErro = String(erro).slice(0, 160);
        }

        registro.consoleErros = [...new Set(consoleErros)].slice(0, 6);
        registro.errosDePagina = [...new Set(paginaErros)].slice(0, 4);
        registro.valida = true;
        registro.tempoMs = Date.now() - t0;
        registros.push(registro);

        const m = registro.medida;
        const erros = registro.consoleErros.length + registro.errosDePagina.length;
        const veredito =
          (registro.status ?? 200) >= 400
            ? `HTTP ${registro.status}`
            : m.contrasteReprovados > 0 ||
                m.overflow > 0 ||
                erros > 0 ||
                m.alvosPequenos > 0 ||
                (registro.axe?.critica ?? 0) + (registro.axe?.seria ?? 0) > 0
              ? "DEFEITO"
              : "ok";
        process.stdout.write(
          `${rota.replace("/app", "~/app").padEnd(40)} ${tema.padEnd(5)} ${String(largura).padStart(4)} ` +
            `· ${veredito.padEnd(8)} · contraste ${m.contrasteReprovados}/${m.textos}` +
            ` · overflow ${m.overflow} · console ${erros}` +
            ` · alvos<44 ${m.alvosPequenos} · axe ${registro.axe?.critica ?? "?"}/${registro.axe?.seria ?? "?"}\n`,
        );
        if (capturar) {
          await pagina.screenshot({ path: path.join(saida, nome) });
        }
      } catch (erro) {
        registro.valida = false;
        registro.motivo = String(erro).slice(0, 200);
        registro.consoleErros = [...new Set(consoleErros)].slice(0, 6);
        registro.errosDePagina = [...new Set(paginaErros)].slice(0, 4);
        registro.overflow = null;
        registro.contraste = null;
        registro.alvosPequenos = null;
        registro.axe = null;
        registro.tempoMs = Date.now() - t0;
        registros.push(registro);
        process.stdout.write(
          `${rota.replace("/app", "~/app").padEnd(40)} ${tema} ${largura} · NÃO MEDIDA: ${String(erro).slice(0, 90)}\n`,
        );
      } finally {
        await contexto.close();
      }
    }
  }
}

await navegador.close();

const tempoTotalMs = Date.now() - comecou;
const resumo = rotas.map((rota) => {
  const da = registros.filter((r) => r.rota === rota);
  const validas = da.filter((r) => r.valida);
  const invalidas = da.filter((r) => !r.valida);
  const contraste = validas.reduce((n, r) => n + (r.medida?.contrasteReprovados ?? 0), 0);
  const overflow = Math.max(0, ...validas.map((r) => r.medida?.overflow ?? 0));
  const consoleErros = validas.reduce(
    (n, r) => n + (r.consoleErros?.length ?? 0) + (r.errosDePagina?.length ?? 0),
    0,
  );
  const alvos = Math.max(0, ...validas.map((r) => r.medida?.alvosPequenos ?? 0));
  const critica = validas.reduce((n, r) => n + (r.axe?.critica ?? 0), 0);
  const seria = validas.reduce((n, r) => n + (r.axe?.seria ?? 0), 0);
  const http = validas.some((r) => (r.status ?? 200) >= 400);
  return {
    rota,
    modulo: grupoPorRota.get(rota) ?? null,
    redirecionaPara: [...new Set(da.map((r) => r.redirecionaPara).filter(Boolean))][0] ?? null,
    combinacoes: da.length,
    validas: validas.length,
    invalidas: invalidas.length,
    motivo: invalidas.map((r) => r.motivo).filter(Boolean)[0] ?? null,
    status: [...new Set(validas.map((r) => r.status))],
    contraste,
    overflow,
    consoleErros,
    alvosPequenos: alvos,
    axeCritica: critica,
    axeSeria: seria,
    defeitos: {
      http,
      contraste: contraste > 0,
      overflow: overflow > 0,
      console: consoleErros > 0,
      alvo: alvos > 0,
      axe: critica + seria > 0,
    },
    falhas: validas.filter(
      (r) =>
        (r.status ?? 200) >= 400 ||
        (r.medida?.contrasteReprovados ?? 0) > 0 ||
        (r.medida?.overflow ?? 0) > 0 ||
        (r.consoleErros?.length ?? 0) + (r.errosDePagina?.length ?? 0) > 0 ||
        (r.medida?.alvosPequenos ?? 0) > 0 ||
        (r.axe?.critica ?? 0) + (r.axe?.seria ?? 0) > 0,
    ).length,
    tempoMs: da.reduce((n, r) => n + (r.tempoMs ?? 0), 0),
  };
});

const porModulo = {};
for (const r of resumo) {
  const m = (porModulo[r.modulo ?? "sem-grupo"] ??= {
    rotas: 0,
    medidas: 0,
    ok: 0,
    contraste: 0,
    overflow: 0,
    console: 0,
    alvo: 0,
    axe: 0,
    http: 0,
  });
  m.rotas += 1;
  if (r.validas > 0) m.medidas += 1;
  if (r.invalidas === 0 && r.falhas === 0) m.ok += 1;
  for (const d of ["contraste", "overflow", "console", "alvo", "axe", "http"])
    if (r.defeitos[d]) m[d] += 1;
}

const arquivo = path.join(saida, "varredura.json");
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      base: BASE,
      tempoTotalMs,
      rotas: rotas.length,
      medidas: registros.length,
      validas: registros.filter((r) => r.valida).length,
      invalidas: registros.filter((r) => !r.valida).length,
      porModulo,
      resumo,
      registros,
    },
    null,
    2,
  ) + "\n",
);

process.stdout.write(`\n${rotas.length} rotas · ${registros.length} combinações · ${Math.round(tempoTotalMs / 1000)} s\n`);
for (const r of resumo) {
  process.stdout.write(
    `${r.falhas === 0 && r.invalidas === 0 ? "OK    " : "FALHA "} ${r.rota.padEnd(40)} ` +
      `validas=${r.validas}/${r.combinacoes} contraste=${r.contraste} console=${r.consoleErros} ` +
      `overflow=${r.overflow} alvos<44=${r.alvosPequenos} axe=${r.axeCritica}/${r.axeSeria}\n`,
  );
}
process.stdout.write(`\n→ ${path.relative(RAIZ, arquivo)}\n`);
