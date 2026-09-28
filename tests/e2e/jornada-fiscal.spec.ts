import { expect, test } from "@playwright/test";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { rotuloDoPedido, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Jornada 6 — Fiscal (§86): pedido → faturar → emitir → autorização → DANFE.
 *
 * Mapeamento para a UI real:
 *
 * - **faturar**: o mesmo "Faturar pedido" da ficha da Jornada 5 — a nota só
 *   nasce de pedido `faturado`;
 * - **configuração**: a aba Configuração de `/app/notas` guarda o emitente
 *   (CNPJ, IE, UF, IBGE, certificado); sem ela a emissão responde 422
 *   apontando esta tela;
 * - **emitir**: a aba Emitir enfileira a nota (`em_emissao` + job na fila
 *   fiscal) — "quem chama nunca espera a SEFAZ";
 * - **autorização**: o tick `POST /api/v1/cron/fiscal-drain` processa a fila.
 *   Com o provedor stub (instalação sem sidecar) a nota volta para
 *   `pendente` com o motivo `FALTA_EMISSOR` — é o estado honesto de "sem
 *   emissor": registrado, não autorizado, e a tela diz o que falta.
 *
 * LACUNAS declaradas (não fingidas): autorização real e DANFE dependem de
 * emissor + certificado da SEFAZ — o stub nunca gera XML (`tem_xml` false é
 * justamente por isso, e é por isso que "Ver DANFE" não aparece).
 */
test("jornada 6 (fiscal) — faturar, configurar emitente e emitir cai no estado honesto sem emissor", async ({
  page,
}) => {
  const carimbo = Date.now();
  const cliente = `Empresa Jornada Fiscal ${carimbo}`;

  await loginComoAdmin(page, lerCreds());
  // NCM de 8 dígitos: a pre-validação do payload fiscal cobra NCM por item
  // ANTES da SEFAZ (nunca o fiscal é a primeira a dizer que falta NCM).
  const produtoId = await semearProduto(page, `Produto Jornada Fiscal ${carimbo}`, {
    ncm: "84713012",
  });
  // Pedido AVULSO (sem contato): com contato, a pre-validação exige endereço
  // completo dele como pendência adicional — esta jornada mede o
  // faturamento e a emissão honesta, não a caderneta do cliente.
  const pedido = await semearPedido(page, cliente, { produtoId });
  const numero = rotuloDoPedido(pedido.numero);

  // 1. Faturar pela ficha: `aprovado → faturado` habilita o pedido na aba Emitir.
  await page.goto(`/app/pedidos/${pedido.id}`);
  await expect(page.getByRole("heading", { level: 1, name: numero })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Faturar pedido" }).click();
  await expect(page.getByText("Faturado", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  // 2. Configuração do emitente: os campos que a pre-validação do SPED exige
  //    (documento, IE, UF, IBGE de 7 dígitos, certificado + senha).
  await page.goto("/app/notas?aba=config");
  await expect(page.getByRole("heading", { level: 1, name: /notas fiscais/i })).toBeVisible({
    timeout: 20_000,
  });
  // Hidratação antes dos fills: um input controlado preenchido antes do
  // React montar perde o onChange e o PUT sai incompleto (mesmo guard da
  // Jornada 5).
  await page.waitForTimeout(1_500);
  await page.locator("#doc").fill("11222333000181");
  await page.locator("#ie").fill("123456789");
  await page.locator("#uf").fill("SP");
  await page.locator("#codmun").fill("3550308");
  await page.locator("#logradouro").fill("Rua das Nacoes");
  await page.locator("#numero-end").fill("1000");
  await page.locator("#bairro").fill("Centro");
  await page.locator("#municipio").fill("Sao Paulo");
  await page.locator("#cep").fill("01001000");
  await page.locator("#cert-path").fill("/certs/e2e.pfx");
  await page.locator("#cert-senha").fill("segredo-e2e");
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Configuração salva" })
      .first(),
  ).toBeVisible({ timeout: 20_000 });

  // 3. Emitir: escolher o pedido faturado e enfileirar (nasce `em_emissao`).
  await page.goto("/app/notas?aba=emitir");
  await expect(page.getByRole("heading", { level: 1, name: /notas fiscais/i })).toBeVisible({
    timeout: 20_000,
  });
  // Mesma guarda de hidratação antes de mexer no `select` controlado: sem
  // ela o onChange não grava, o botão continua desabilitado e o clique morre.
  await page.waitForTimeout(1_500);
  await page.locator("#pedido-nota").selectOption(pedido.id);
  await page.getByRole("button", { name: "Emitir nota", exact: true }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Nota enfileirada para emissão" })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/aba=notas/, { timeout: 20_000 });

  // 4. Grade: filtrar pela nossa pessoa — a nota está "Emitindo" (fila, não SEFAZ).
  await page.waitForTimeout(1_500);
  // Regex porque o rótulo da grade termina em reticências ("Buscar nota…").
  await page.getByLabel(/^Buscar nota/).fill(cliente);
  const linha = page.getByRole("row").filter({ hasText: cliente });
  await expect(linha, "a nota do nosso pedido aparece na grade").toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(linha.getByText("Emitindo", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 5. Tick da fila: stub nunca autoriza — volta para `pendente` com
  //    FALTA_EMISSOR. Até 5 ticks porque o drain pega só 2 jobs vencidos por
  //    tick e o banco compartilhado pode ter fila de outras specs.
  const env = carregarEnvLocal();
  const secret = env.INTERNAL_CRON_SECRET || env.INTERNAL_SECRET;
  expect(secret, "fiscal-drain exige INTERNAL_CRON_SECRET ou INTERNAL_SECRET no .env.local").toBeTruthy();
  let aterrissou = false;
  for (let i = 0; i < 5 && !aterrissou; i++) {
    const tick = await page.request.post("/api/v1/cron/fiscal-drain", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(tick.ok(), `drain tick ${i + 1} respondeu ${tick.status()}`).toBe(true);
    await page.reload();
    // Hidratação da grade de novo depois do reload (o estado local da busca zera).
    await page.waitForTimeout(1_500);
    await page.getByLabel(/^Buscar nota/).fill(cliente);
    aterrissou = (await linha.getByText("Pendente", { exact: true }).count()) > 0;
    if (!aterrissou) await page.waitForTimeout(1_000);
  }
  expect(
    aterrissou,
    "o drain devolveu a nota para pendente com o motivo do stub",
  ).toBe(true);

  // 6. Detalhe honesto: "Retorno da SEFAZ" mostra o motivo (FALTA_EMISSOR) e
  //    o DANFE não existe sem XML autorizado.
  await linha.getByRole("button", { name: "Detalhe" }).click();
  const expandida = page.getByRole("row").filter({ hasText: "Retorno da SEFAZ" });
  await expect(expandida).toBeVisible({ timeout: 15_000 });
  // A mensagem aparece DUAS vezes na linha expandida (resumo + detalhe):
  // `.first()` porque o texto é o mesmo e o sentido é o mesmo.
  await expect(expandida.getByText(/Sem emissor fiscal configurado/).first()).toBeVisible();
  await expect(
    expandida.getByText("Ver DANFE"),
    "DANFE só existe com XML autorizado — stub nunca gera",
  ).toHaveCount(0);
});
