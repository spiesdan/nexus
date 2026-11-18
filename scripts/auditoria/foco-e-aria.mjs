/**
 * FOCO E ARIA POR TELA — o que o contraste não mede.
 *
 * Contraste diz se o texto se lê; não diz se o teclado ACHA o caminho. Este
 * instrumento abre a tela já logada e responde cinco perguntas objetivas:
 *
 *   1. o primeiro Tab cai no atalho "Pular para o conteúdo", e ele fica
 *      VISÍVEL ao receber foco? (sem isso, quem usa teclado atravessa a
 *      navegação inteira em toda tela)
 *   2. existe exatamente um `<h1>` — a âncora de navegação por cabeçalho?
 *   3. o item ativo da navegação declara `aria-current="page"`?
 *   4. algum controle focável está SEM nome acessível? (heurística: aria-label,
 *      aria-labelledby, texto, title ou <label> associado)
 *   5. o anel de foco tem espessura e cor próprias (não `none`)?
 *
 * Uso:
 *   AUDIT_BASE_URL=http://localhost:3021 node scripts/auditoria/foco-e-aria.mjs \
 *     --estado /tmp/aaa-state.json --rotas /app,/app/pedidos
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = path.join(RAIZ, "docs", "auditoria", "capturas");

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) args.set(argv[i], argv[i + 1]?.startsWith("--") ? true : argv[++i]);
  }
}

const estado = args.get("--estado");
if (!estado) {
  console.error("falta --estado <storageState.json>");
  process.exit(2);
}

const rotas = String(args.get("--rotas") ?? "/app").split(",").filter(Boolean);
const temas = ["dark", "light"];

const navegador = await chromium.launch();
const registros = [];

for (const tema of temas) {
  for (const rota of rotas) {
    const contexto = await navegador.newContext({
      storageState: estado,
      viewport: { width: 1440, height: 900 },
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
    const registro = { rota, tema };
    try {
      await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await pagina.waitForTimeout(1_500);

      registro.antesDoTab = await pagina.evaluate(() => {
        const foco = document.activeElement;
        const visivel = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        };
        const nomeDe = (el) => {
          const aria = el.getAttribute("aria-label");
          if (aria && aria.trim()) return aria.trim();
          const rotuladoPor = el.getAttribute("aria-labelledby");
          if (rotuladoPor) {
            const alvo = document.getElementById(rotuladoPor);
            if (alvo?.textContent?.trim()) return alvo.textContent.trim();
          }
          const texto = (el.textContent ?? "").trim();
          if (texto) return texto;
          const titulo = el.getAttribute("title");
          if (titulo?.trim()) return titulo.trim();
          const id = el.getAttribute("id");
          if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return "label";
          return null;
        };

        const focaveis = [
          ...document.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ),
        ].filter((el) => visivel(el) && !el.closest('[aria-hidden="true"]'));

        const semNome = focaveis.filter((el) => !nomeDe(el)).map((el) => el.tagName.toLowerCase());

        return {
          h1: [...document.querySelectorAll("h1")].map((el) => el.textContent?.trim()),
          ariaCurrent: document.querySelectorAll('[aria-current="page"]').length,
          semNome: semNome.length,
          semNomeAmostra: semNome.slice(0, 5),
          focaveis: focaveis.length,
          focoInicial: foco?.tagName?.toLowerCase() ?? null,
        };
      });

      // 1) primeiro Tab: o atalho precisa existir E ficar visível ao focar.
      await pagina.keyboard.press("Tab");
      await pagina.waitForTimeout(150);
      registro.primeiroTab = await pagina.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          texto: (el.textContent ?? "").trim().slice(0, 40),
          largura: Math.round(r.width),
          altura: Math.round(r.height),
          visivel: r.width > 1 && r.height > 1 && cs.visibility !== "hidden",
          outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        };
      });

      // 5) anel de foco num link da navegação
      registro.anelDoMenu = await pagina.evaluate(() => {
        const link = document.querySelector('nav a[href^="/app"]');
        if (!link) return null;
        link.focus();
        const cs = getComputedStyle(link);
        return {
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow.slice(0, 60),
        };
      });

      registros.push(registro);
      process.stdout.write(
        `${rota.padEnd(18)} ${tema.padEnd(6)} h1=${registro.antesDoTab.h1.length}` +
          ` aria-current=${registro.antesDoTab.ariaCurrent}` +
          ` semNome=${registro.antesDoTab.semNome}` +
          ` tab="${registro.primeiroTab?.texto ?? "-"}" visível=${registro.primeiroTab?.visivel}` +
          ` anel=${registro.anelDoMenu?.outlineStyle}/${registro.anelDoMenu?.outlineWidth}\n`,
      );
    } catch (erro) {
      registro.erro = String(erro).slice(0, 180);
      registros.push(registro);
      process.stdout.write(`${rota} ${tema} · ERRO ${registro.erro}\n`);
    } finally {
      await contexto.close();
    }
  }
}

await navegador.close();
const arquivo = path.join(SAIDA, "foco-e-aria.json");
writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, registros }, null, 2) + "\n");
process.stdout.write(`\n→ ${path.relative(RAIZ, arquivo)}\n`);
