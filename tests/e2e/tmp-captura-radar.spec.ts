import fs from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * Captura dos SEIS estados visuais do Radar (lista canônica do Design UX em
 * `Shared/nexus-expedicao/radar-estados-canonicos.md`).
 *
 * ── O que a imagem tem de ser ───────────────────────────────────────────────
 *
 * A PÁGINA na viewport, com o cartão INTEIRO acima do dock — não o recorte do
 * cartão, e não um cartão meio encoberto. O parecer do Design UX (27/11)
 * recusou recortes como aceite; o QA (27/11) recusou três imagens em 390
 * porque o rodapé do cartão ("Cancelar", "Ver empresas", "Continuar") ficava
 * ATRÁS do dock inferior — rolagem que para "no cartão" e não "no cartão
 * visível".
 *
 * Duas capturas por estado seriam prova contraditória, então há uma só: página
 * inteira da viewport, com o cartão enquadrado. O recorte do cartão continua
 * existindo como ANEXO, em `cartoes/`.
 *
 * A LISTA é documentação do todo: só o `fullPage` mostra os seis cartões; uma
 * viewport com 2 ou 3 cartões não é "a lista".
 *
 * O teste CONFERE o que produziu (dimensões do PNG lidas do IHDR, cartão dentro
 * do limite do dock, página no topo antes da lista) — nome de arquivo certo com
 * conteúdo errado é exatamente o que passou despercebido duas vezes.
 */
test.setTimeout(600_000);

const RAIZ = "evidence/radar-estados";
const DOCK = 'nav[aria-label="Navegação rápida"]';

const ESTADOS = [
  { nome: "carregando", texto: "marcenaria" },
  { nome: "resultado", texto: "oficina mecânica" },
  { nome: "parando", texto: "restaurante" },
  { nome: "parcial", texto: "clínica odontológica" },
  { nome: "zero", texto: "cerâmica" },
  { nome: "degradada", texto: "hotel" },
] as const;

const VIEWPORTS = [
  { px: 1440, altura: 900 },
  { px: 390, altura: 844 },
] as const;

/** Lê largura/altura do IHDR do PNG — 8 bytes de assinatura + 8 de tamanho. */
function dimensoes(png: Buffer): { largura: number; altura: number } {
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

/** O dock inferior só existe abaixo de `md`; no desktop o limite é a tela. */
async function limiteInferior(page: Page): Promise<number> {
  return page.evaluate((seletor) => {
    const dock = document.querySelector(seletor);
    if (!dock) return window.innerHeight;
    const r = dock.getBoundingClientRect();
    return r.height > 0 ? r.top : window.innerHeight;
  }, DOCK);
}

/**
 * Rola até o cartão ficar INTEIRO entre o topo e o dock.
 *
 * `scrollIntoView({block:"center"})` põe o cartão no meio da JANELA, e o dock
 * cobre o rodapé dela — é por isso que três imagens saíram com botão atrás da
 * barra. Aqui: centraliza, mede contra o limite real e ajusta o container que
 * de fato rola (o app shell rola um `div`, não a janela).
 */
async function enquadrar(page: Page, cartao: Locator): Promise<void> {
  await cartao.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(150);

  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const medida = await cartao.evaluate((el, seletor) => {
      const r = el.getBoundingClientRect();
      const dock = document.querySelector(seletor);
      const topoDock = dock ? dock.getBoundingClientRect().top : window.innerHeight;
      const limite = topoDock > 0 ? topoDock : window.innerHeight;
      return { topo: Math.round(r.top), base: Math.round(r.bottom), limite: Math.round(limite) };
    }, DOCK);

    const margem = 12;
    if (medida.topo >= 0 && medida.base <= medida.limite - margem) return;

    // Positivo = precisa descer (cartão passa do dock); negativo = subir.
    const delta =
      medida.base > medida.limite - margem
        ? Math.min(medida.base - (medida.limite - margem), 260)
        : -Math.min(margem - medida.topo, 260);

    await cartao.evaluate((el, d) => {
      let no: HTMLElement | null = el.parentElement;
      while (no) {
        const estilo = getComputedStyle(no);
        if (/(auto|scroll)/.test(estilo.overflowY) && no.scrollHeight > no.clientHeight + 4) {
          no.scrollTop += d;
          return;
        }
        no = no.parentElement;
      }
      window.scrollBy(0, d);
    }, delta);
    await page.waitForTimeout(150);
  }

  throw new Error("não consegui enquadrar o cartão inteiro acima do dock");
}

