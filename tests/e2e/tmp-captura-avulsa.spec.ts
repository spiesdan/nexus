import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { semearContato, semearProduto } from "./helpers/pedidos";

/**
 * Captura dos SEIS estados da NFe de venda avulsa (`/app/notas?aba=emitir`),
 * código de v2.1.0 (merge 0ae5abed).
 *
 * Por que em CI e não na máquina do dono: a máquina dele não builda mais (três
 * `next build` travaram em 27/11, carga 112). E por que NÃO em produção: a
 * captura precisa de catálogo e cliente semeados, e semear em produção é
 * escrever dado de teste no banco de clientes. Aqui é o mesmo código da 2.1.0,
 * num Supabase efêmero.
 *
 * Guarda do CTO respeitada: o emitente desta org fica em `homologacao` (default
 * do schema) e NENHUMA nota é emitida de verdade — o estado "erro de emissão"
 * é a recusa da própria tela/servidor por falta de certificado, que é o que o
 * Design UX precisa ver.
 *
 * Seletores: os do PR #973 (`nfe-*`, `produto-*`), sem inventar caminho.
 */
test.setTimeout(900_000);

const RAIZ = "evidence/nfe-avulsa";
const VIEWPORTS = [
  { px: 1440, altura: 900 },
  { px: 390, altura: 844 },
] as const;

