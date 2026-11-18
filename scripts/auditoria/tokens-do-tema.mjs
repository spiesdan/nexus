/**
 * OS TOKENS DO TEMA EM NÚMEROS — fase 3 medida no CSS, não no Figma.
 *
 * ─── O QUE O PROMPT PEDE (itens 3.2 a 3.12) ────────────────────────────────
 *
 *   - tokens claros e escuros (canvas, surface, text, border…);
 *   - aliases semânticos de estado/interação;
 *   - tipografia própria (sem depender de fonte do sistema) com escala curta;
 *   - espaçamento base 4;
 *   - raios 6/10/14;
 *   - sombras sutis;
 *   - movimento 120–220 ms + reduced motion.
 *
 * ─── O QUE ESTE INSTRUMENTO MEDE ──────────────────────────────────────────
 *
 * Lê `app/globals.css` e conta/extrai: tokens por bloco de tema, famílias de
 * fonte declaradas, escala de raio, escala de sombra, durações de movimento e se
 * a preferência `prefers-reduced-motion` é respeitada. Nada aqui julga a
 * INTENÇÃO do design; compara com os números que o prompt fixou e mostra a
 * diferença — quem lê decide se é divergência ou decisão.
 *
 * Uso:
 *   node scripts/auditoria/tokens-do-tema.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const CSS = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
const SAIDA = "docs/auditoria/capturas/tokens-do-tema.json";

/** Blocos de tema: `:root`, `[data-theme="light"]`, `[data-theme="dark"]`.
 *
 * O seletor tem de estar no COMEÇO DA LINHA. A versão anterior usava
 * `CSS.indexOf('[data-theme="dark"]')` e achava a primeira ocorrência — que é o
 * `@custom-variant dark (&:where([data-theme="dark"], …))` lá em cima. O recorte
 * ia dali até o primeiro `\n}` seguinte, ou seja, o bloco `:root` INTEIRO: a
 * coluna "dark" do artefato era a coluna clara com outro nome, e a afirmação de
 * que "os três blocos têm o mesmo conjunto de 127 tokens, sem tema de segunda
 * classe" nunca foi medida — era o instrumento comparando o claro consigo mesmo.
 */
function blocoDeTema(seletor) {
  const i = CSS.search(new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"));
  if (i < 0) return "";
  const fim = CSS.indexOf("\n}", i);
  return CSS.slice(i, fim < 0 ? undefined : fim);
}

const temas = {
  claro: blocoDeTema(":root {"),
  light: blocoDeTema('[data-theme="light"]'),
  dark: blocoDeTema('[data-theme="dark"]'),
};

const tokens = (texto) =>
  [...texto.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]).filter(Boolean);

const porTema = Object.fromEntries(
  Object.entries(temas).map(([nome, texto]) => [nome, tokens(texto).length]),
);

const valores = (texto, padrao) =>
  [...texto.matchAll(padrao)].map((m) => ({ nome: m[1], valor: m[2] }));

const raios = valores(temas.claro, /(--radius-[a-z0-9-]+)\s*:\s*([^;]+);/g);
const sombras = valores(temas.claro, /(--shadow-[a-z0-9-]+)\s*:\s*([^;]+);/g);
const duracoes = valores(temas.claro, /(--duration-[a-z0-9-]+)\s*:\s*([^;]+);/g);

const fontes = [...CSS.matchAll(/--font-(sans|mono)\s*:\s*([\s\S]*?);/g)].map((m) => ({
  nome: m[1],
  pilha: m[2].replace(/\s+/g, " ").trim().slice(0, 160),
}));

// A tipografia é "própria" se a primeira da pilha é uma variável de fonte do
// next/font (--font-inter/--font-mono), não a do sistema.
const propria = fontes.every((f) => f.pilha.startsWith("var(--font-"));

// Espaçamento base 4: a escala do produto é declarada em `--space-N` (4, 8, 12,
// 16, 20, 24, 32…) e mapeada para as utilities em `--spacing-N`. O Tailwind v4
// calcula pelo multiplicador `--spacing` (0.25rem), então o que se confere é a
// escala, não a existência da variável.
const escalaDeEspaco = [...CSS.matchAll(/--space-([0-9]+):\s*([0-9]+)px/g)].map((m) => Number(m[2]));
const gradeBase4 = escalaDeEspaco.length > 0 && escalaDeEspaco.every((v) => v % 4 === 0);

const reducedMotion = /prefers-reduced-motion/.test(CSS);

