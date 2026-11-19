/**
 * CAPTURA E MEDIÇÃO DA LISTA DO INBOX — antes/depois do passe de design.
 *
 * Não é gate de CI: é o instrumento da prova. Mede o que a mudança promete
 * (hierarquia, densidade, estados) e o que ela NÃO pode quebrar (overflow,
 * axe, foco visível). A regra de evidência é a mesma das waves: se o alvo não
 * resolve, o script FALHA ALTO em vez de gerar artefato que não prova nada.
 *
 * Uso:
 *   BASE=http://127.0.0.1:3311 npx tsx tests/captura-inbox-lista.ts antes
 *   BASE=http://127.0.0.1:3311 npx tsx tests/captura-inbox-lista.ts depois
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3311";
const ROTULO = process.argv[2] ?? "antes";
const CREDS = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8"));
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-inbox-lista`);

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });

  /*
   * O LOGIN É UMA CORRIDA COM A HIDRATAÇÃO, e o instrumento tem de perdê-la
   * sem morrer.
   *
   * Com a página já compilada (segunda visita em diante), o HTML chega antes
   * de o React pendurar o `onSubmit`: o clique cai num submit NATIVO do
   * `<form method="post">`, o servidor responde 200 e a tela fica em /login —
   * sem erro, sem redirect, para sempre. `fill` + `click` do Playwright esperam
   * ação, não hidratação. Repetir o clique resolve as duas causas ao mesmo
   * tempo (hidratação e compilação lenta); falhar quatro vezes é defeito de
   * verdade e o script diz isso.
   */
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    await page.locator("#email").fill(CREDS.users.manager.email, { timeout: 120_000 });
    await page.locator("#password").fill(CREDS.password, { timeout: 120_000 });
    await page
      .getByRole("button", { name: /entrar/i })
      .first()
      .click();
    try {
      await page.waitForURL(/\/app\//, { timeout: 40_000 });
      return;
    } catch {
      // Sem navegação: o submit não foi tratado pelo cliente. Tenta de novo.
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error("login não concluiu após 4 tentativas (hidratação ou credencial)");
}

/** Abre uma conversa pela lista (a primeira da aba carregada). */
async function abrirConversa(page: Page): Promise<string> {
  const linha = page.locator("[data-conversation-id]").first();
  await linha.waitFor({ state: "visible", timeout: 30_000 });
  const id = await linha.getAttribute("data-conversation-id");
  await linha.click();
  await page.waitForTimeout(1200);
  return id ?? "";
}

interface Medida {
  aba: string;
  largura: number;
  tema: string;
  pagina: { scrollWidth: number; clientWidth: number; overflow: number };
  grade: { largura: number; scrollWidth: number } | null;
  colunaDaLista: number;
  blocoDeFiltros: number;
  linha: { altura: number; largura: number } | null;
  linhasNaTela: number;
  titulos: { h1: string[]; h2: string[] };
  tipografia: { nome: string; hora: string; previa: string } | null;
  foco: { alvo: string; outline: string; shadow: string } | null;
  axe: { critica: number; seria: number; ids: string[]; nos: string[] };
}

async function medir(page: Page, rotulo: string, tema: string, comFoco = true): Promise<Medida> {
  const pagina = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  }));

  const grade = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-realtime-status]");
    return el ? { largura: el.clientWidth, scrollWidth: el.scrollWidth } : null;
  });

  const coluna = await page.evaluate(() => {
    // A COLUNA DA LISTA — pela mãe do bloco de filtros, e não pelo
    // `firstElementChild` da grade: o primeiro filho é o `<h1 class="sr-only">`
    // ("Inbox"), que mede 1px. Medir o h1 diria "coluna de 1px" e ninguém
    // notaria que o número está errado.
    const busca = document.querySelector<HTMLInputElement>('input[aria-label="Buscar conversas"]');
    const bloco = busca?.closest<HTMLElement>("div.grid");
    const col = bloco?.parentElement as HTMLElement | null;
    return col ? Math.round(col.getBoundingClientRect().width) : 0;
  });

  // O bloco de filtros é o pai do campo de busca — o primeiro `div` da coluna.
  const filtros = await page.evaluate(() => {
    const busca = document.querySelector<HTMLInputElement>('input[aria-label="Buscar conversas"]');
    const bloco = busca?.closest<HTMLElement>("div.grid");
    return bloco ? Math.round(bloco.getBoundingClientRect().height) : 0;
  });

  const linha = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-conversation-id]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { altura: Math.round(r.height), largura: Math.round(r.width) };
  });

  const linhasNaTela = await page.evaluate(() => {
    const visiveis = [...document.querySelectorAll<HTMLElement>("[data-conversation-id]")].filter(
      (el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight + 1;
      },
    );
    return visiveis.length;
  });

  const titulos = await page.evaluate(() => ({
    h1: [...document.querySelectorAll("h1")].map((e) => (e.textContent ?? "").trim()),
    h2: [...document.querySelectorAll("h2")].map((e) => (e.textContent ?? "").trim()),
  }));

  /*
   * ESTA MEDIÇÃO VAI COMO STRING — e isso não é preguiça.
   *
   * `tsx` compila este arquivo com esbuild e `keepNames`, que injeta um
   * `__name(...)` em toda função NOMEADA. Uma arrow atribuída a `const` dentro
   * do callback do `page.evaluate` vira `__name` no código que o browser
   * executa — onde `__name` não existe: `ReferenceError: __name is not
   * defined`. String passa intacta por esse caminho. As outras medições não
   * têm função nomeada e vão como arrow normal.
   */
  const tipografia = (await page.evaluate(`(() => {
    var el = document.querySelector('[data-conversation-id]');
    if (!el) return null;
    var spans = Array.from(el.querySelectorAll('span'));
    var nome = spans.find(function (s) { return /font-(semibold|bold)/.test(s.className) && !s.querySelector('span'); });
    var hora = spans.find(function (s) { return /tabular-nums/.test(s.className) && !s.querySelector('span'); });
    var previa = el.querySelector('p');
    function fmt(n) {
      if (!n) return 'n/a';
      var c = getComputedStyle(n);
      return c.fontSize + '/' + c.fontWeight + ' ' + c.color;
    }
    return { nome: fmt(nome), hora: fmt(hora), previa: fmt(previa) };
  })()`)) as { nome: string; hora: string; previa: string } | null;

  // FOCO VISÍVEL na primeira linha: é o item que o teclado alcança primeiro.
  // Por TECLADO (`Tab`), não por `.focus()`: o anel dos componentes é
  // `:focus-visible`, que o foco programático não acende — medir assim diria
  // "sem anel" em componente que tem anel.
  let foco: Medida["foco"] = null;
  if (comFoco) await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; comFoco && i < 60 && !foco; i++) {
    await page.keyboard.press("Tab");
    foco = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.matches("[data-conversation-id]")) return null;
      const s = getComputedStyle(el);
      return {
        alvo: (el.textContent ?? "").trim().slice(0, 24),
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        shadow: s.boxShadow,
      };
    });
  }

  const axe = await new AxeBuilder({ page }).analyze();
  const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  return {
    aba: rotulo,
    largura: page.viewportSize()?.width ?? 0,
    tema,
    pagina,
    grade,
    colunaDaLista: coluna,
    blocoDeFiltros: filtros,
    linha,
    linhasNaTela,
    titulos,
    tipografia,
    foco,
    axe: {
      critica: axe.violations.filter((v) => v.impact === "critical").length,
      seria: axe.violations.filter((v) => v.impact === "serious").length,
      ids: graves.map((v) => `${v.id} (${v.impact})`),
      // O ALVO, não só a regra: "label-content-name-mismatch" sem o nó é um
      // achado que ninguém consegue corrigir.
      nos: graves.flatMap((v) => v.nodes.slice(0, 3).map((n) => `${v.id}: ${n.target.join(" ")}`)),
    },
  };
}

