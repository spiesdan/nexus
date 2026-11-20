/**
 * CAPTURA E MEDIÇÃO — superfícies de público/auth/estado (matriz 41, §2.2).
 *
 * Não é gate de CI: é o instrumento da prova do passe de design. Mede o que o
 * passe promete (hierarquia, estados, tema) e o que ele NÃO pode quebrar:
 * **contraste AA**, **overflow** e **console** — além do axe (serious/critical)
 * que os passes anteriores já usavam.
 *
 * A régua de contraste é calculada no browser, sobre o que está PINTADO:
 * cor computada do texto × fundo efetivo (subindo os ancestrais e compondo
 * alfa). O piso é WCAG 1.4.3: 4,5:1 para texto normal e 3:1 para texto grande
 * (>= 24px, ou >= 18,66px em negrito). Medir token contra token diria o que o
 * CSS promete; medir o pixel diria o que a tela entrega.
 *
 * Uso:
 *   BASE=http://127.0.0.1:3002 npx tsx tests/captura-publico-auth.ts antes
 *   BASE=http://127.0.0.1:3002 npx tsx tests/captura-publico-auth.ts depois
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3002";
// Recorte para blocos de 5 rotas sem rodar as 16 (regra de entrega em blocos).
const FILTRO = (process.env.SLUGS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const ROTULO = process.argv[2] ?? "antes";
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-publico-auth`);

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

/**
 * As 16 superfícies públicas/auth/estado (as 9 de onboarding ficam no
 * instrumento próprio — exigem organização não finalizada).
 *
 * `espera` é o sinal de que a TELA certa renderizou: sem ele, um redirect para
 * /login geraria captura bonita de outra página. `urlFinal` no registro prova.
 */
const ROTAS = [
  { slug: "login", path: "/login", espera: /Entrar/i },
  { slug: "login-forgot", path: "/login/forgot", espera: /Recuperar|Esqueci|senha/i },
  { slug: "login-recovery", path: "/login/recovery", espera: /Recupera|senha|código/i },
  { slug: "login-reset", path: "/login/reset", espera: /senha|Redefinir|inválido/i },
  { slug: "login-mfa", path: "/login/mfa", espera: /código|verifica|MFA|Entrar/i },
  { slug: "signup", path: "/signup", espera: /Conta|Criar|cadastro|e-mail/i },
  { slug: "403", path: "/403", espera: /Acesso|permiss/i },
  { slug: "500", path: "/500", espera: /Erro|algo|errado|intern/i },
  { slug: "503", path: "/503", espera: /indispon|manuten|volta/i },
  { slug: "account-suspended", path: "/account-suspended", espera: /suspens|conta/i },
  { slug: "legal-privacy", path: "/legal/privacy", espera: /privacidade|dados/i },
  { slug: "legal-terms", path: "/legal/terms", espera: /termos|uso/i },
  { slug: "orcamento", path: "/o/token-de-teste", espera: /orçamento|proposta|inválid|expir/i },
  { slug: "landing", path: "/", espera: /./ },
  { slug: "vitrine-agenda", path: "/vitrine-agenda", espera: /agenda|vitrine|agendar/i },
  { slug: "accept-invite", path: "/team/accept-invite/token-de-teste", espera: /convite|inválid|expir|equipe/i },
] as const;

const ROTAS_DA_VEZ = FILTRO.length > 0 ? ROTAS.filter((r) => FILTRO.includes(r.slug)) : ROTAS;

interface AchadoDeContraste {
  seletor: string;
  texto: string;
  razao: number;
  piso: number;
  cor: string;
  fundo: string;
  fonte: string;
}

interface Medida {
  rota: string;
  urlFinal: string;
  tema: string;
  largura: number;
  overflow: number;
  h1: string | null;
  redirecionou: boolean;
  console: string[];
  toque: { total: number; pequenos: number; exemplos: string[] };
  contraste: { total: number; abaixo: number; piores: AchadoDeContraste[] };
  axe: { critica: number; seria: number; ids: string[]; nos: string[] };
}

/**
 * MEDIÇÃO NO BROWSER — vai como STRING (mesmo motivo do captura-inbox: `tsx`
 * injeta `__name` nas funções nomeadas e o `page.evaluate` quebraria).
 */
