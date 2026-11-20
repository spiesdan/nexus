/**
 * MATRIZ E DO CRIADOR DE PEDIDOS — a jornada de venda sob os casos que o dono
 * listou, no navegador e contra o banco LOCAL (`127.0.0.1:54321`).
 *
 * Cobre: busca (código/nome/marca/scanner), volume (500+ contatos e 2.100+
 * produtos, com o alvo fora do lote carregado), tabela de preço (aplicar,
 * trocar, override e preço inválido), estoque (suficiente/insuficiente/
 * desatualizado/não controlado), crédito e aprovação, timeout com resposta
 * perdida, reconciliação no banco, responsivo e nomes acessíveis.
 *
 * Nada aponta para produção: o `.env.e2e` é recusado se não for localhost
 * (playwright.config). Tudo que o spec cria leva o prefixo `MATRIZ <carimbo>`
 * e é apagado no `afterAll`.
 */
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const creds = lerCreds();
const ORG = (creds as unknown as { org_id: string }).org_id;
const CARIMBO = `${Date.now()}`;
const P = `MATRIZ ${CARIMBO}`;
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

test.describe.configure({ mode: "serial", timeout: 180_000 });

function codigo(tag: string): string {
  return `${CARIMBO}-${tag}`;
}

async function entrar(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const chave = window.localStorage.key(i);
      if (chave?.startsWith("pedido-rascunho")) window.localStorage.removeItem(chave);
    }
  });
  await loginComoAdmin(page, creds);
}

async function abrirEditor(page: Page): Promise<void> {
  await page.goto("/app/pedidos/novo");
  await expect(page.getByRole("heading", { level: 1, name: /novo pedido/i })).toBeVisible({
    timeout: 25_000,
  });
}

async function criarProduto(
  page: Page,
  dados: { nome: string; codigo: string; preco: number; estoque?: number; controla?: boolean },
): Promise<string> {
  const r = await page.request.post("/api/v1/products", {
    data: {
      codigo: dados.codigo,
      nome: dados.nome,
      preco_cents: dados.preco,
      controla_estoque: dados.controla ?? false,
      quantidade: dados.estoque ?? 0,
    },
  });
  expect(r.status(), `criar produto ${dados.nome}`).toBe(201);
  return ((await r.json()) as { data: { id: string } }).data.id;
}

async function criarContato(page: Page, nome: string, limite?: number): Promise<string> {
  const r = await page.request.post("/api/v1/contacts", {
    data: { display_name: nome, source: "manual" },
  });
  expect(r.status(), `criar contato ${nome}`).toBe(201);
  const id = ((await r.json()) as { data: { contact: { id: string } } }).data.contact.id;
  if (limite !== undefined) {
    const p = await page.request.patch(`/api/v1/contacts/${id}`, {
      data: { limite_credito_cents: limite },
    });
    expect(p.status(), "definir limite de crédito").toBe(200);
  }
  return id;
}

async function escolherCliente(page: Page, nome: string): Promise<void> {
  await page.locator("#busca-cliente").fill(nome);
  await page.getByRole("button", { name: new RegExp(nome) }).first().click({ timeout: 20_000 });
}

