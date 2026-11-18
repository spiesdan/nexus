/**
 * CAPTURA DAS TELAS PÚBLICAS — sem sessão, nos dois temas e nas duas larguras.
 *
 * ─── POR QUE UM INSTRUMENTO À PARTE ───────────────────────────────────────
 *
 * `captura-visual.mjs` (o da varredura grande) exige `--estado`, um
 * `storageState` logado — e metade das telas que interessam a uma medição de
 * contraste SEM banco de pé é justamente a pública: `/login`, `/signup`, `/403`,
 * `/500`. Sem esta porta, quem quer medir o que o visitante vê precisa subir
 * Supabase, semear e logar para depois abrir a tela que não pede login.
 *
 * ─── O QUE A CAPTURA PROVA, E O QUE NÃO ───────────────────────────────────
 *
 * Prova que a tela ABRE e como ela se parece naquele commit, naquele tema,
 * naquela largura. Não é medida de contraste: quem mede é `contraste.mjs`, que
 * lê a cor computada de cada texto. As duas evidências se complementam — uma
 * mostra, a outra conta.
 *
 * O tema é semeado ANTES do primeiro paint (`nexus-theme`), o mesmo caminho do
 * `ThemeProvider`; sem isso a captura "clara" sairia escura, porque o produto é
 * dark-first.
 *
 * Uso (com o app rodando):
 *   AUDIT_BASE_URL=http://localhost:3021 node scripts/auditoria/captura-publica.mjs \
 *     --rotas /login,/signup --larguras 1440,390
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = path.join(RAIZ, "docs", "auditoria", "capturas");

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) args.set(argv[i], argv[i + 1]);
  }
}

const rotas = String(args.get("--rotas") ?? "/login").split(",").filter(Boolean);
const larguras = String(args.get("--larguras") ?? "1440,390")
  .split(",")
  .map((v) => Number(v))
  .filter((v) => Number.isFinite(v) && v > 0);
const temas = ["dark", "light"];

mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();
const registros = [];

for (const rota of rotas) {
  for (const tema of temas) {
    for (const largura of larguras) {
      const altura = largura >= 1000 ? 900 : 844;
      const contexto = await navegador.newContext({
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
      const nome = `${rota.replace(/^\//, "").replace(/[/?=]+/g, "_") || "raiz"}_${tema}_${largura}.png`;
      try {
        await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        // `document.fonts.ready` + um respiro: sem isso a captura pega a fonte
        // de fallback e a comparação entre duas rodadas vira ruído.
        await pagina.evaluate(() => document.fonts?.ready);
        await pagina.waitForTimeout(800);

        const medida = await pagina.evaluate(() => {
          const raiz = document.documentElement;
          return {
            tema: raiz.getAttribute("data-theme"),
            titulo: document.title,
            h1: [...document.querySelectorAll("h1")].map((el) => el.textContent?.trim()),
            overflowX: Math.max(0, raiz.scrollWidth - raiz.clientWidth),
            // Prova de que a árvore pintou: quantos elementos com texto próprio.
            textos: [...document.querySelectorAll("body *")].filter(
              (el) => el.children.length === 0 && (el.textContent ?? "").trim().length > 1,
            ).length,
          };
        });

        await pagina.screenshot({ path: path.join(SAIDA, nome), fullPage: false });
        registros.push({ rota, tema, largura, arquivo: nome, ...medida });
        process.stdout.write(
          `${rota.padEnd(12)} ${tema.padEnd(6)} ${String(largura).padStart(4)}px · tema=${medida.tema}` +
            ` · h1=${JSON.stringify(medida.h1)} · textos=${medida.textos} · overflow=${medida.overflowX}\n`,
        );
      } catch (erro) {
        registros.push({ rota, tema, largura, arquivo: null, erro: String(erro).slice(0, 200) });
        process.stdout.write(`${rota} ${tema} ${largura}px · ERRO ${String(erro).slice(0, 120)}\n`);
      } finally {
        await contexto.close();
      }
    }
  }
}

await navegador.close();
const arquivo = path.join(SAIDA, "captura-publica.json");
writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, registros }, null, 2) + "\n");
process.stdout.write(`\n→ ${path.relative(RAIZ, arquivo)}\n`);
