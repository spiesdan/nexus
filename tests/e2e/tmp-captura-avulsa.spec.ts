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
/** Dock inferior mobile — o suspeito de cobrir o botão em 390. */
const DOCK = 'nav[aria-label="Navegação rápida"]';
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

  // CERTIFICADO + senha decifrável: sem isso o `/validar` devolve `ok:false`,
  // o clique abre o painel de pendências e o POST da nota NUNCA sai — foi
  // exatamente o que produziu "500 sem nfe-erro" nas rodadas anteriores.
  const up = await page.request.post("/api/v1/fiscal-settings/certificado", {
    multipart: {
      arquivo: {
        name: "e2e.pfx",
        mimeType: "application/x-pkcs12",
        buffer: Buffer.from([0x30, 0x82, 0x00, 0x05, 0x02, 0x01, 0x00, 0x00, 0x00]),
      },
    },
  });
  expect(up.status(), "upload do certificado A1 de teste").toBeLessThan(300);
  const comSenha = await page.request.put("/api/v1/fiscal-settings", {
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
      certificado_senha: "1234",
    },
  });
  expect(comSenha.status(), "senha do certificado gravada (cifra ativa)").toBeLessThan(300);

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

/**
 * Tela NOVA no estado "pronto para emitir": avulsa, um item com NCM e o cliente
 * completo. Estado herdado da captura anterior deixa pendências invisíveis e o
 * clique não sai — medido: botão habilitado, formulário pronto e ZERO request.
 */
async function prepararEmissao(page: Page, produto: string, clienteNome: string) {
  await page.goto("/app/notas?aba=emitir", { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.getByRole("button", { name: /venda avulsa/i }).first().click();
  await page.getByTestId("nfe-busca-produto").getByRole("combobox").fill(produto);
  await page.getByTestId("produto-resultados").getByRole("option").first().click();
  await expect(page.getByTestId("nfe-item-ncm")).toContainText("19059090", { timeout: 60_000 });
  // ACHADO medido em 27/11: o item vindo do catálogo entra com o PREÇO VAZIO.
  // `emitir()` filtra item com `preco_cents <= 0`, então a linha é descartada,
  // `itens` fica vazio, o schema reprova e o clique retorna sem POST e sem
  // `erroEmissao` — só um toast transitório. `nfe-formulario-pronto` continua
  // dizendo "pronto". Aqui o preço é preenchido para a captura valer; o achado
  // vai no relatório.
  const preco = page.getByTestId("nfe-item").getByLabel("Preço (centavos)").first();
  const precoAtual = await preco.inputValue();
  if (!precoAtual || Number(precoAtual) <= 0) {
    console.log("[achado] catálogo adicionou item com preço vazio; preenchendo 1000 para a captura");
    await preco.fill("1000");
  }
  const cliente = page.getByTestId("nfe-cliente").getByRole("textbox").first();
  await cliente.fill(clienteNome);
  await page.getByRole("button", { name: new RegExp(clienteNome) }).first().click();
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

    // 6. FALHA DE ENVIO — em TELA NOVA. Estado herdado da captura anterior
    //    deixa o clique sem efeito (medido: botão habilitado, formulário
    //    pronto, ZERO request), então este estado recomeça do zero.
    await prepararEmissao(page, sementes.produto, sementes.clienteCompleto);
    await expect(page.getByTestId("nfe-pendencias")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("nfe-formulario-pronto")).toBeAttached({ timeout: 60_000 });
    await expect(page.getByTestId("nfe-emitir")).toBeEnabled({ timeout: 30_000 });

    const notasAntes = await contarNotas(page);
    let postsDaEmissao = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && new URL(req.url()).pathname === "/api/v1/invoices") {
        postsDaEmissao += 1;
      }
    });
    await page.route(
      (url) => url.pathname === "/api/v1/invoices",
      (rota) =>
        rota.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"error":"falha simulada"}',
        }),
    );

    // ── MEDIÇÃO da obstrução antes de concluir (pedido do BOSS) ────────────
    const botao = page.getByTestId("nfe-emitir");
    await botao.scrollIntoViewIfNeeded();
    const caixaBotao = await botao.boundingBox();
    const caixaDock = await page
      .locator(DOCK)
      .boundingBox()
      .catch(() => null);
    let noCentro = "(sem caixa)";
    if (caixaBotao) {
      noCentro = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return "nada";
          const dono = el.closest("[data-testid]")?.getAttribute("data-testid");
          const tag = el.tagName.toLowerCase();
          return dono ? `testid=${dono}` : `${tag}${el.className ? "." + String(el.className).slice(0, 30) : ""}`;
        },
        { x: caixaBotao.x + caixaBotao.width / 2, y: caixaBotao.y + caixaBotao.height / 2 },
      );
    }
    console.log(
      `[medida] botão emitir: ${JSON.stringify(caixaBotao)} dock: ${JSON.stringify(caixaDock)} centro=${noCentro}`,
    );
    const obstruido = typeof noCentro === "string" && /testid=|nav/.test(noCentro) && !noCentro.includes("nfe-emitir");
    if (obstruido) {
      console.log(`[achado] nfe-emitir OBSTRUÍDO em ${viewport.px}px por ${noCentro} — captura com clique forçado`);
    }

    await page.getByTestId("nfe-emitir").click({ force: obstruido, timeout: 20_000 });
    const apareceu = await page
      .getByTestId("nfe-erro")
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(2000);
    // Instrumentação pedida: QUEM come o clique. Toast (validação local) x
    // clique morto se distinguem aqui.
    const toasts = await page
      .locator('[role="status"], [role="alert"], [data-sonner-toast], [data-toast]')
      .allInnerTexts()
      .catch(() => [] as string[]);
    const itens = await page.getByTestId("nfe-item").evaluateAll((linhas) =>
      linhas.map((l) => {
        const q = l.querySelector('input[aria-label="Qtd."]') as HTMLInputElement | null;
        const p = l.querySelector('input[aria-label="Preço (centavos)"]') as HTMLInputElement | null;
        return { qtd: q?.value ?? "(sem input)", preco: p?.value ?? "(sem input)", texto: l.textContent?.trim().slice(0, 40) };
      }),
    );
    console.log(`[medida] toasts visíveis: ${JSON.stringify(toasts.filter((t) => t.trim()))}`);
    console.log(`[medida] itens da avulsa no DOM: ${JSON.stringify(itens)}`);
    console.log(
      `[medida] falha de envio: POST disparado=${postsDaEmissao} nfe-erro=${apareceu ? "visível" : "AUSENTE"}`,
    );
    await capturar(page, apareceu ? "falha-envio" : "falha-envio-sem-erro", viewport.px, viewport.altura);

    const notasDepois = await contarNotas(page);
    console.log(`[medida] notas antes=${notasAntes} depois=${notasDepois}`);
    expect(postsDaEmissao, "o POST da nota precisa ter saído para a falha valer como prova").toBeGreaterThan(0);
    expect(notasDepois, "falha de envio não pode criar nota").toBe(notasAntes);

    await page.unroute((url) => url.pathname === "/api/v1/invoices");
  }
});