async function adicionarProduto(page: Page, busca: string, viaEnter = false): Promise<void> {
  await page.locator("#busca-produto").fill(busca);
  if (viaEnter) {
    await page.locator("#busca-produto").press("Enter");
  } else {
    await page.getByRole("option", { name: new RegExp(busca) }).first().click({ timeout: 20_000 });
  }
  await expect(page.getByRole("spinbutton", { name: /Quantidade/ }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function gerar(page: Page): Promise<void> {
  await page.getByTestId("gerar-pedido").click();
}

async function contaPedidos(nomeCliente: string): Promise<number> {
  const { count } = await svc
    .from("commercial_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORG)
    .eq("cliente_nome", nomeCliente);
  return count ?? 0;
}

test.afterAll(async () => {
  // Ordem: itens caem por FK; pedidos antes de contatos/produtos.
  await svc.from("commercial_orders").delete().eq("organization_id", ORG).like("cliente_nome", `%${P}%`);
  await svc.from("contacts").delete().eq("organization_id", ORG).like("display_name", `%${P}%`);
  await svc.from("catalog_products").delete().eq("organization_id", ORG).like("nome", `%${P}%`);
  await svc.from("price_tables").delete().eq("organization_id", ORG).like("nome", `%${P}%`);
});

test("E.1/E.2 — busca por código, nome e scanner; volume sem truncar em silêncio", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await entrar(page);

  // 520 contatos + 2.100 produtos. Os nomes começam com "ZZZ" e são numerados:
  // o alvo (último) fica FORA dos 500 contatos e dos 2.000 produtos que a
  // página carrega — quem o encontra é a busca no servidor.
  const contatos = Array.from({ length: 520 }, (_, i) => ({
    organization_id: ORG,
    display_name: `ZZZZ ${P} Contato ${String(i + 1).padStart(4, "0")}`,
    name: `ZZZZ ${P} Contato ${String(i + 1).padStart(4, "0")}`,
    source: "manual",
  }));
  for (let i = 0; i < contatos.length; i += 260) {
    const { error } = await svc.from("contacts").insert(contatos.slice(i, i + 260));
    expect(error, "semear contatos em lote").toBeNull();
  }

  const produtos = Array.from({ length: 2100 }, (_, i) => ({
    organization_id: ORG,
    codigo: `${CARIMBO}-VOL-${String(i + 1).padStart(4, "0")}`,
    nome: `ZZZZ ${P} Produto ${String(i + 1).padStart(4, "0")}`,
    preco_cents: 1000 + i,
    controla_estoque: false,
  }));
  for (let i = 0; i < produtos.length; i += 350) {
    const { error } = await svc.from("catalog_products").insert(produtos.slice(i, i + 350));
    expect(error, "semear produtos em lote").toBeNull();
  }

  const alvoContato = `ZZZZ ${P} Contato 0520`;
  const alvoCodigo = `${CARIMBO}-VOL-2100`;
  const alvoProduto = `ZZZZ ${P} Produto 2100`;

  const esperaContatos = page.waitForResponse(
    (r) => r.url().includes("/api/v1/contacts?search=") && r.status() === 200,
    { timeout: 30_000 },
  );
  await page.goto("/app/pedidos/novo");
  await page.locator("#busca-cliente").fill(alvoContato);
  await esperaContatos;
  await expect(page.getByRole("button", { name: new RegExp(alvoContato) }).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: new RegExp(alvoContato) }).first().click();

  // Busca remota do produto: o alvo não veio no primeiro lote.
  const esperaProdutos = page.waitForResponse(
    (r) => r.url().includes("/api/v1/products?busca=") && r.status() === 200,
    { timeout: 30_000 },
  );
  await page.locator("#busca-produto").fill(alvoCodigo);
  await esperaProdutos;

  // Carregando visível: atrasa a resposta de propósito e confere o estado.
  await page.route("**/api/v1/products?busca=*", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  const esperaAtrasada = page.waitForResponse(
    (r) => r.url().includes("/api/v1/products?busca=") && r.status() === 200,
    { timeout: 30_000 },
  );
  await page.locator("#busca-produto").fill("");
  await page.locator("#busca-produto").fill(`${CARIMBO}-VOL-2099`);
  await expect(page.getByText("Buscando no catálogo…")).toBeVisible({ timeout: 5_000 });
  await esperaAtrasada;
  await page.unroute("**/api/v1/products?busca=*");
  await expect(page.getByText(`ZZZZ ${P} Produto 2099`)).toBeVisible({ timeout: 20_000 });

  // O alvo original volta e o scanner adiciona com Enter, sem clique.
  await page.locator("#busca-produto").fill("");
  await page.locator("#busca-produto").fill(alvoCodigo);
  await expect(page.getByText(alvoProduto)).toBeVisible({ timeout: 20_000 });
  await page.locator("#busca-produto").press("Enter");
  await expect(page.getByRole("spinbutton", { name: /Quantidade/ }).first()).toBeVisible({
    timeout: 15_000,
  });

  // EAN/GTIN não existe: a API não devolve a chave (prova de ausência).
  const resposta = await page.request.get(
    `/api/v1/products?busca=${encodeURIComponent(alvoCodigo)}&limite=1`,
  );
  const corpo = (await resposta.json()) as { data: Array<Record<string, unknown>> };
  expect(corpo.data[0]).toBeTruthy();
  for (const chave of ["ean", "gtin", "barcode", "codigo_barras"]) {
    expect(corpo.data[0]!).not.toHaveProperty(chave);
  }

  // Erro da busca remota não é silencioso: mensagem + lista local preservada.
  await page.route("**/api/v1/products?busca=*", (route) =>
    route.fulfill({ status: 500, body: "{}", contentType: "application/json" }),
  );
  await page.locator("#busca-produto").fill(`${CARIMBO}-ERRO`);
  await expect(
    page.getByText("Não foi possível buscar no catálogo inteiro; mostrando os produtos já carregados."),
  ).toBeVisible({ timeout: 20_000 });
  await page.unroute("**/api/v1/products?busca=*");
});

test("E.3 — tabela de preço: aplicar, trocar (422), override de gerente e preço inválido", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await entrar(page);

  const t1 = await page.request.post("/api/v1/price-tables", {
    data: { nome: `${P} Tabela 10`, desconto_pct: 10 },
  });
  expect(t1.status()).toBe(201);
  const t2 = await page.request.post("/api/v1/price-tables", {
    data: { nome: `${P} Tabela 20`, desconto_pct: 20 },
  });
  expect(t2.status()).toBe(201);
  const t2Id = ((await t2.json()) as { data: { id: string } }).data.id;

  const prodCodigo = codigo("TAB");
  await criarProduto(page, { nome: `${P} Produto Tabela`, codigo: prodCodigo, preco: 10000 });
  const cliente = `${P} Cliente Tabela`;
  await criarContato(page, cliente);

  await abrirEditor(page);
  await escolherCliente(page, cliente);
  const carregouT1 = page.waitForResponse(
    (r) => r.url().includes("/api/v1/price-tables/") && r.request().method() === "GET",
    { timeout: 20_000 },
  );
  await page.locator("#tabela").click();
  await page.getByRole("option", { name: new RegExp(`${P} Tabela 10`) }).click();
  await carregouT1;
  await adicionarProduto(page, prodCodigo);

  // A linha mostra o preço da tabela e a origem.
  await expect(page.getByText("R$ 90,00").first()).toBeVisible();
  await expect(page.getByText("preço da tabela").first()).toBeVisible();

  // Trocar para 20% REPRECIFICA a linha (era o defeito: mantinha o preço
  // antigo e o servidor recusava no fim). 90,00 → 80,00, mesma origem.
  const carregouT2 = page.waitForResponse(
    (r) => r.url().includes("/api/v1/price-tables/") && r.request().method() === "GET",
    { timeout: 20_000 },
  );
  await page.locator("#tabela").click();
  await page.getByRole("option", { name: new RegExp(`${P} Tabela 20`) }).click();
  await carregouT2;
  await expect(page.getByText("R$ 80,00").first()).toBeVisible({ timeout: 10_000 });

  // Preço fora da tabela continua sendo recusado pelo SERVIDOR — o caso real
  // que sobra depois da reprecificação é a tabela mudar embaixo do editor
  // (outro gerente edita, a tela já carregada fica velha). A tela não tem como
  // adivinhar; o servidor recusa com 422 e nada é gravado.
  const patch = await page.request.patch(`/api/v1/price-tables/${t2Id}`, {
    data: { desconto_pct: 30 },
  });
  expect(patch.status()).toBe(200);
  await gerar(page);
  await expect(page.getByText(/Preço fora da tabela/i)).toBeVisible({ timeout: 20_000 });
  expect(await contaPedidos(cliente)).toBe(0);

  // Override manual de gerente: digitar um preço DIFERENTE do da linha (a
  // linha está em 80,00; `fill` com o mesmo valor não muda o DOM e não há
  // evento) e gerar passa — o flag é próprio.
  const preco = page.getByRole("textbox", { name: "Preço" }).first();
  await preco.fill("75,00");
  await expect(page.getByText("preço manual").first()).toBeVisible();
  await gerar(page);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Pedido criado" })).toBeVisible({
    timeout: 30_000,
  });

  // Preço inválido é barrado na tela, sem POST.
  await abrirEditor(page);
  await escolherCliente(page, cliente);
  await adicionarProduto(page, prodCodigo);
  await page.getByRole("textbox", { name: "Preço" }).first().fill("abc");
  await gerar(page);
  await expect(page.getByText(/Preço inválido em/)).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/app\/pedidos\/novo/);
});