/**
 * CONTRASTE DOS PAPÉIS DE TEXTO — a conta que faltava.
 *
 * Este instrumento contava tokens e nunca media um par. A consequência apareceu
 * em 18/11/2026: o tema CLARO tinha `--color-text-subtle: #999999` a **2,85:1**
 * sobre a surface, com 74 usos de texto, e nenhum artefato de auditoria dizia
 * isso — o instrumento de navegador (`contraste.mjs`) rodava no tema padrão
 * (escuro) e o gate estático excluía o token como "decoração".
 *
 * A conta é a do WCAG: luminância relativa, (L1+0,05)/(L2+0,05), 4,5:1 para
 * texto normal. Fundos = os três de página que o produto usa. Um token que não
 * resolve para hex entra como `naoMedido`, nunca como aprovado.
 */
const FUNDOS_DE_PAGINA = ["--color-bg", "--color-surface", "--color-surface-elevated"];
const PAPEIS_DE_TEXTO = ["--color-text", "--color-text-muted", "--color-text-subtle"];
const MINIMO_AA = 4.5;

const hexDoToken = (texto, nome) => {
  const m = new RegExp(`${nome}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(texto);
  return m ? m[1].toLowerCase() : null;
};

const luminancia = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  );
};

const razaoDeContraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const contrasteDosTextos = Object.fromEntries(
  Object.entries(temas).map(([nome, texto]) => {
    const pares = [];
    for (const papel of PAPEIS_DE_TEXTO) {
      const cor = hexDoToken(texto, papel);
      if (!cor) {
        pares.push({ papel, fundo: null, razao: null, passa: null, motivo: "token ausente" });
        continue;
      }
      for (const fundo of FUNDOS_DE_PAGINA) {
        const bg = hexDoToken(texto, fundo);
        if (!bg) {
          pares.push({ papel, fundo, razao: null, passa: null, motivo: "fundo ausente" });
          continue;
        }
        const razao = Math.round(razaoDeContraste(cor, bg) * 100) / 100;
        pares.push({ papel, fundo, razao, passa: razao >= MINIMO_AA });
      }
    }
    return [nome, pares];
  }),
);

const reprovasDeContraste = Object.entries(contrasteDosTextos).flatMap(([tema, pares]) =>
  pares.filter((p) => p.passa === false).map((p) => `${tema}: ${p.papel} sobre ${p.fundo} = ${p.razao}:1`),
);

// Escala tipográfica declarada (utilities com font-size próprio).
const escalas = [...new Set([...CSS.matchAll(/font-size:\s*([0-9.]+px)/g)].map((m) => m[1]))].sort(
  (a, b) => parseFloat(a) - parseFloat(b),
);

const resumo = {
  tokensPorTema: porTema,
  fontes,
  tipografiaPropria: propria,
  gradeBase4,
  escalaDeEspaco,
  raios: raios.map((r) => `${r.nome}=${r.valor.trim()}`),
  sombras: sombras.map((s) => `${s.nome}=${s.valor.trim().slice(0, 40)}`),
  duracoes: duracoes.map((d) => `${d.nome}=${d.valor.trim()}`),
  reducedMotion,
  escalasDeFonteNoCss: escalas,
  contrasteDosTextos,
  reprovasDeContraste,
};

writeFileSync(
  join(RAIZ, SAIDA),
  JSON.stringify({ medido_em: new Date().toISOString(), resumo }, null, 2) + "\n",
);

console.log(`tokens por tema: ${JSON.stringify(porTema)}`);
console.log(`tipografia própria (next/font): ${propria ? "sim" : "não"} · grade base 4: ${gradeBase4 ? "sim" : "não"} (${escalaDeEspaco.join(", ")} px) · reduced motion: ${reducedMotion ? "sim" : "NÃO"}`);
console.log(`raios: ${resumo.raios.join(" · ")}`);
console.log(`sombras: ${sombras.length} níveis`);
console.log(`durações: ${resumo.duracoes.join(" · ")}`);
console.log(`escalas de fonte declaradas no CSS: ${escalas.join(", ") || "nenhuma"}`);
console.log(
  `contraste de texto (AA ${MINIMO_AA}:1): ${
    reprovasDeContraste.length === 0 ? "todos passam" : `${reprovasDeContraste.length} reprovas`
  }`,
);
for (const r of reprovasDeContraste) console.log(`  ✗ ${r}`);
console.log(`\nartefato: ${SAIDA}`);
