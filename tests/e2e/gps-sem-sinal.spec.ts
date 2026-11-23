/**
 * GPS AUSENTE/DESATUALIZADO — a tela NUNCA chama ausência de "online".
 *
 * Duas provas no navegador contra o backend local:
 *  1. carga em rota sem posição → "Sem posição recebida do motorista.";
 *  2. posição recente + relógio avançado 20 min → "sem sinal há N min".
 * O relógio é controlado com `page.clock` DEPOIS do login, para não atrapalhar
 * o TOTP; a posição é gravada de verdade pela rota de GPS (o `em` vem do
 * servidor, não do relógio do navegador).
 */
import { expect, test } from "@playwright/test";

import { criarCargaEmRota } from "./helpers/expedicao";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test.setTimeout(300_000);

test("sem posição recebida: o cartão diz isso e não diz online", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());
  const carga = await criarCargaEmRota(page, "GPS-SEM");

  await page.goto(`/app/expedicao/${carga.id}/rota`);
  const estado = page.getByTestId("gps-estado");
  await expect(estado).toBeVisible({ timeout: 30_000 });
  await expect(estado).toContainText("Sem posição recebida do motorista.");
  await expect(estado).not.toContainText(/online/i);
});

test("posição desatualizada: sem sinal há N min, nunca online", async ({ page }) => {
  await page.clock.install();
  await loginComoAdmin(page, lerCreds());
  const carga = await criarCargaEmRota(page, "GPS-VELHO");

  const ping = await page.request.post(`/api/v1/shipments/${carga.id}/rota/posicao`, {
    data: { latitude: -26.3045, longitude: -48.8487, precisao_m: 12 },
  });
  expect(ping.ok(), `ping de GPS recusado: ${await ping.text()}`).toBeTruthy();

  await page.goto(`/app/expedicao/${carga.id}/rota`);
  const estado = page.getByTestId("gps-estado");
  await expect(estado).toContainText(/Última posição às/i, { timeout: 30_000 });
  await expect(estado).not.toContainText(/sem sinal/i);

  // O limite padrão é 15 min (GPS_SEM_SINAL_MINUTOS); 20 min passa dele.
  await page.clock.fastForward(20 * 60 * 1000);
  await expect(estado).toContainText(/sem sinal há \d+ min/i, { timeout: 15_000 });
  await expect(estado).not.toContainText(/online/i);
});