const MEDIR = `(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const razao = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const compor = (cima, baixo) => ({
    r: cima.r * cima.a + baixo.r * (1 - cima.a),
    g: cima.g * cima.a + baixo.g * (1 - cima.a),
    b: cima.b * cima.a + baixo.b * (1 - cima.a),
    a: 1,
  });
  const temaEscuro = document.documentElement.getAttribute("data-theme") === "dark"
    || document.documentElement.classList.contains("dark");
  const basePagina = temaEscuro ? { r: 10, g: 10, b: 12, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };

  const fundoDe = (el) => {
    const pilha = [];
    let no = el;
    while (no && no.nodeType === 1) {
      const c = parse(getComputedStyle(no).backgroundColor);
      if (c && c.a > 0) {
        pilha.push(c);
        if (c.a >= 0.999) break;
      }
      no = no.parentElement;
    }
    let acc = basePagina;
    for (let i = pilha.length - 1; i >= 0; i--) acc = compor(pilha[i], acc);
    return acc;
  };

  const visivel = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    if (parseFloat(s.opacity || "1") < 0.15) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom < -50 || r.top > window.innerHeight + 4000) return false;
    return true;
  };

  const amostra = [];
  const abaixo = [];
  let total = 0;

  const alvos = Array.from(document.querySelectorAll("body *"));
  for (const el of alvos) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"].includes(el.tagName)) continue;
    const texto = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!texto) continue;
    if (!visivel(el)) continue;
    const s = getComputedStyle(el);
    const cor = parse(s.color);
    if (!cor) continue;
    const fundo = fundoDe(el);
    const efetiva = cor.a < 0.999 ? compor(cor, fundo) : cor;
    const r = razao(efetiva, fundo);
    const px = parseFloat(s.fontSize);
    const negrito = parseInt(s.fontWeight, 10) >= 700;
    const grande = px >= 24 || (px >= 18.66 && negrito);
    const piso = grande ? 3 : 4.5;
    total++;
    if (r < piso) {
      const id = el.id ? "#" + el.id : "";
      const cls = (el.className || "").toString().split(" ").filter(Boolean).slice(0, 2).join(".");
      abaixo.push({
        seletor: el.tagName.toLowerCase() + id + (cls ? "." + cls : ""),
        texto: texto.slice(0, 60),
        razao: Math.round(r * 100) / 100,
        piso,
        cor: s.color,
        fundo: "rgb(" + Math.round(fundo.r) + "," + Math.round(fundo.g) + "," + Math.round(fundo.b) + ")",
        fonte: s.fontSize + "/" + s.fontWeight,
      });
    }
  }
  const interativos = Array.from(
    document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"]'),
  ).filter(visivel);
  const pequenos = interativos.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width < 44 || r.height < 44;
  });
  abaixo.sort((a, b) => a.razao - b.razao);
  return {
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    contraste: { total, abaixo: abaixo.length, piores: abaixo.slice(0, 8) },
    toque: {
      total: interativos.length,
      pequenos: pequenos.length,
      exemplos: pequenos.slice(0, 5).map((el) => {
        const r = el.getBoundingClientRect();
        return (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "")) + " " + Math.round(r.width) + "x" + Math.round(r.height);
      }),
    },
  };
})()`;

async function medir(page: Page, rota: string, tema: string, caminho: string): Promise<Medida> {
  const medido = (await page.evaluate(MEDIR)) as {
    overflow: number;
    contraste: Medida["contraste"];
    toque: Medida["toque"];
  };
  const axe = await new AxeBuilder({ page }).analyze();
  const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  return {
    rota,
    urlFinal: page.url().replace(BASE, ""),
    tema,
    largura: page.viewportSize()?.width ?? 0,
    overflow: medido.overflow,
    h1: await page.locator("h1").first().textContent().catch(() => null),
    redirecionou: page.url().replace(BASE, "") !== caminho,
    console: [],
    toque: medido.toque,
    contraste: medido.contraste,
    axe: {
      critica: axe.violations.filter((v) => v.impact === "critical").length,
      seria: axe.violations.filter((v) => v.impact === "serious").length,
      ids: graves.map((v) => `${v.id} (${v.impact})`),
      nos: graves.flatMap((v) => v.nodes.slice(0, 2).map((n) => `${v.id}: ${n.target.join(" ")}`)),
    },
  };
}

