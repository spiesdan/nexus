/**
 * FILA OFFLINE DE DESFECHOS — retry, idempotência e conflito (P1-5).
 *
 * ─── BLOQUEIO DECLARADO (não simular sucesso) ──────────────────────────────
 * O desfecho offline do entregador depende do aparelho real (ou do shell do
 * APK com `jeep-sqlite` + sessão autenticada cross-origin). Neste repo as
 * provas existem EM CAMADAS: `lib/entregas/outbox.ts` tem testes de unidade da
 * fila, `offline-outbox-sync.test.ts` cobre o dreno e
 * `pedido-idempotencia.spec.ts` prova a chave no servidor. Um teste que
 * fingisse rede com `page.route` não provaria o dreno do aparelho — provaria
 * um fetch mockado. Por isso os três casos abaixo ficam `fixme` com o motivo,
 * em vez de passarem falsos.
 *
 * O que Serial quando houver aparelho pareado:
 *  1. sem rede → "Marcar como entregue" grava em `entregas-outbox-v1`;
 *  2. volta a rede → o dreno PATCHa e a fila esvazia; reenviar a mesma chave
 *     (`orderId`) não cria segundo envio;
 *  3. dois desfechos para o mesmo `orderId` → a fila mantém UM (substituição
 *     por orderId) e o servidor recusa o conflito sem perder o primeiro.
 */
import { expect, test } from "@playwright/test";

import { criarCargaEmRota } from "./helpers/expedicao";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test.setTimeout(300_000);

test.fixme(
  "sem rede: o desfecho entra na fila e sobrevive ao recarregar",
  async ({ page }) => {
    await loginComoAdmin(page, lerCreds());
    const carga = await criarCargaEmRota(page, "FILA-OFF");
    await page.context().setOffline(true);
    await page.goto(`/app/expedicao/${carga.id}/motorista`);
    await page.getByRole("button", { name: /Marcar como entregue/ }).first().click();
    const pendentes = await page.evaluate(
      () => JSON.parse(localStorage.getItem("entregas-outbox-v1") ?? "[]") as unknown[],
    );
    expect(pendentes).toHaveLength(1);
  },
);

test.fixme(
  "volta a rede: sincroniza uma vez; reenvio com o mesmo orderId não duplica",
  async ({ page }) => {
    await loginComoAdmin(page, lerCreds());
    const carga = await criarCargaEmRota(page, "FILA-SYNC");
    await page.goto(`/app/expedicao/${carga.id}/motorista`);
    await page.getByRole("button", { name: "Sincronizar" }).click();
    await expect(
      page.getByText(/aguardando envio \(sem internet\)/),
    ).toHaveCount(0, { timeout: 30_000 });
  },
);

test.fixme(
  "conflito: dois desfechos para o mesmo pedido não perdem o primeiro",
  async ({ page }) => {
    await loginComoAdmin(page, lerCreds());
    const carga = await criarCargaEmRota(page, "FILA-CONF");
    await page.goto(`/app/expedicao/${carga.id}/motorista`);
    const pendentes = await page.evaluate(
      () => JSON.parse(localStorage.getItem("entregas-outbox-v1") ?? "[]") as Array<{ orderId: string }>,
    );
    expect(new Set(pendentes.map((p) => p.orderId)).size).toBe(pendentes.length);
  },
);
