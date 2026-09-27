import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { semearContato, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Jornada 3 — IA (§86): mensagem → intent → contexto → agente → ferramenta →
 * proposta → aprovação → ação, no Decision Log (`/app/ai/decisoes`, §38).
 *
 * Mapeamento para a UI real:
 *
 * - **proposta**: `POST /api/v1/ai/decisions/propose` roda o Sales Brain
 *   DETERMINÍSTICO (Brain não é LLM — `brainDoLote` é função pura sobre os
 *   pedidos): o radar acha o contato (primeira compra) e `decidir()` monta
 *   intenção/ferramenta/nível/política — a decisão nasce sem chave de IA;
 * - **proposta na tela**: o card no Decision Log mostra a ação, a ferramenta,
 *   o nível e a política aplicada, com "Aprovar"/"Recusar";
 * - **aprovação**: `POST .../decide` registra `ai.action.approved` linkado à
 *   proposta (cadeia de custódia) — aprovar NÃO executa nada sozinho;
 * - **ação**: botão "Executar" → `POST .../executar`. O ÚNICO executor
 *   implementado é `agendar_followup`; `gerar_abordagem` responde 422
 *   honesto "Ferramenta sem executor" — executar sem rampa seria ação
 *   fantasma (§38).
 *
 * LACUNAS declaradas: **mensagem → intent → contexto → agente** dependem de
 * LLM — no e2e não há chave (`ai_gateway_key_missing`) e o classificador cai
 * no fallback declarado do roteador; esta metade da jornada é condição de
 * saída, não fingida aqui.
 */
test("jornada 3 (ia) — proposta do Brain vira aprovação e a ação é honesta no Decision Log", async ({
  page,
}) => {
  const carimbo = Date.now();
  const cliente = `Cliente Jornada IA ${carimbo}`;

  await loginComoAdmin(page, lerCreds());
  const produtoId = await semearProduto(page, `Produto Jornada IA ${carimbo}`);
  const contactId = await semearContato(page, cliente);
  await semearPedido(page, cliente, { produtoId, contactId });

  // 1. Proposta — disparo humano (agent+), nunca cron silencioso. O pedido
  //    com contato real é o que o radar transforma em recomendação.
  const propose = await page.request.post("/api/v1/ai/decisions/propose", {
    data: { nivel: 1, limit: 50 },
  });
  expect(propose.ok(), `propose respondeu ${propose.status()}`).toBe(true);
  const corpo = (await propose.json()) as {
    data: { decisoes: { contact_id: string; ferramenta: string }[] };
  };
  expect(
    corpo.data.decisoes.length,
    "o Brain encontrou ao menos uma recomendação para propor",
  ).toBeGreaterThan(0);
  // O banco compartilhado tem recomendações de outras specs; a nossa é a
  // preferida, mas a jornada se prova em QUALQUER proposta pendente (o
  // fluxo proposta → aprovação → ação é o mesmo).
  const alvo =
    corpo.data.decisoes.find((d) => d.contact_id === contactId) ??
    corpo.data.decisoes[0]!;

  // 2. Decision Log: o card pendente carrega ação, ferramenta, nível e política.
  await page.goto("/app/ai/decisoes");
  await expect(page.getByText("Política de execução")).toBeVisible({ timeout: 20_000 });
  const card = page
    .locator("li")
    .filter({ has: page.locator(`a[href="/app/contacts/${alvo.contact_id}"]`) })
    .first();
  await expect(card, "a proposta aparece em Aguardando decisão").toBeVisible({
    timeout: 15_000,
  });
  await expect(
    card.getByText("Gerar abordagem de recompra e enviar para aprovação.", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("Ferramenta: gerar_abordagem")).toBeVisible();
  await expect(card.getByText("Nível: 1")).toBeVisible();
  await expect(card.getByText("Política: autonomia-nivel-1")).toBeVisible();

  // 3. Aprovar — registrado, não executado: a aba já decididas ganha a linha
  //    com badge "Aprovada" e o botão "Executar".
  await card.getByRole("button", { name: "Aprovar" }).click();
  await page.getByRole("tab", { name: /Já decididas/ }).click();
  // O histórico vem da auditoria em ordem DESC: a linha com botão "Executar"
  // mais recente é a que acabou de nascer.
  const historico = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: "Executar", exact: true }) })
    .first();
  await expect(historico, "a aprovação entra no histórico").toBeVisible({ timeout: 15_000 });
  await expect(historico.getByText("Aprovada", { exact: true })).toBeVisible();

  // 4. Executar — único executor é agendar_followup; para gerar_abordagem a
  //    rota responde o 422 honesto e a tela deixa passar o texto da rota.
  await historico.getByRole("button", { name: "Executar", exact: true }).click();
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Ferramenta sem executor: gerar_abordagem" })
    .first();
  await expect(toast, "a ação sem executor é dita, não fingida").toBeVisible({
    timeout: 20_000,
  });
});