test("E.4 — estoque suficiente, insuficiente, desatualizado e não controlado", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await entrar(page);

  const cliente = `${P} Cliente Estoque`;
  await criarContato(page, cliente);
  const controlado = await criarProduto(page, {
    nome: `${P} Produto Controlado`,
    codigo: codigo("EST"),
    preco: 5000,
    estoque: 5,
    controla: true,
  });
  await criarProduto(page, {
    nome: `${P} Produto Livre`,
    codigo: codigo("LIVRE"),
    preco: 5000,
    controla: false,
  });

  await abrirEditor(page);
  await escolherCliente(page, cliente);
  await adicionarProduto(page, codigo("EST"));
  await expect(page.getByText("5 em estoque").first()).toBeVisible();

  const qtd = page.getByRole("spinbutton", { name: /Quantidade/ }).first();
  await qtd.fill("6");
  await expect(page.getByText("insuficiente: 5 disponível").first()).toBeVisible();
  await gerar(page);
  await expect(page.getByText(/Estoque insuficiente/i)).toBeVisible({ timeout: 20_000 });
  expect(await contaPedidos(cliente)).toBe(0);

  // Desatualizado: a tela montou com 5, o saldo cai para 1 antes do POST.
  await qtd.fill("2");
  const r = await page.request.patch(`/api/v1/products/${controlado}`, {
    data: { quantidade: 1 },
  });
  expect(r.status()).toBe(200);
  await gerar(page);
  await expect(page.getByText(/Estoque insuficiente/i)).toBeVisible({ timeout: 20_000 });
  expect(await contaPedidos(cliente)).toBe(0);

  // Não controlado: a linha diz que não há saldo a conferir.
  await abrirEditor(page);
  await escolherCliente(page, cliente);
  await adicionarProduto(page, codigo("LIVRE"));
  await expect(page.getByText("estoque não controlado").first()).toBeVisible();
  await expect(
    page.getByText("O saldo é conferido ao gerar o pedido; não há reserva de estoque."),
  ).toBeVisible();
});

