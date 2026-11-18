/**
 * CONTRASTE — o que o olho acostumado não vê mais.
 *
 * ─── POR QUE NO NAVEGADOR, E NÃO NO CSS ────────────────────────────────────
 *
 * Ler o token (`--text-muted`) e comparar com `--bg` daria um número bonito e
 * falso: o produto usa opacidade, `text-muted-foreground` sobre `bg-card`,
 * `bg-muted` sobre `bg`, e texto dentro de badge com fundo próprio. O contraste
 * que a pessoa vê é a razão entre a cor FINAL do texto e o fundo REAL atrás
 * dele — e isso só o layout sabe.
 *
 * ─── COMO A CONTA É FEITA ──────────────────────────────────────────────────
 *
 * Para cada elemento com texto próprio:
 *   1. cor do texto = `color` computado;
 *   2. fundo = sobe a árvore até achar um `background-color` com alfa > 0 e
 *      compõe com o que estiver atrás (alfa sobre alfa é conta, não média);
 *   3. razão = (L1 + 0.05) / (L2 + 0.05), com luminância relativa do WCAG.
 *
 * Limiares: **4.5:1** para texto normal, **3:1** para texto grande (≥ 24 px, ou
 * ≥ 18.66 px em negrito) — os mesmos números do WCAG 2.1 AA.
 *
 * ─── O QUE ELE NÃO CONSEGUE VER, E DIZ ISSO ───────────────────────────────
 *
 *   `background-image` (gradiente, foto): a cor por baixo não é uma cor. Esses
 *   elementos são CONTADOS e listados como "não medidos", não como aprovados —
 *   aprovar o que não se mediu é o defeito que esta auditoria mais combate.
 *   Elemento com `opacity` < 0.95 também fica de fora: `opacity` não entra em
 *   `color`, e compor à mão exigiria saber a ordem de pintura.
 *
 * Uso:
 *   node scripts/auditoria/contraste.mjs --estado /tmp/sessao.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = path.join(RAIZ, "docs", "auditoria", "capturas");

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--"))
      args.set(argv[i], argv[i + 1]?.startsWith("--") ? true : argv[++i]);
  }
}
const estado = args.get("--estado");
if (!estado || !existsSync(estado)) {
  console.error("falta --estado <storageState.json>");
  process.exit(2);
}

/** Telas onde texto pequeno e denso vive: listas, painéis, configuração. */
/**
 * `--rotas a,b,c` restringe a varredura. Existe porque nem sempre há sessão:
 * sem Supabase de pé (ou sem seed), `/app/**` redireciona para `/login` e o
 * instrumento mediria a MESMA tela oito vezes com oito nomes — o tipo de número
 * que parece cobertura e não é.
 */
const ROTAS = (args.get("--rotas") ?? "").split(",").filter(Boolean).length
  ? String(args.get("--rotas")).split(",")
  : [
      "/app",
      "/app/pedidos",
      "/app/contacts",
      "/app/kanban",
      "/app/audit",
      "/app/settings/tenant",
      "/app/indicadores",
      "/login",
    ];

const navegador = await chromium.launch();
const resultados = [];

/**
 * O TEMA ERA O PONTO CEGO.
 *
 * A versão anterior abria a página sem tocar em `nexus-theme`, e o produto é
 * dark-first (`app/layout.tsx` fixa `dark` antes do primeiro paint). Ou seja:
 * as 258 medições de 17/11/2026 descreviam **só o tema escuro** — e o claro,
 * que qualquer pessoa liga no menu, nunca era medido. Foi assim que
 * `--color-text-subtle: #999999` sobreviveu no claro a 2,85:1 com 74 usos de
 * texto: o instrumento não olhava para lá e o número publicado ("0 reprovados")
 * parecia cobrir os dois temas.
 *
 * Agora cada rota é medida nos dois temas, e o registro diz QUAL. Uma execução
 * que só mede metade do produto não pode se chamar de varredura de contraste.
 */
const TEMAS = ["dark", "light"];

/** Semeia a preferência ANTES do primeiro paint, como o ThemeProvider faz. */
async function aplicarTema(contexto, tema) {
  await contexto.addInitScript((escolhido) => {
    try {
      window.localStorage.setItem("nexus-theme", escolhido);
    } catch {
      /* modo privado */
    }
  }, tema);
}

