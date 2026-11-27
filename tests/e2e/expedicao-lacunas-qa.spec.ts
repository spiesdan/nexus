import { expect, test, type Page } from "@playwright/test";

import { placaDoCarimbo } from "./helpers/expedicao";
import { lerCreds } from "./helpers/login-admin";
import { semearContato, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(600_000);

/**
 * AS TRÊS LACUNAS DA MATRIZ (§11), PELA UI.
 *
 * 1. Ordem manual: reordenar sem salvar, disparar uma geocodificação (recálculo
 *    sem mudança de paradas) e a ordem continuar na tela; salvar, recarregar e
 *    repetir o recálculo — a ordem persistida continua.
 * 2. Descartar proposta: uma proposta de ordem pendente volta à ordem
 *    persistida sem PATCH em `/rota/ordem`.
 * 3. Estados: erro real da ficha (500 no GET do detalhe) não vira vazio;
 *    carregamento da rota mostra o skeleton com texto; busca sem resultado
 *    mostra o vazio legítimo.
 *
 * O setup usa a API (contatos, pedidos, carga e pinos manuais) para chegar à
 * tela com duas paradas determinísticas. O que se mede é a UI; a otimização é
 * respondida por rota controlada para não depender de OSRM/provedor externo.
 */

interface CargaDuasParadas {
  id: string;
  nomes: [string, string];
  chaves: [string, string];
}

async function criarCargaComDuasParadas(page: Page, prefixo: string): Promise<CargaDuasParadas> {
  const carimbo = Date.now();
  const sufixo = String(carimbo).slice(-6);
  const produtoId = await semearProduto(page, `Produto ${prefixo} ${sufixo}`);
  const nomes: [string, string] = [
    `Cliente ${prefixo} A ${sufixo}`,
    `Cliente ${prefixo} B ${sufixo}`,
  ];
  const enderecos = [
    {
      logradouro: "Rua QA A",
      numero_end: "100",
      complemento: `A ${sufixo}`,
      bairro: "Centro",
      cidade: "Mafra",
      uf: "SC",
    },
    {
      logradouro: "Rua QA B",
      numero_end: "200",
      complemento: `B ${sufixo}`,
      bairro: "Centro",
      cidade: "Mafra",
      uf: "SC",
    },
  ];

  const contatos: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const contato = await semearContato(page, nomes[i]!);
    const patch = await page.request.patch(`/api/v1/contacts/${contato}`, {
      data: enderecos[i]!,
    });
    expect(patch.status(), `endereço do contato ${i} não foi gravado`).toBe(200);
    contatos.push(contato);
  }

  const pedidos = [];
  for (let i = 0; i < 2; i += 1) {
    pedidos.push(await semearPedido(page, nomes[i]!, { produtoId, contactId: contatos[i]! }));
  }

  const criar = await page.request.post("/api/v1/shipments", {
    data: {
      placa: placaDoCarimbo(carimbo),
      veiculo_tipo: "HR",
      motorista_nome: `Motorista ${sufixo}`,
      order_ids: pedidos.map((p) => p.id),
    },
  });
  expect(criar.status(), "não deu para criar a carga de duas paradas").toBe(201);
  const id = ((await criar.json()) as { data: { id: string } }).data.id;

  const rota = await page.request.get(`/api/v1/shipments/${id}/rota`);
  expect(rota.status()).toBe(200);
  const paradas = ((await rota.json()) as {
    data: { paradas: { chave: string; cliente: string; destination_id: string | null }[] };
  }).data.paradas;
  expect(paradas, "as duas paradas precisam ser destinos distintos").toHaveLength(2);

  // Pino manual: é o caminho do produto que não depende de geocodificador
  // externo e deixa `geo_status=ok`/`geo_fonte=entrada`, então o recálculo de
  // geocodificação não chama provedor.
  const coords = [
    { latitude: -26.3, longitude: -50.3 },
    { latitude: -26.4, longitude: -50.4 },
  ];
  for (let i = 0; i < 2; i += 1) {
    const parada = paradas.find((p) => p.cliente.includes(nomes[i]!)) ?? paradas[i]!;
    expect(parada.destination_id, `parada ${i} sem destination_id`).toBeTruthy();
    const marcou = await page.request.post(`/api/v1/shipments/${id}/rota/manual`, {
      data: {
        destination_id: parada.destination_id,
        ...coords[i]!,
        referencia: `QA ${i}`,
      },
    });
    expect(marcou.status(), `pino manual da parada ${i} falhou`).toBe(200);
  }

  const relida = await page.request.get(`/api/v1/shipments/${id}/rota`);
  const paradasRelidas = ((await relida.json()) as {
    data: { paradas: { chave: string; cliente: string }[] };
  }).data.paradas;
  const chaveA = paradasRelidas.find((p) => p.cliente.includes(nomes[0]!))?.chave;
  const chaveB = paradasRelidas.find((p) => p.cliente.includes(nomes[1]!))?.chave;
  expect(chaveA && chaveB, "não achei as chaves das duas paradas").toBeTruthy();

  return { id, nomes, chaves: [chaveA!, chaveB!] };
}