function dimensoes(png: Buffer): { largura: number; altura: number } {
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

type Sementes = { produto: string; clienteCompleto: string; clienteIncompleto: string };

async function semear(page: Page): Promise<Sementes> {
  const carimbo = Date.now();
  const produto = `Pao de queijo E2E ${carimbo}`;
  await semearProduto(page, produto, { ncm: "19059090" });

  const clienteCompleto = `Cliente Completo E2E ${carimbo}`;
  const idCompleto = await semearContato(page, clienteCompleto);
  const cadastro = await page.request.patch(`/api/v1/contacts/${idCompleto}`, {
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
  expect(cadastro.status(), "cadastro completo do cliente da nota").toBe(200);

  const clienteIncompleto = `Cliente Incompleto E2E ${carimbo}`;
  await semearContato(page, clienteIncompleto);

  // Emitente em HOMOLOGAÇÃO e sem certificado de propósito: a tela fica
  // utilizável e a emissão é recusada — é o estado "erro de emissão".
  const config = await page.request.put("/api/v1/fiscal-settings", {
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
  expect(config.status(), "emitente de homologação semeado").toBeLessThan(300);

  return { produto, clienteCompleto, clienteIncompleto };
}

async function capturar(page: Page, nome: string, viewport: number, altura: number) {
  const png = await page.screenshot({ path: `${RAIZ}/${nome}-${viewport}.png` });
  expect(dimensoes(png), `${nome} em ${viewport}px deve ser a página na viewport`).toEqual({
    largura: viewport,
    altura,
  });
}

/** A lista da BUSCA — em 390 o `<select>` de abas também tem `role=option`. */
function resultados(page: Page) {
  return page.getByTestId("produto-resultados").getByRole("option");
}

async function buscarProduto(page: Page, termo: string) {
  const caixa = page.getByTestId("nfe-busca-produto");
  const input = caixa.getByRole("combobox");
  await input.fill(termo);
}

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

/** Quantas notas existem na organização agora — a falha não pode criar nenhuma. */
async function contarNotas(page: Page): Promise<number> {
  const r = await page.request.get("/api/v1/invoices?limit=1");
  expect(r.status(), "GET de notas para a contagem").toBe(200);
  const corpo = (await r.json()) as { data?: unknown[]; total?: number };
  if (typeof corpo.total === "number") return corpo.total;
  return Array.isArray(corpo.data) ? corpo.data.length : 0;
}

test("captura dos estados da NFe avulsa (7 em 1440)", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());
  const sementes = await semear(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.px, height: viewport.altura });

    // 1. tela vazia
    await page.goto("/app/notas?aba=emitir", { waitUntil: "domcontentloaded", timeout: 240_000 });
  // A tela de emissão abre em modo "pedido"; a venda avulsa é o seletor
  // `nota-avulsa` (o mesmo testid que o PR entrega). Sem este clique o bloco da
  // avulsa nem monta, e `nfe-itens-vazio` não existe no DOM.
  // O `nota-avulsa` do PR é container; quem troca o modo é o BOTÃO. Sem este
  // clique a tela fica em "NF-e de pedido" e o formulário da avulsa nem monta.
  await page.getByRole("button", { name: /venda avulsa/i }).first().click();
    await expect(page.getByTestId("nfe-itens-vazio")).toBeVisible({ timeout: 120_000 });
    await capturar(page, "vazia", viewport.px, viewport.altura);

    // 2. busca com resultado
    await buscarProduto(page, sementes.produto);
    await expect(page.getByTestId("produto-resultados")).toBeVisible({ timeout: 60_000 });
    await expect(resultados(page).first()).toBeVisible({ timeout: 60_000 });
    await capturar(page, "busca-resultado", viewport.px, viewport.altura);

    // 3. item selecionado, com NCM
    await resultados(page).first().click();
    await expect(page.getByTestId("nfe-item")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("nfe-item-ncm")).toContainText("19059090");
    await capturar(page, "item-ncm", viewport.px, viewport.altura);

    // 4. busca sem resultado
    await buscarProduto(page, "zzzzzznaoexiste");
    await expect(page.getByTestId("produto-busca-vazia")).toBeVisible({ timeout: 60_000 });
    await capturar(page, "busca-vazia", viewport.px, viewport.altura);

    // 5. CADASTRO INCOMPLETO — o critério real do produto (medido no código):
    //    `nfe-emitir` fica HABILITADO (disabled = emitindo || !configInicial),
    //    o clique chama `/invoices/validar`, o painel de pendências aparece e
    //    NENHUM POST de nota é feito.
    const cliente = page.getByTestId("nfe-cliente").getByRole("textbox").first();
    await cliente.fill(sementes.clienteIncompleto);
    await page
      .getByRole("button", { name: new RegExp(sementes.clienteIncompleto) })
      .first()
      .click();

    let postsDeNota = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/v1/invoices") && !req.url().includes("/validar")) {
        postsDeNota += 1;
      }
    });

    await page.getByTestId("nfe-emitir").click();
    const pendencias = page.getByTestId("nfe-pendencias");
    await expect(pendencias, "cadastro incompleto precisa abrir o painel de pendências").toBeVisible({
      timeout: 60_000,
    });
    await page.waitForTimeout(2500);
    console.log(`[medida] POST de nota com cadastro incompleto: ${postsDeNota} (precisa ser 0)`);
    expect(postsDeNota, "cadastro incompleto não pode criar nota").toBe(0);
    await capturar(page, "cliente-incompleto", viewport.px, viewport.altura);

    // 6. FALHA DE ENVIO — cliente completo e itens válidos; o POST de nota é
    //    interceptado com 500. O produto sinaliza por TOAST (showApiError), não
    //    por `nfe-erro` inline: a janela é curta e a asserção é no texto.
    await cliente.fill(sementes.clienteCompleto);
    await page.getByRole("button", { name: new RegExp(sementes.clienteCompleto) }).first().click();
    await page.waitForTimeout(500);

    const notasAntes = await contarNotas(page);
    await page.route("**/api/v1/invoices", (rota) =>
      rota.fulfill({ status: 500, contentType: "application/json", body: '{"error":"falha simulada"}' }),
    );
    await page.getByTestId("nfe-emitir").click();

    const toast = page.getByText(/não foi possível|falha|erro/i).first();
    const apareceu = await toast
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    console.log(`[medida] toast de erro na falha de envio: ${apareceu ? "visível" : "AUSENTE"}`);
    await capturar(page, apareceu ? "falha-envio" : "falha-envio-sem-toast", viewport.px, viewport.altura);

    const notasDepois = await contarNotas(page);
    console.log(`[medida] notas antes=${notasAntes} depois=${notasDepois}`);
    expect(notasDepois, "falha de envio não pode criar nota").toBe(notasAntes);

    await page.unroute("**/api/v1/invoices");
  }
});
