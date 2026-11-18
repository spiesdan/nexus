import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono } from "./helpers/login-admin";

/**
 * 9.5 — REGRESSÃO VISUAL com baseline versionado.
 *
 * ## Por que existe (e o que NÃO é)
 *
 * Até aqui a regressão visual dependia das capturas do instrumento de auditoria
 * (`scripts/auditoria/captura-visual.mjs`), que **não é gate**: elas registram o
 * estado para leitura humana, mas nada reprova quando um componente muda de
 * tamanho, cor ou posição.
 *
 * Este arquivo é o gate. Ele cobre um conjunto **pequeno e estável** — login e
 * quatro telas de uso diário — em desktop (1440×900, tema escuro e claro) e
 * celular (390×844, escuro). Não é a matriz de 156 telas: baseline de tudo vira
 * manutenção de artefato, e o time aprende a rodar `--update-snapshots` no
 * automático, que é pior que não ter baseline.
 *
 * O produto é dark-first (`lib/theme.tsx`), então o escuro é o tema PADRÃO; o
 * claro é a preferência gravada (`nexus-theme=light`). Os dois existem de fato e
 * os dois são medidos.
 *
 * ## Como a instabilidade é tratada (e não escondida)
 *
 * Screenshot de tela com dado é frágil por três fontes: fonte carregando,
 * animação no meio e conteúdo volátil (data, avatar, número). Aqui:
 *
 *   1. `document.fonts.ready` é aguardado antes de capturar (fonte trocando =
 *      pixel diferente, sem nenhuma mudança de layout);
 *   2. `animations: "disabled"` no `toHaveScreenshot` — o Playwright congela
 *      animação e transição durante a captura;
 *   3. `mask` cobre avatar, data/hora e todo elemento `[data-visual-volatil]`
 *      (números que mudam com o dado). O que sobra é a ESTRUTURA: posição,
 *      tamanho, espaçamento, cor de superfície, tipografia.
 *
 * `maxDiffPixelRatio` de 1% absorve antialiasing entre máquinas; acima disso é
 * mudança de layout, e o teste reprova.
 *
 * ## Por que a captura é a FAIXA SUPERIOR, e não a página inteira
 *
 * Medido neste ambiente: a página inteira reprovava em 2 de 14 casos por
 * rodada, sempre em telas diferentes — porque o número de LINHAS da lista muda
 * entre execuções (semeadura de outras specs, inclusive em paralelo). Um
 * baseline de página inteira mede o dado, não o layout: ele reprova quando
 * entra um pedido e passa quando ninguém mexeu, o que treina o time a rodar
 * `--update-snapshots` sem olhar.
 *
 * A faixa superior (cabeçalho + título + ações primárias + filtros) é o que
 * carrega a identidade visual da tela e NÃO depende de quantas linhas existem.
 * O que está abaixo da dobra é coberto pelos testes funcionais, com asserção
 * semântica — que é o instrumento certo para dado.
 *
 * ## Como atualizar o baseline (de propósito, nunca "para passar")
 *
 * ```bash
 * pnpm e2e:build            # `next start` usa build de produção
 * pnpm exec playwright test tests/e2e/visual-snapshots.spec.ts --update-snapshots
 * ```
 *
 * Revise as imagens no diff do PR ANTES de commitar. Atualizar baseline sem
 * olhar é aprovar qualquer mudança visual — inclusive a que quebrou a tela.
 */

// 30 s é o default do Playwright e não cobre login + carga de dados da tela
// sob um banco compartilhado. O timeout maior é do TESTE, não da comparação:
// a captura em si continua imediata depois de `assentar`.
test.describe.configure({ timeout: 90_000 });

const ROTAS = [
  { nome: "app", caminho: "/app" },
  { nome: "pedidos", caminho: "/app/pedidos" },
  { nome: "contacts", caminho: "/app/contacts" },
  { nome: "notas", caminho: "/app/notas" },
] as const;

/**
 * Espera a fonte, o fim do carregamento dos dados e assenta o layout.
 *
 * Só `document.fonts.ready` não bastava: a tela de pedidos troca o esqueleto
 * pela lista quando a consulta volta, e capturar entre os dois produz um diff
 * legítimo de 100% em uma execução e zero na seguinte (medido: 2 falhas na
 * primeira rodada, 0 na segunda). Esperar `load` + zero esqueleto é o que
 * remove o "sorte do momento" da captura.
 */