async function abrirRota(page: Page, carga: CargaDuasParadas): Promise<void> {
  const url = `/app/expedicao/${carga.id}/rota`;
  const erro = page.getByText("Não foi possível carregar esta carga.");
  const etapa = page.locator("#etapa-ordem");

  // O GET do detalhe pode falhar transitoriamente num Supabase local
  // compartilhado; a própria tela oferece "Tentar novamente". Usar o retry do
  // produto é diferente de tolerar a falha: sem ele, o teste falha por 500 de
  // ambiente, não pelo comportamento em medição.
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    await page.goto(url);
    await expect(etapa.or(erro)).toBeVisible({ timeout: 120_000 });
    if (await etapa.isVisible()) break;
    await page.getByRole("button", { name: "Tentar novamente" }).click();
  }

  await expect(etapa).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("[data-linha-parada]")).toHaveCount(2, { timeout: 120_000 });
}

async function abrirOutrasFormas(page: Page): Promise<void> {
  const resumo = page.locator("summary").filter({ hasText: "Outras formas de calcular" });
  const botao = page.getByRole("button", { name: "Geocodificar endereços" });
  if (!(await botao.isVisible())) await resumo.click();
  await expect(botao).toBeVisible();
}

async function recalcularPorGeocodificacao(page: Page, carga: CargaDuasParadas): Promise<void> {
  await abrirOutrasFormas(page);
  const post = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/shipments/${carga.id}/rota/geocodificar`) &&
      r.request().method() === "POST",
    { timeout: 120_000 },
  );
  const recarga = page.waitForResponse(
    (r) =>
      new RegExp(`/api/v1/shipments/${carga.id}/rota$`).test(r.url()) &&
      r.request().method() === "GET",
    { timeout: 120_000 },
  );
  await page.getByRole("button", { name: "Geocodificar endereços" }).click();
  await post;
  await recarga;
}

test.beforeEach(async ({ page }) => {
  // Manager, não admin: o Supabase local é compartilhado e outra sessão
  // reenrola o TOTP do admin no meio do run (medido em 27/11/2026). O manager
  // tem as mesmas permissões de operação da expedição e não exige segundo
  // fator; o comportamento medido é o mesmo.
  const creds = lerCreds();
  await page.goto("/login");
  await page.locator("#email").fill(creds.users.manager!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 60_000 });
});

test("ordem manual sobrevive ao recálculo — inclusive depois de salva", async ({ page }) => {
  const carga = await criarCargaComDuasParadas(page, "ORDEM");
  await abrirRota(page, carga);

  const linhas = page.locator("[data-linha-parada]");
  await expect(linhas.first()).toContainText(carga.nomes[0]);

  // Manual A → B, ainda sem salvar.
  await linhas.filter({ hasText: carga.nomes[0] }).getByRole("button", { name: "Descer" }).click();
  await expect(linhas.first()).toContainText(carga.nomes[1]);

  // Recálculo sem mudança de paradas: a ordem da tela não pode ser descartada
  // pelo recarregar.
  await recalcularPorGeocodificacao(page, carga);
  await expect(linhas.first()).toContainText(carga.nomes[1]);

  // Salva e recarrega: a ordem persistida é a manual.
  const salvou = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/shipments/${carga.id}/rota/ordem`) &&
      r.request().method() === "PATCH",
    { timeout: 120_000 },
  );
  await page.getByRole("button", { name: "Salvar ordem" }).click();
  await salvou;
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Rota salva" }).first()).toBeVisible({ timeout: 60_000 });

  await page.reload();
  await expect(page.locator("#etapa-ordem")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-linha-parada]").first()).toContainText(carga.nomes[1]);

  // E um novo recálculo depois do reload não reverte a ordem persistida.
  await recalcularPorGeocodificacao(page, carga);
  await expect(page.locator("[data-linha-parada]").first()).toContainText(carga.nomes[1]);
});