test("E.5 — crédito: limite estourado, sem histórico e caminho de aprovação", async ({ page }) => {
  test.setTimeout(300_000);
  await entrar(page);

  const semHistorico = `${P} Cliente Sem Limite`;
  const estourado = `${P} Cliente Estourado`;
  await criarContato(page, semHistorico);
  await criarContato(page, estourado, 1000);
  const prodCodigo = codigo("CRED");
  await criarProduto(page, { nome: `${P} Produto Crédito`, codigo: prodCodigo, preco: 2000 });

  // Estourado: limite 10,00 × pedido 20,00 → 422 e nada gravado.
  await abrirEditor(page);
  await escolherCliente(page, estourado);
  await adicionarProduto(page, prodCodigo);
  await gerar(page);
  await expect(page.getByText(/Cliente acima do limite de crédito/i)).toBeVisible({
    timeout: 20_000,
  });
  expect(await contaPedidos(estourado)).toBe(0);

  // Sem limite definido: passa.
  await abrirEditor(page);
  await escolherCliente(page, semHistorico);
  await adicionarProduto(page, prodCodigo);
  await gerar(page);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Pedido criado" })).toBeVisible({
    timeout: 30_000,
  });
  expect(await contaPedidos(semHistorico)).toBe(1);

  // Aprovação: 10% acima do teto (5%) nasce em análise e a ficha oferece aprovar.
  const paraAprovar = `${P} Cliente Aprovação`;
  await criarContato(page, paraAprovar);
  await abrirEditor(page);
  await escolherCliente(page, paraAprovar);
  await adicionarProduto(page, prodCodigo);
  await page.locator("#desconto-pct").fill("10");
  await expect(page.getByText(/Desconto acima do teto/i)).toBeVisible();
  await gerar(page);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Pedido criado" })).toBeVisible({
    timeout: 30_000,
  });

  const { data } = await svc
    .from("commercial_orders")
    .select("id, status")
    .eq("organization_id", ORG)
    .eq("cliente_nome", paraAprovar)
    .single();
  expect((data as { status: string }).status).toBe("em_analise");
  await page.goto(`/app/pedidos/${(data as { id: string }).id}`);
  await expect(page.getByRole("button", { name: "Aprovar pedido" })).toBeVisible({
    timeout: 20_000,
  });
});

