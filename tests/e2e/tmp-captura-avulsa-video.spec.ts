import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { semearContato, semearProduto } from "./helpers/pedidos";

/**
 * Vídeo a 390×844 dos três fluxos que o Design UX julga por comportamento:
 * feliz (buscar → selecionar → ver NCM → emitir), busca sem resultado
 * (debounce/loading/vazio) e erro de emissão (botão → loading → erro → foco).
 *
 * O vídeo é nativo do Playwright (`video: "on"`); o job sobe
 * `test-results/**\/*.webm` ao lado das imagens. Nada é emitido de verdade: o
 * emitente está em homologação e sem certificado, então o terceiro fluxo é a
 * recusa honesta.
 */
test.use({ viewport: { width: 390, height: 844 }, video: "on" });
test.setTimeout(600_000);

/** CNPJ com dígitos verificadores válidos — o PATCH de contato recusa 422 sem isso. */
function cnpjDoCarimbo(carimbo: number): string {
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
  const d2 = digito([...n, d1]);
  return `${base}${d1}${d2}`;
}

test("vídeo: fluxo feliz, busca vazia e erro de emissão", async ({ page }) => {
  const carimbo = Date.now();
  await loginComoAdmin(page, lerCreds());

  const produto = `Pao de queijo E2E video ${carimbo}`;
  await semearProduto(page, produto, { ncm: "19059090" });

  const cliente = `Cliente Video E2E ${carimbo}`;
  const id = await semearContato(page, cliente);
  const cadastro = await page.request.patch(`/api/v1/contacts/${id}`, {
    data: {
      tipo_pessoa: "J",
      cnpj: cnpjDoCarimbo(carimbo),
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

  await page.goto("/app/notas?aba=emitir", { waitUntil: "domcontentloaded", timeout: 240_000 });
  // A tela de emissão abre em modo "pedido"; a venda avulsa é o seletor
  // `nota-avulsa` (o mesmo testid que o PR entrega). Sem este clique o bloco da
  // avulsa nem monta, e `nfe-itens-vazio` não existe no DOM.
  // O `nota-avulsa` do PR é container; quem troca o modo é o BOTÃO. Sem este
  // clique a tela fica em "NF-e de pedido" e o formulário da avulsa nem monta.
  await page.getByRole("button", { name: /venda avulsa/i }).first().click();
  await expect(page.getByTestId("nfe-itens-vazio")).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(800);

  const caixa = page.getByTestId("nfe-busca-produto").getByRole("combobox");

  // Fluxo feliz: buscar, selecionar, ver NCM e preparar a emissão.
  await caixa.fill(produto);
  await expect(page.getByTestId("produto-resultados")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.getByTestId("produto-resultados").getByRole("option").first().click();
  await expect(page.getByTestId("nfe-item-ncm")).toContainText("19059090");
  await page.waitForTimeout(600);

  const clienteInput = page.getByTestId("nfe-cliente").getByRole("textbox").first();
  await clienteInput.fill(cliente);
  await page.getByRole("button", { name: new RegExp(cliente) }).first().click();
  await page.waitForTimeout(600);

  // Busca sem resultado: o vazio só pode aparecer depois do debounce.
  await caixa.fill("zzzzzznaoexiste");
  await expect(page.getByTestId("produto-busca-vazia")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(800);

  // Erro de emissão: botão habilitado, clique, espera, erro e foco.
  // O clique e o desfecho são gravados; exige o erro OU a confirmação — o que
  // o produto fizer é o que o Design UX precisa julgar, e inventar um erro
  // aqui seria mostrar um comportamento que não existe.
  await page.getByTestId("nfe-emitir").click();
  await expect(
    page.getByTestId("nfe-erro").or(page.getByText(/enviad|fila|autoriz/i)).first(),
  ).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(1500);
});