test("descartar proposta volta à ordem persistida, sem PATCH", async ({ page }) => {
  const carga = await criarCargaComDuasParadas(page, "DESCARTE");
  await abrirRota(page, carga);

  // A resposta da otimização é controlada: o que se mede aqui é o descarte na
  // UI, não o solver. A proposta inverte A/B.
  await page.route(new RegExp(`/api/v1/shipments/${carga.id}/rota/otimizar$`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          ordem: [carga.chaves[1], carga.chaves[0]],
          origem: null,
          retornar_origem: false,
          tempo_parada_min: 10,
          modo: "distancia",
          distancia_m: 1000,
          duracao_dirigindo_s: 120,
          duracao_total_s: 1320,
          geometria: [],
          provedor: "teste",
          ruas: true,
          nao_roteirizaveis: [],
        },
      }),
    }),
  );

  await abrirOutrasFormas(page);
  await page.getByRole("button", { name: "Ordenar por distância em linha reta" }).click();

  const linhas = page.locator("[data-linha-parada]");
  await expect(linhas.first()).toContainText(carga.nomes[1]);
  await expect(page.getByRole("button", { name: "Descartar proposta" })).toBeVisible();

  const escritas: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes(`/api/v1/shipments/${carga.id}/rota/ordem`)) {
      escritas.push(r.url());
    }
  });

  await page.getByRole("button", { name: "Descartar proposta" }).click();

  await expect(linhas.first()).toContainText(carga.nomes[0]);
  await expect(page.getByRole("button", { name: "Descartar proposta" })).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(escritas, "descartar proposta não pode gravar a ordem").toEqual([]);
});

test("estados: erro real da ficha, carregando a rota e vazio legítimo", async ({ page }) => {
  const carga = await criarCargaComDuasParadas(page, "ESTADOS");

  // 1. Erro real: o GET do detalhe devolve 500. A tela tem de dizer o erro,
  // não cair no vazio.
  const detalhe = new RegExp(`/api/v1/shipments/${carga.id}$`);
  await page.route(detalhe, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal_error", message: "500 de teste" } }),
    }),
  );
  await page.goto(`/app/expedicao/${carga.id}`);
  await expect(page.getByText("Não foi possível carregar esta carga.")).toBeVisible({
    timeout: 30_000,
  });
  await page.unroute(detalhe);

  // 2. Loading: o GET da rota fica 2,5s pendente; o skeleton com o texto tem
  // de estar visível — e sumir quando a resposta chega.
  let liberarRota: () => void = () => {};
  const rotaPendente = new Promise<void>((resolver) => {
    liberarRota = resolver;
  });
  await page.route(new RegExp(`/api/v1/shipments/${carga.id}/rota$`), async (route) => {
    // Segura a resposta até o texto de loading aparecer. Um atraso fixo de
    // 2,5s podia terminar antes de o detalhe carregar e o texto nunca existir;
    // assim o estado "carregando rota" é observado de verdade.
    await rotaPendente;
    await route.continue();
  });
  await page.goto(`/app/expedicao/${carga.id}/rota`);
  await expect(page.getByText("Carregando rota…")).toBeVisible({ timeout: 120_000 });
  liberarRota();
  await expect(page.getByText("Carregando rota…")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator("#etapa-ordem")).toBeVisible({ timeout: 120_000 });

  // 3. Vazio legítimo: a lista tem a carga, a busca não acha nada e a tela
  // diz isso com ação de limpar — não é falha silenciosa.
  await page.goto("/app/expedicao");
  await page.getByLabel("Buscar carga").fill(`SEM-RESULTADO-${Date.now()}`);
  await expect(page.getByText("Nenhuma carga encontrada com esse termo.").first()).toBeVisible({
    timeout: 20_000,
  });
});
