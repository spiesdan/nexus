/**
 * CAPTURA E MEDIÇÃO DA THREAD DO INBOX — o segundo recorte do passe de design.
 *
 * Cobre as três telas que a thread tem além do fio em si:
 *   1. conversa aberta (cabeçalho + fio + composer);
 *   2. canvas vazio ("Selecione uma conversa") no desktop;
 *   3. CONVERSA FORA DO ACESSO — o estado de permissão, alcançado por um
 *      deep-link para um id que não existe nesta organização (o produto
 *      responde 404 e a tela cai no estado de permissão).
 *
 * Mede o que a mudança promete (hierarquia do cabeçalho), o que ela não pode
 * quebrar (overflow, axe) e o que a tarefa pede explicitamente: foco visível e
 * `aria-label` das ações.
 *
 * Uso:
 *   BASE=http://localhost:3311 npx tsx tests/captura-inbox-thread.ts antes
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3311";
const ROTULO = process.argv[2] ?? "antes";
const CREDS = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8"));
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-inbox-thread`);

/** Id sintaticamente válido e inexistente: o caminho do "fora do acesso". */
const ID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  // O clique é uma corrida com a hidratação (ver comentário no instrumento da
  // lista): repetir resolve as duas causas — hidratação e compilação lenta.
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    await page.locator("#email").fill(CREDS.users.manager.email, { timeout: 120_000 });
    await page.locator("#password").fill(CREDS.password, { timeout: 120_000 });
    await page.getByRole("button", { name: /entrar/i }).first().click();
    try {
      await page.waitForURL(/\/app\//, { timeout: 40_000 });
      return;
    } catch {
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error("login não concluiu após 4 tentativas (hidratação ou credencial)");
}

interface Medida {
  tela: string;
  largura: number;
  tema: string;
  overflow: number;
  cabecalho: { altura: number; titulo: string; tituloPx: string; seloPx: string } | null;
  acoes: { rotulo: string; ariaLabel: string | null }[];
  foco: { alvo: string; outline: string } | null;
  axe: { critica: number; seria: number; ids: string[]; nos: string[] };
}

async function medir(page: Page, tela: string, tema: string): Promise<Medida> {
  const overflow = await page.evaluate(
    () =>
      Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
  );

  const cabecalho = (await page.evaluate(`(() => {
    var h = document.querySelector('h2');
    if (!h) return null;
    var pai = h.closest('div.flex.flex-wrap');
    var selo = pai ? pai.querySelector('span[class*="rounded-full"]') : null;
    function px(el) { return el ? getComputedStyle(el).fontSize + '/' + getComputedStyle(el).fontWeight : 'n/a'; }
    return {
      altura: pai ? Math.round(pai.getBoundingClientRect().height) : 0,
      titulo: (h.textContent || '').trim(),
      tituloPx: px(h),
      seloPx: px(selo)
    };
  })()`)) as Medida["cabecalho"];

  // `aria-label` das AÇÕES do cabeçalho — pedido explícito da tarefa. Botão sem
  // nome acessível é um alvo que o leitor de tela anuncia como "botão".
  const acoes = (await page.evaluate(`(() => {
    var h = document.querySelector('h2');
    var pai = h ? h.closest('div.flex.flex-wrap') : null;
    if (!pai) return [];
    var barra = pai.children[1];
    if (!barra) return [];
    return Array.from(barra.querySelectorAll('a,button')).map(function (b) {
      var rotulo = (b.textContent || '').trim();
      var aria = b.getAttribute('aria-label');
      var titulo = b.getAttribute('title');
      var nome = aria || titulo || rotulo;
      return { rotulo: rotulo || '(ícone)', ariaLabel: nome || null };
    });
  })()`)) as Medida["acoes"];

  // FOCO VISÍVEL na primeira AÇÃO do cabeçalho (a barra de ações do fio).
  let foco: Medida["foco"] = null;
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 80 && !foco; i++) {
    await page.keyboard.press("Tab");
    foco = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el.tagName !== "BUTTON") return null;
      const h2 = document.querySelector("h2");
      const cabecalho = h2 ? h2.closest("div.flex.flex-wrap") : null;
      if (!cabecalho || !cabecalho.contains(el)) return null;
      const s = getComputedStyle(el);
      return {
        alvo: (el.textContent ?? "").trim().slice(0, 24),
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ring=${s.boxShadow}`,
      };
    });
  }

  const axe = await new AxeBuilder({ page }).analyze();
  const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");

  return {
    tela,
    largura: page.viewportSize()?.width ?? 0,
    tema,
    overflow,
    cabecalho,
    acoes,
    foco,
    axe: {
      critica: axe.violations.filter((v) => v.impact === "critical").length,
      seria: axe.violations.filter((v) => v.impact === "serious").length,
      ids: graves.map((v) => `${v.id} (${v.impact})`),
      // O HTML do nó, curto: só o alvo (`#radix-...`) não diz QUAL controle é.
      nos: graves.flatMap((v) =>
        v.nodes
          .slice(0, 3)
          .map((n) => `${v.id}: ${n.target.join(" ")} :: ${(n.html ?? "").slice(0, 160)}`),
      ),
    },
  };
}

const medidas: Medida[] = [];

async function main(): Promise<void> {
  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();

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

      // 1. CANVAS VAZIO — o que se vê antes de escolher conversa.
      await page.goto(`${BASE}/app/inbox`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.locator("[data-conversation-id]").first().waitFor({ timeout: 120_000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(RAIZ, `vazio_${tema}_${tamanho.nome}.png`) });

      // 2. CONVERSA ABERTA — o recorte principal.
      await page.locator("[data-conversation-id]").first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(RAIZ, `thread_${tema}_${tamanho.nome}.png`) });
      const daThread = await medir(page, "thread", tema);
      medidas.push(daThread);

      // 3. FORA DO ACESSO — deep-link para um id que não existe na org.
      await page.goto(`${BASE}/app/inbox/${ID_INEXISTENTE}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(RAIZ, `sem-acesso_${tema}_${tamanho.nome}.png`) });
      const semAcesso = await medir(page, "sem-acesso", tema);
      medidas.push(semAcesso);

      console.info(
        `${tema}/${tamanho.nome}  overflow=${daThread.overflow}px  ` +
          `header=${daThread.cabecalho?.altura ?? 0}px  ` +
          `titulo=${daThread.cabecalho?.tituloPx ?? "n/a"}  selo=${daThread.cabecalho?.seloPx ?? "n/a"}  ` +
          `acoes=${daThread.acoes.length} semNome=${daThread.acoes.filter((a) => !a.ariaLabel).length}  ` +
          `foco=${daThread.foco?.outline ?? "n/a"}  ` +
          `axe=${daThread.axe.critica}/${daThread.axe.seria}  ` +
          `sem-acesso: overflow=${semAcesso.overflow}px axe=${semAcesso.axe.critica}/${semAcesso.axe.seria}  ` +
          `erros=${erros.length}`,
      );
      for (const m of [daThread, semAcesso]) {
        for (const no of m.axe.nos) console.info(`     ${m.tela} → ${no}`);
      }
      if (erros.length) console.info(`   console: ${erros.slice(0, 3).join(" | ")}`);

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
