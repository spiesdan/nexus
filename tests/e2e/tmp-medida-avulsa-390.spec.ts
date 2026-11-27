import fs from "node:fs";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { semearContato, semearProduto } from "./helpers/pedidos";

/**
 * MEDIÇÃO EM PIXEL do #978 (`fix/avulsa-preco-prontidao`, head bfd86e25) — a
 * prova que o QA exige ANTES do merge.
 *
 * Critério, em 390×844 com o formulário no scroll máximo:
 *   - `button.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top`
 *     (alvo: >= 8 px de folga);
 *   - `elementFromPoint` no centro do botão devolve o próprio botão;
 *   - `scrollTop + clientHeight >= scrollHeight - 1`.
 *
 * Roda no MESMO ambiente do e2e (Supabase local + baseline + build do head do
 * PR), com o fixture fiscal que a captura da avulsa já usa. Nenhuma nota é
 * emitida: o item é adicionado e o preço preenchido, mas o teste para antes do
 * clique de emissão.
 */
test.setTimeout(600_000);

const RAIZ = "evidence/medida-978";
const DOCK = 'nav[aria-label="Navegação rápida"]';

test("mede a folga do dock no botão de emitir da avulsa (390)", async ({ page }) => {
  fs.mkdirSync(RAIZ, { recursive: true });
  const carimbo = Date.now();
  await loginComoAdmin(page, lerCreds());

  const produto = `Pao medida 978 ${carimbo}`;
  await semearProduto(page, produto, { ncm: "19059090" });

  const cliente = `Cliente Medida 978 ${carimbo}`;
  const id = await semearContato(page, cliente);
  const base = String(carimbo).slice(-12).padStart(12, "0");
  const digito = (numeros: number[]): number => {
    const pesos =
      numeros.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = numeros.reduce((s, n, i) => s + n * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const n = [...base].map(Number);
  const d1 = digito(n);
  const cnpj = `${base}${d1}${digito([...n, d1])}`;
  const cadastro = await page.request.patch(`/api/v1/contacts/${id}`, {
    data: {
      tipo_pessoa: "J",
      cnpj,
      ie: "123456789",
      logradouro: "Rua das Nacoes",
      numero_end: "1000",
      bairro: "Centro",
      cidade: "Sao Paulo",
      uf: "SP",
      cep: "01001000",
    },
  });
  expect(cadastro.status()).toBe(200);

  await page.request.put("/api/v1/fiscal-settings", {
    data: {
      serie: "1",
      natureza_operacao: "Venda",
      cfop_padrao: "5102",
      emitente_documento: "27493187000169",
      ie: "123456",
      crt: "1",
      logradouro: "Rua da Empresa",
      numero_end: "9",
      bairro: "Centro",
      municipio: "Mafra",
      codigo_municipio: "4209102",
      uf: "SC",
      cep: "89300000",
      ambiente: "homologacao",
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/notas?aba=emitir", { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.getByRole("button", { name: /venda avulsa/i }).first().click();

  await page.getByTestId("nfe-busca-produto").getByRole("combobox").fill(produto);
  await page.getByTestId("produto-resultados").getByRole("option").first().click();
  await expect(page.getByTestId("nfe-item-ncm")).toContainText("19059090", { timeout: 60_000 });
  const preco = page.getByTestId("nfe-item").getByLabel("Preço (centavos)").first();
  if (!(await preco.inputValue())) await preco.fill("1000");

  const clienteInput = page.getByTestId("nfe-cliente").getByRole("textbox").first();
  await clienteInput.fill(cliente);
  await page.getByRole("button", { name: new RegExp(cliente) }).first().click();

  // Scroll máximo no container que rola.
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = main.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(600);

  const medida = await page.evaluate((seletor) => {
    const botao = document.querySelector('[data-testid="nfe-emitir"]') as HTMLElement | null;
    const dock = document.querySelector(seletor) as HTMLElement | null;
    const main = (document.querySelector("main") as HTMLElement | null) ?? document.scrollingElement!;
    const rb = botao?.getBoundingClientRect();
    const rd = dock?.getBoundingClientRect();
    let noCentro = "nada";
    if (rb) {
      const el = document.elementFromPoint(rb.x + rb.width / 2, rb.y + rb.height / 2);
      noCentro = el
        ? (el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.tagName.toLowerCase())
        : "nada";
    }
    return {
      buttonBottom: rb ? Math.round(rb.bottom * 10) / 10 : null,
      dockTop: rd ? Math.round(rd.top * 10) / 10 : null,
      noCentro,
      scrollTop: Math.round(main.scrollTop),
      clientHeight: main.clientHeight,
      scrollHeight: main.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, DOCK);

  const folga = medida.buttonBottom != null && medida.dockTop != null ? medida.dockTop - medida.buttonBottom : Number.NaN;
  console.log(
    `[medida] 978 390: button.bottom=${medida.buttonBottom} dock.top=${medida.dockTop} folga=${folga}px centro=${medida.noCentro}`,
  );
  console.log(
    `[medida] 978 390: scrollTop=${medida.scrollTop} clientHeight=${medida.clientHeight} scrollHeight=${medida.scrollHeight} overflow=${medida.overflow}px`,
  );

  await page.screenshot({ path: `${RAIZ}/emitir-390-scroll-maximo.png` });

  expect(medida.noCentro, "o centro do botão precisa ser o próprio botão").toBe("nfe-emitir");
  expect(medida.scrollTop + medida.clientHeight, "scroll no máximo").toBeGreaterThanOrEqual(
    medida.scrollHeight - 1,
  );
  expect(folga, "folga entre o botão e o dock >= 8 px").toBeGreaterThanOrEqual(8);
  expect(medida.overflow, "sem rolagem horizontal").toBeLessThanOrEqual(0);
});