const medidas: Medida[] = [];

async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();

  /*
   * AQUECIMENTO — uma vez, antes de medir.
   *
   * Em `next dev` o primeiro POST de login compila a server action: nesta
   * máquina, com o repo inteiro competindo por CPU, isso passou de 2 minutos
   * numa rodada e o `waitForURL` estourou — o instrumento diria "não loga"
   * quando o que existe é compilação. Um login descartável paga a compilação
   * uma vez; as quatro medições seguintes rodam com o módulo quente.
   */
  const aquecimento = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await entrar(await aquecimento.newPage());
  await aquecimento.close();
  console.info("aquecimento: login compilado");

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
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") erros.push(m.text());
      });
      page.on("pageerror", (e) => erros.push(String(e)));

      await entrar(page);
      await page.goto(`${BASE}/app/inbox`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.locator("[data-conversation-id]").first().waitFor({ timeout: 120_000 });
      await page.waitForTimeout(900);

      // 1. LISTA — o recorte desta entrega.
      await page.screenshot({
        path: path.join(RAIZ, `lista_${tema}_${tamanho.nome}.png`),
      });
      const daLista = await medir(page, "lista", tema);
      medidas.push(daLista);

      // 2. BUSCA SEM RESULTADO — o estado vazio do filtro. Medido ANTES de
      //    abrir a conversa: no celular, a coluna da lista sai de cena quando há
      //    conversa aberta (`colunasDoCelular`), e o campo de busca fica
      //    invisível — o `fill` esperaria para sempre.
      const busca = page.locator('input[aria-label="Buscar conversas"]');
      if (await busca.isVisible()) {
        await busca.fill("zzzz-nao-existe-9999");
        await page.waitForTimeout(1100);
        await page.screenshot({
          path: path.join(RAIZ, `vazio-filtro_${tema}_${tamanho.nome}.png`),
        });
        await busca.fill("");
        await page.waitForTimeout(900);
      }

      // 3. LISTA COM CONVERSA ABERTA — para ver a coluna no contexto real.
      const id = await abrirConversa(page);
      await page.screenshot({
        path: path.join(RAIZ, `lista-com-thread_${tema}_${tamanho.nome}.png`),
      });

      // A THREAD é a segunda tela do recorte: aqui ela só é MEDIDA, não
      // alterada. O axe e o overflow dela entram no mesmo registro para que o
      // "depois" da lista não esconda uma regressão do lado da conversa.
      const daThread = await medir(page, "thread", tema, false);
      medidas.push(daThread);

      console.info(
        `${tema}/${tamanho.nome}  overflow=${daLista.pagina.overflow}px  ` +
          `coluna=${daLista.colunaDaLista}px  filtros=${daLista.blocoDeFiltros}px  ` +
          `linha=${daLista.linha?.altura ?? 0}px  visíveis=${daLista.linhasNaTela}  ` +
          `axe crítico=${daLista.axe.critica} sério=${daLista.axe.seria}  ` +
          `foco=${daLista.foco ? daLista.foco.outline : "n/a"}  ` +
          `thread: overflow=${daThread.pagina.overflow}px axe=${daThread.axe.critica}/${daThread.axe.seria}  ` +
          `conversa=${id.slice(0, 8)}  erros=${erros.length}`,
      );
      if (erros.length) console.info(`   console: ${erros.slice(0, 3).join(" | ")}`);
      for (const m of [daLista, daThread]) {
        if (m.axe.ids.length) console.info(`   axe ${m.aba}: ${m.axe.ids.join(", ")}`);
        for (const no of m.axe.nos) console.info(`     ${m.aba} → ${no}`);
      }

      await contexto.close();
    }
  }

  writeFileSync(path.join(RAIZ, "medidas.json"), JSON.stringify(medidas, null, 2));
  await browser.close();
  console.info(`\ncapturas e medidas em ${RAIZ}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