test("E.8/E.9 — resposta perdida depois do commit: reenviar cria UM pedido e reconcilia", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await entrar(page);

  const cliente = `${P} Cliente Concorrência`;
  await criarContato(page, cliente);
  const prodCodigo = codigo("CONC");
  await criarProduto(page, { nome: `${P} Produto Concorrência`, codigo: prodCodigo, preco: 7500 });

  await abrirEditor(page);
  await escolherCliente(page, cliente);
  await adicionarProduto(page, prodCodigo);

  let posts = 0;
  await page.route("**/api/v1/commercial-orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    if (posts === 1) {
      // O servidor COMMITA; a resposta se perde antes de chegar ao browser.
      const resposta = await route.fetch();
      await resposta.body();
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await gerar(page);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Erro|Falha|conex/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("gerar-pedido")).toBeEnabled();
  expect(posts).toBe(1);

  await gerar(page);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Pedido criado" })).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => contaPedidos(cliente), { timeout: 20_000 }).toBe(1);

  // Reconciliação no banco de teste: itens, totais e a chave de idempotência.
  const { data: pedido } = await svc
    .from("commercial_orders")
    .select("id, subtotal_cents, total_cents, chave_sincronizacao")
    .eq("organization_id", ORG)
    .eq("cliente_nome", cliente)
    .single();
  const linha = pedido as {
    id: string;
    subtotal_cents: number;
    total_cents: number;
    chave_sincronizacao: string | null;
  };
  expect(linha.subtotal_cents).toBe(7500);
  expect(linha.total_cents).toBe(7500);
  expect(linha.chave_sincronizacao).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const itens = await svc
    .from("commercial_order_items")
    .select("quantidade, preco_unit_cents, subtotal_cents")
    .eq("organization_id", ORG)
    .eq("order_id", linha.id);
  expect(itens.data).toHaveLength(1);
  expect(itens.data?.[0]).toMatchObject({
    quantidade: 1,
    preco_unit_cents: 7500,
    subtotal_cents: 7500,
  });

  const detalhe = await page.request.get(`/api/v1/commercial-orders/${linha.id}`);
  expect(detalhe.status()).toBe(200);
});

test("E.10 — 320/390/tablet/desktop sem overflow, foco e nome acessível", async ({ page }) => {
  test.setTimeout(240_000);
  await entrar(page);

  const cliente = `${P} Cliente A11y`;
  await criarContato(page, cliente);
  const prodCodigo = codigo("A11Y");
  await criarProduto(page, {
    nome: `${P} Produto A11y`,
    codigo: prodCodigo,
    preco: 4990,
    controla: false,
  });

  for (const viewport of [
    { width: 320, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await abrirEditor(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `overflow horizontal em ${viewport.width}px`).toBeLessThanOrEqual(1);
    await expect(page.locator("#busca-cliente")).toBeVisible();
    await expect(page.locator("#busca-produto")).toBeVisible();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirEditor(page);
  await escolherCliente(page, cliente);
  await adicionarProduto(page, prodCodigo);

  // Nome acessível do fluxo (label → input; botão de item; spinbutton).
  // `exact` é obrigatório: "Cliente" por substring também casa "Contato no
  // cliente" — os dois são textbox e o seletor vira ambíguo (strict mode).
  await expect(page.getByRole("textbox", { name: "Cliente", exact: true })).toBeVisible();
  // O campo de produto se chama pelo que FAZ desde a mudança de acessibilidade
  // ("Buscar produto, código ou EAN") e é um `combobox` com `listbox` de
  // opções — "Produtos" é o nome da seção, não do campo.
  await expect(page.getByRole("combobox", { name: /Buscar produto/ })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /Quantidade/ }).first()).toBeVisible();

  // Ordem de foco: do campo de cliente chega ao campo de produto pelo Tab.
  await page.locator("#busca-cliente").focus();
  let chegou = false;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    if (id === "busca-produto") {
      chegou = true;
      break;
    }
  }
  expect(chegou, "o Tab do cliente alcança a busca de produto").toBe(true);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const graves = resultado.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(graves, `axe em ${viewport.width}px: ${graves.map((v) => v.id).join(", ")}`).toEqual([]);
  }
});
