/**
 * O MEDIDOR COMPARTILHADO dos passes de design.
 *
 * Uma régua só: contraste WCAG calculado sobre o que está PINTADO (cor
 * computada × fundo efetivo composto com alfa), overflow e axe. Os scripts de
 * captura importam daqui em vez de manter cada um a sua cópia — duas réguas
 * divergem na primeira correção.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export interface AchadoDeContraste {
  seletor: string;
  texto: string;
  razao: number;
  piso: number;
  cor: string;
  fundo: string;
  fonte: string;
}

export interface Medida {
  rota: string;
  urlFinal: string;
  tema: string;
  largura: number;
  overflow: number;
  console: string[];
  contraste: { total: number; abaixo: number; piores: AchadoDeContraste[] };
  axe: { critica: number; seria: number; ids: string[]; nos: string[] };
  /** h1 da tela, lido com timeout — a prova de que a TELA certa renderizou. */
  h1?: string | null;
  /** O h1 esperado casou e o destino do redirect confere. */
  medidaOk?: boolean;
  /** Quando `medidaOk` é falso: por que esta linha NÃO conta como medida. */
  motivoNaoMedido?: string | null;
}

/**
 * MEDIÇÃO NO BROWSER — vai como STRING (mesmo motivo do captura-inbox: `tsx`
 * injeta `__name` nas funções nomeadas e o `page.evaluate` quebraria).
 */
export const MEDIR = `(() => {
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
  abaixo.sort((a, b) => a.razao - b.razao);
  return {
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    contraste: { total, abaixo: abaixo.length, piores: abaixo.slice(0, 8) },
  };
})()`;

export async function medir(page: Page, rota: string, tema: string): Promise<Medida> {
  const medido = (await page.evaluate(MEDIR)) as {
    overflow: number;
    contraste: Medida["contraste"];
  };
  const axe = await new AxeBuilder({ page }).analyze();
  const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  return {
    rota,
    urlFinal: page.url().replace(/^https?:\/\/[^/]+/, ""),
    tema,
    largura: page.viewportSize()?.width ?? 0,
    overflow: medido.overflow,
    console: [],
    contraste: medido.contraste,
    axe: {
      critica: axe.violations.filter((v) => v.impact === "critical").length,
      seria: axe.violations.filter((v) => v.impact === "serious").length,
      ids: graves.map((v) => `${v.id} (${v.impact})`),
      nos: graves.flatMap((v) => v.nodes.slice(0, 2).map((n) => `${v.id}: ${n.target.join(" ")}`)),
    },
  };
}