async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();
  const medidas: Medida[] = [];

  for (const tema of ["light", "dark"] as const) {
    for (const tamanho of TAMANHOS) {
      const contexto = await browser.newContext({
        viewport: { width: tamanho.width, height: tamanho.height },
        deviceScaleFactor: 1,
        locale: "pt-BR",
      });
      await contexto.addInitScript((t) => {
        window.localStorage.setItem("nexus-theme", t);
      }, tema);

      const page = await contexto.newPage();
      for (const rota of ROTAS_DA_VEZ) {
        const erros: string[] = [];
        // RUÍDO DE INSTRUMENTO, não da tela: o alvo é um `next dev`, e cada
        // contexto novo abre um HMR que o servidor (ocupado) recusa. Sem este
        // filtro, toda rota "tem erro de console" e o número não mede nada.
        const ruido = (texto: string) =>
          /_next\/hmr|WebSocket connection|Download the React DevTools|Fast Refresh/i.test(texto);
        const aoConsole = (m: { type: () => string; text: () => string }) => {
          if (m.type() !== "error") return;
          const t = m.text().slice(0, 200);
          if (!ruido(t)) erros.push(t);
        };
        const aoErro = (e: Error) => {
          const t = String(e).slice(0, 200);
          if (!ruido(t)) erros.push(t);
        };
        page.on("console", aoConsole);
        page.on("pageerror", aoErro);

        const m = await (async (): Promise<Medida> => {
          try {
            await page.goto(`${BASE}${rota.path}`, {
              waitUntil: "domcontentloaded",
              timeout: 120_000,
            });
            // A régua nova: o <h1> é o sinal de que a TELA (e não o redirect)
            // renderizou. Timeout curto e registrado; `urlFinal` prova o destino.
            try {
              await page.locator("h1").first().waitFor({ timeout: 15_000 });
            } catch {
              erros.push("sem <h1> em 15s");
            }
            try {
              await page.getByText(rota.espera).first().waitFor({ timeout: 15_000 });
            } catch {
              // sem sinal: mede o que renderizou
            }
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(RAIZ, `${rota.slug}_${tema}_${tamanho.nome}.png`) });
            return await medir(page, rota.slug, tema, rota.path);
          } catch (e) {
            // Rota que não carrega é ACHADO, não motivo para derrubar as outras
            // 63 medições.
            return {
              rota: rota.slug,
              urlFinal: page.url().replace(BASE, ""),
              tema,
              largura: tamanho.width,
              overflow: 0,
              h1: null,
              redirecionou: false,
              console: [`navegação: ${String(e).slice(0, 160)}`],
              toque: { total: 0, pequenos: 0, exemplos: [] },
              contraste: { total: 0, abaixo: 0, piores: [] },
              axe: { critica: 0, seria: 0, ids: [], nos: [] },
            };
          }
        })();
        m.console = [...m.console, ...erros];
        medidas.push(m);

        const linhas = [
          `${rota.slug.padEnd(16)} ${tema}/${tamanho.nome}`,
          `overflow=${m.overflow}`,
          `contraste=${m.contraste.abaixo}/${m.contraste.total}`,
          `axe=${m.axe.critica}/${m.axe.seria}`,
          `toque=${m.toque.pequenos}/${m.toque.total}`,
          `h1=${m.h1 ? "sim" : "nao"}`,
          `redir=${m.redirecionou ? m.urlFinal : "nao"}`,
          `console=${m.console.length}`,
          `url=${m.urlFinal}`,
        ];
        console.info(linhas.join("  "));
        if (m.overflow > 0 || m.contraste.abaixo > 0 || m.axe.critica > 0 || m.console.length > 0) {
          for (const p of m.contraste.piores.slice(0, 3)) {
            console.info(`   contraste ${p.razao}:1 (piso ${p.piso}) ${p.seletor} "${p.texto}" ${p.cor} sobre ${p.fundo}`);
          }
          for (const id of m.axe.ids.slice(0, 3)) console.info(`   axe ${id}`);
          for (const e of m.console.slice(0, 2)) console.info(`   console ${e}`);
        }

        page.off("console", aoConsole);
        page.off("pageerror", aoErro);
      }
      await contexto.close();
    }
  }

  writeFileSync(
    path.join(RAIZ, "medidas.json"),
    JSON.stringify({ base: BASE, rotulo: ROTULO, medidas }, null, 2),
  );
  await browser.close();

  const ruins = medidas.filter(
    (m) => m.overflow > 0 || m.contraste.abaixo > 0 || m.axe.critica > 0 || m.console.length > 0,
  ).length;
  console.info(`\n${medidas.length} medições · ${ruins} com achado · capturas em ${RAIZ}`);
  // Sai ≠ 0 quando há achado: o instrumento é a régua, não o relatório.
  process.exit(ruins > 0 ? 1 : 0);
}

void main();