for (const rota of ROTAS) {
  for (const tema of TEMAS) {
    const contexto = await navegador.newContext({
      storageState: rota === "/login" ? undefined : estado,
      viewport: { width: 1440, height: 900 },
      locale: "pt-BR",
    });
    await aplicarTema(contexto, tema);
    const pagina = await contexto.newPage();
    const registro = { rota, tema };
    try {
      await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await pagina.waitForTimeout(2_000);
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
        /** Fundo REAL atrás do elemento, compondo alfa. */
        const fundoDe = (el) => {
          let atual = el;
          let acumulado = null;
          while (atual) {
            const cs = getComputedStyle(atual);
            if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // gradiente/foto
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
        const todos = [...document.querySelectorAll("body *")];
        for (const el of todos) {
          // Só quem tem texto PRÓPRIO (filho direto), não o container.
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
            tag: el.tagName.toLowerCase(),
            tamanho,
            razao: Math.round(valor * 100) / 100,
            minimo,
            passa: valor >= minimo,
            // As CORES entram no registro: sem elas, um 1,95:1 vira acusação que
            // ninguém consegue conferir — e a primeira obrigação de um número
            // assim é ser auditável por quem discorda.
            corTexto: `rgba(${Math.round(texto.r)},${Math.round(texto.g)},${Math.round(texto.b)},${texto.a})`,
            corFundo: `rgb(${Math.round(fundo.r)},${Math.round(fundo.g)},${Math.round(fundo.b)})`,
            classe: (el.className || "").toString().slice(0, 80),
          });
        }
        const ruins = textos.filter((t) => !t.passa).sort((a, b) => a.razao - b.razao);
        return {
          medidos: textos.length,
          naoMedidosPorImagem: foraPorImagem.length,
          reprovados: ruins.length,
          piores: ruins.slice(0, 8),
        };
      });
    } catch (e) {
      registro.erro = String(e).slice(0, 160);
    }
    resultados.push(registro);
    await contexto.close();
  }
}

await navegador.close();
const arquivo = path.join(SAIDA, "contraste.json");

/**
 * O ARTEFATO É MESCLADO, NÃO SOBRESCRITO.
 *
 * Uma execução parcial (só `/login`, porque não há sessão) apagava as 8 rotas
 * da execução anterior — o defeito V-33, corrigido no instrumento de captura e
 * que continuava aqui. A chave é `rota|tema`: a mesma dupla é substituída pela
 * medição nova, o resto sobrevive.
 *
 * Medições antigas (antes de o instrumento medir os dois temas) não têm `tema`
 * e entram como `dark`, que é onde foram feitas — o produto é dark-first.
 */
const anterior = existsSync(arquivo)
  ? JSON.parse(readFileSync(arquivo, "utf8"))
  : { resultados: [] };
const porChave = new Map();
for (const r of anterior.resultados ?? []) porChave.set(`${r.rota}|${r.tema ?? "dark"}`, r);
for (const r of resultados) porChave.set(`${r.rota}|${r.tema}`, r);
const mesclados = [...porChave.values()].sort(
  (a, b) => String(a.rota).localeCompare(String(b.rota)) || String(a.tema).localeCompare(String(b.tema)),
);

writeFileSync(
  arquivo,
  JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, resultados: mesclados }, null, 2) +
    "\n",
);
process.stdout.write(`\nartefato com ${mesclados.length} medições (mesclado)\n`);

for (const tema of TEMAS) {
  const doTema = resultados.filter((r) => r.tema === tema);
  let medidos = 0;
  let reprovados = 0;
  process.stdout.write(`\n══ tema ${tema} ══\n`);
  for (const r of doTema) {
    const m = r.medida ?? {};
    medidos += m.medidos ?? 0;
    reprovados += m.reprovados ?? 0;
    process.stdout.write(
      `${r.rota.padEnd(24)} medidos=${String(m.medidos ?? "-").padStart(3)} reprovados=${String(m.reprovados ?? "-").padStart(3)}` +
        ` não-medidos(imagem)=${m.naoMedidosPorImagem ?? "-"}` +
        (r.erro ? `  ERRO ${r.erro}` : "") +
        "\n",
    );
    for (const p of (m.piores ?? []).slice(0, 3)) {
      process.stdout.write(`    ${p.razao}:1 (mín ${p.minimo}) ${p.tamanho}px "${p.amostra}"\n`);
    }
  }
  // Os dois temas entram no TOTAL. Um número agregado que mistura os temas sem
  // dizer qual reprovou transforma um defeito do claro em "quase tudo bem".
  process.stdout.write(`TOTAL ${tema}: ${reprovados} de ${medidos} textos abaixo do mínimo\n`);
}
process.stdout.write(`\n→ ${arquivo.replace(RAIZ + "/", "")}\n`);
