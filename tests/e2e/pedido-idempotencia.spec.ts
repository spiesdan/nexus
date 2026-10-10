/**
 * IDEMPOTÊNCIA DO PEDIDO AO VIVO — dois POSTs, um pedido.
 *
 * ─── Por que este teste existe separado dos 8 de unidade ────────────────────
 *
 * Os 8 de `pedido-chave-sincronizacao.test.ts` rodam contra um fake que IMITA
 * a unique `(organization_id, chave)`. Se a migration 0263 não existir no banco
 * real, ou o índice estiver sem o escopo por org, os 8 passam e a produção
 * duplica. Este teste é o que amarra o código ao banco de verdade.
 *
 * É também o elo que falta no ciclo offline: o shell enfileira (provado em
 * `mobile-offline.spec.ts`), o dreno manda com a chave (provado em unidade) —
 * e AQUI se prova que o servidor cumpre a parte dele.
 */
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { lerCreds, loginComoDono } from "./helpers/login-admin";
import { semearProduto } from "./helpers/pedidos";

test.setTimeout(120_000);

test("idempotência ao vivo: retry com a mesma chave não duplica", async ({ page }) => {
  const creds = lerCreds();
  await loginComoDono(page, creds);

  const produtoId = await semearProduto(page, `Produto Idempotência ${Date.now()}`);
  const chave = randomUUID();
  const corpo = {
    cliente_nome: "Cliente do Retry",
    status: "rascunho",
    chave_sincronizacao: chave,
    itens: [{ product_id: produtoId, quantidade: 1, preco_unit_cents: 1000 }],
  };

  const r1 = await page.request.post("/api/v1/commercial-orders", { data: corpo });
  expect(r1.ok(), `primeiro POST → ${r1.status()}`).toBeTruthy();
  expect(r1.status()).toBe(201);
  const j1 = (await r1.json()) as { data: { id: string; numero: number; ja_existia: boolean } };
  expect(j1.data.ja_existia).toBe(false);

  // O retry: timeout estourou, o celular mandou de novo.
  const r2 = await page.request.post("/api/v1/commercial-orders", { data: corpo });
  expect(r2.ok(), `retry → ${r2.status()}`).toBeTruthy();
  expect(r2.status()).toBe(200);
  const j2 = (await r2.json()) as { data: { id: string; numero: number; ja_existia: boolean } };
  expect(j2.data.ja_existia).toBe(true);
  expect(j2.data.id).toBe(j1.data.id);
  expect(j2.data.numero).toBe(j1.data.numero);

  // E a listagem confirma: um pedido só com esta chave.
  const lista = await page.request.get("/api/v1/commercial-orders");
  expect(lista.ok()).toBeTruthy();
  const corpo2 = (await lista.json()) as { data: { id: string }[] };
  const mesmos = corpo2.data.filter((p) => p.id === j1.data.id);
  expect(mesmos).toHaveLength(1);
});
