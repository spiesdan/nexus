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
/**
 * `--estado` opcional: com ele a captura cobre telas AUTENTICADAS, sem ele
 * continua servindo às públicas. O nome do arquivo ganha o prefixo `app_` para
 * não colidir com uma captura pública de mesmo caminho.
 */
const estado = args.get("--estado");
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
        ...(estado ? { storageState: estado } : {}),
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
        /*
         * ESPERAR O `<h1>`, NÃO UM TEMPO FIXO.
         *
         * Telas que buscam dado no cliente renderizam o cabeçalho DEPOIS do
         * fetch. Com 800 ms fixos, três subtelas de expedição foram capturadas
         * sem `<h1>` e o artefato dizia "h1: []" — um defeito que não existia
         * (medido de novo com 4 s: todas têm). A captura passa a esperar o
         * título aparecer (até 8 s) e registra quanto esperou; se não vier,
         * registra `esperouH1Ms: null` e a captura vale como "sem título".
         */
        const t0 = Date.now();
        await pagina
          .waitForFunction(() => document.querySelector("h1") !== null, undefined, { timeout: 8000 })
          .catch(() => {});
        const esperouH1Ms = (await pagina.evaluate(() => document.querySelector("h1") !== null))
          ? Date.now() - t0
          : null;

        /*
         * ESPERAR A TELA, NÃO SÓ O TÍTULO.
         *
         * Telas que buscam dado no cliente pintam o `<h1>` e deixam o corpo num
         * esqueleto ("Carregando rota…"). Medido em 19/11/2026: a rota da carga
         * saía na captura como um retângulo cinza vazio — o artefato provava o
         * contrário do que a tela faz. Aqui a espera é pelo fim do esqueleto, e
         * o tempo fica registrado (`esperouTelaMs`); se não terminar, a captura
         * vale como "ainda carregando" e isso aparece no JSON.
         */
        const t1 = Date.now();
        /*
         * ESPERAR O ESQUELETO SAIR — não só o texto.
         *
         * `NexusDataTable` em `state="loading"` pinta blocos `animate-pulse` e
         * NÃO escreve "Carregando": em 19/11/2026 a captura de `/app/estoque`
         * saiu com a tabela em esqueleto mesmo depois de 25 s de espera por
         * texto, e o artefato dizia "0 problemas" numa tela que ainda não
         * tinha dado. Aqui a espera é pelo ÚLTIMO dos dois sinais.
         */
        await pagina
          .waitForFunction(
            () =>
              !/Carregando|Compilando|Preparando/.test(document.body.innerText ?? "") &&
              document.querySelector('[class*="animate-pulse"]') === null,
            undefined,
            { timeout: 30000 },
          )
          .catch(() => {});
        const esperouTelaMs = /Carregando|Compilando|Preparando/.test(
          await pagina.evaluate(() => document.body.innerText ?? ""),
        )
          ? null
          : Date.now() - t1;
        await pagina.waitForTimeout(900);

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
        registros.push({ rota, tema, largura, arquivo: nome, esperouH1Ms, esperouTelaMs, ...medida });
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