async function assentar(page: Page): Promise<void> {
  // A restauração de scroll do browser não é determinística entre navegações
  // SPA: a captura com `clip` é relativa ao viewport, então um scroll residual
  // desloca o conteúdo em alguns pixels e o diff aparece sem layout ter mudado.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState("load");
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('.animate-pulse, [aria-busy="true"], [data-state="loading"]')
          .length === 0,
      null,
      { timeout: 10_000 },
    )
    .catch(() => {
      // Tela sem esqueleto ou que demora: segue, e o `mask` cobre o que restar.
    });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // Um frame de folga para o layout pós-fonte (sem depender de rede).
  await page.waitForTimeout(400);
}

/** O que muda com o dado e não com o layout. */
function volateis(page: Page) {
  return [
    page.locator("img"),
    page.locator("time"),
    page.locator("[datetime]"),
    page.locator("[data-visual-volatil]"),
    // Esqueleto que ainda pulsa e toast de boas-vindas são estado, não layout.
    page.locator(".animate-pulse"),
    page.locator("[data-sonner-toast]"),
    // O sino de notificações carrega um contador de NÃO LIDAS: muda quando
    // chega aviso, sem nenhuma mudança de layout. É estado, não desenho.
    // O sino carrega um contador de avisos EM ABERTO. Mascarar só o número não
    // resolve: quando a contagem é ZERO o span não existe, a máscara não é
    // aplicada, e a comparação falha contra o baseline que tinha o retângulo.
    // A máscara precisa de um elemento que exista SEMPRE — o botão.
    page.locator('[data-testid="alerts-bell"]'),
  ];
}

test.describe("9.5 — baseline visual: desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  test("login — desktop escuro", async ({ page }) => {
    await page.goto("/login");
    await assentar(page);
    await expect(page).toHaveScreenshot("desktop-escuro-login.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test.describe("telas autenticadas", () => {
    test.beforeEach(async ({ page }) => {
      await loginComoDono(page, lerCreds());
    });

    for (const rota of ROTAS) {
      test(`${rota.nome} — desktop escuro`, async ({ page }) => {
        await page.goto(rota.caminho);
        await assentar(page);
        await expect(page).toHaveScreenshot(`desktop-escuro-${rota.nome}.png`, {
          animations: "disabled",
          maxDiffPixelRatio: 0.01,
          mask: volateis(page),
          clip: { x: 0, y: 0, width: 1440, height: 280 },
        });
      });

      test(`${rota.nome} — desktop claro`, async ({ page }) => {
        // `addInitScript` roda antes do primeiro script da página: o tema é
        // aplicado antes do primeiro paint, sem "flash" que mudaria a captura.
        await page.addInitScript(() => {
          window.localStorage.setItem("nexus-theme", "light");
        });
        await page.goto(rota.caminho);
        await assentar(page);
        await expect(page).toHaveScreenshot(`desktop-claro-${rota.nome}.png`, {
          animations: "disabled",
          maxDiffPixelRatio: 0.01,
          mask: volateis(page),
          clip: { x: 0, y: 0, width: 1440, height: 280 },
        });
      });
    }
  });
});

test.describe("9.5 — baseline visual: celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test("login — celular escuro", async ({ page }) => {
    await page.goto("/login");
    await assentar(page);
    await expect(page).toHaveScreenshot("celular-escuro-login.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test.describe("telas autenticadas", () => {
    test.beforeEach(async ({ page }) => {
      await loginComoDono(page, lerCreds());
    });

    for (const rota of ROTAS) {
      test(`${rota.nome} — celular escuro`, async ({ page }) => {
        await page.goto(rota.caminho);
        await assentar(page);
        await expect(page).toHaveScreenshot(`celular-escuro-${rota.nome}.png`, {
          animations: "disabled",
          maxDiffPixelRatio: 0.01,
          mask: volateis(page),
          clip: { x: 0, y: 0, width: 390, height: 420 },
        });
      });
    }
  });
});