test("captura dos seis estados visuais do Radar", async ({ page }) => {
  fs.mkdirSync(path.join(RAIZ, "cartoes"), { recursive: true });

  await loginComoAdmin(page, lerCreds());
  await page.goto("/app/campanhas?subtela=prospeccao&aba=pesquisas", {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });

  const titulo = page.getByRole("heading", { name: "Buscas no mapa" });
  await expect(titulo).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("restaurante · padaria")).toBeVisible({ timeout: 60_000 });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.px, height: viewport.altura });

    // O dock aparece por CSS (`md:hidden`): em 1440 ele EXISTE no DOM e está
    // invisível — `waitFor visible` ali nunca resolve (custou uma rodada).
    // Espera-se a estabilidade da posição, e só quando ele está visível.
    const dock = page.locator(DOCK);
    if ((await dock.count()) > 0 && (await dock.first().isVisible())) {
      let anterior = -2;
      for (let i = 0; i < 10; i++) {
        const caixaDock = await dock.first().boundingBox();
        const y = caixaDock ? Math.round(caixaDock.y) : -1;
        if (y === anterior) break;
        anterior = y;
        await page.waitForTimeout(150);
      }
    }

    // ── A LISTA: página inteira ───────────────────────────────────────────
    // `fullPage` porque a viewport mostra 2-3 dos 6 cartões; emendar rolagem
    // seria produzir a imagem que o QA reprovou. O topo é conferido no DOM.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(titulo).toBeVisible();
    const caixaTitulo = await titulo.boundingBox();
    console.log(
      `[medida] topo em ${viewport.px}: título em y=${Math.round(caixaTitulo?.y ?? -1)}px`,
    );
    expect(caixaTitulo?.y ?? -1).toBeGreaterThanOrEqual(0);

    const lista = await page.screenshot({ path: `${RAIZ}/lista-${viewport.px}.png`, fullPage: true });
    const dimLista = dimensoes(lista);
    expect(dimLista.largura, `lista em ${viewport.px}px mantém a largura da viewport`).toBe(
      viewport.px,
    );
    // A página inteira é mais alta que a viewport — é o que prova os 6 cartões.
    expect(
      dimLista.altura,
      `lista em ${viewport.px}px precisa passar da dobra (altura ${viewport.altura})`,
    ).toBeGreaterThan(viewport.altura);
    console.log(`[medida] lista em ${viewport.px}: ${dimLista.largura}x${dimLista.altura}`);

    // ── OS SEIS ESTADOS: página na viewport, cartão inteiro acima do dock ──
    for (const estado of ESTADOS) {
      const cartao = page.locator("li").filter({ hasText: estado.texto }).first();
      await expect(cartao, `cartão do estado ${estado.nome}`).toBeVisible({ timeout: 60_000 });
      await enquadrar(page, cartao);

      const pagina = await page.screenshot({ path: `${RAIZ}/${estado.nome}-${viewport.px}.png` });
      expect(
        dimensoes(pagina),
        `${estado.nome} em ${viewport.px}px deve ser a página na viewport`,
      ).toEqual({ largura: viewport.px, altura: viewport.altura });

      // Anexo de detalhe: NÃO substitui a página, e por isso vive em subpasta.
      await cartao.screenshot({ path: `${RAIZ}/cartoes/${estado.nome}-${viewport.px}.png` });
    }

    if (viewport.px === 390) {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      console.log(`[medida] overflow horizontal em 390: ${overflow}px`);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  }
});
