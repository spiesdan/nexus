import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoDono, type CredsE2E } from "./helpers/login-admin";

test.setTimeout(240_000);
test.use({ locale: "pt-BR" });
test.describe.configure({ mode: "serial" });

let creds: CredsE2E = lerCreds();

/**
 * Meu Dia (§21) — a refatoração de 2026-10: a tela deixou de ser "três listas
 * iguais" e virou a linha do tempo do dia (Atrasado → Hoje → Amanhã → Mais
 * tarde) com a coluna de contexto. O que esta spec prova de ponta a ponta:
 *
 *  1. a saudação vem do RELÓGIO do navegador (Bom dia/Boa tarde/Boa noite) —
 *     o "Bom dia" fixo à noite era o defeito;
 *  2. as tarefas semeadas na rota `/api/v1/tarefas` (a mesma que a tela lê,
 *     com `responsavel=minhas`) caem nos grupos certos;
 *  3. **Concluir** funciona de verdade: PATCH → refetch → a linha some;
 *  4. nenhuma tela de erro ("Algo deu errado" / "Erro ao carregar…") e as
 *     colunas existem nas DUAS larguras (1280 e 390), com evidência PNG.
 *
 * A agenda e as mensagens da coluna direita têm cobertura de unidade
 * (`meu-dia-linha-do-tempo`, `lib/meu-dia/dia.test.ts`) — semear agendamento
 * exigiria event_type + jornada, e a pergunta desta spec é "a tela monta e
 * age?", não "o Google Calendar cria eventos?".
 */
const chave = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const AGORA = new Date();
const HOJE = chave(AGORA);
const ONTEM = chave(new Date(AGORA.getFullYear(), AGORA.getMonth(), AGORA.getDate() - 1));
const CARIMBO = Date.now();
const TITULO_ATRASADA = `Meu dia atrasada ${CARIMBO}`;
const TITULO_HOJE = `Meu dia hoje ${CARIMBO}`;

async function saudavel(page: Page) {
  await expect(page.getByText("Algo deu errado")).toHaveCount(0);
  await expect(page.getByText(/Erro ao (carregar|listar)/)).toHaveCount(0);
}

test.beforeAll(() => {
  creds = lerCreds();
});

test("meu dia: linha do tempo monta, Concluir some a tarefa e a tela não quebra", async ({ page }) => {
  await loginComoDono(page, creds);

  // Semeia pela MESMA rota que a tela lê — o filtro `responsavel=minhas`
  // (minhas + sem dono) tem de achar o que o próprio usuário acabou de criar.
  const atrasada = await page.request.post("/api/v1/tarefas", {
    data: { titulo: TITULO_ATRASADA, tipo: "retorno", agendada_para: ONTEM },
  });
  expect(atrasada.ok(), `POST tarefa atrasada → ${atrasada.status()}`).toBeTruthy();
  const idAtrasada = ((await atrasada.json()) as { data: { id: string } }).data.id;
  const deHoje = await page.request.post("/api/v1/tarefas", {
    data: { titulo: TITULO_HOJE, tipo: "retorno", agendada_para: HOJE },
  });
  expect(deHoje.ok(), `POST tarefa de hoje → ${deHoje.status()}`).toBeTruthy();

  // ---- desktop 1280: duas colunas, saudação pelo relógio ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/meu-dia");

  await expect(
    page.getByRole("heading", { level: 1, name: /(Bom dia|Boa tarde|Boa noite)/ }),
  ).toBeVisible({ timeout: 15_000 });

  // Grupos da linha do tempo com as tarefas certas dentro.
  await expect(page.getByRole("heading", { name: /^Atrasado/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Hoje/ })).toBeVisible();
  await expect(page.getByText(TITULO_ATRASADA)).toBeVisible();
  await expect(page.getByText(TITULO_HOJE)).toBeVisible();

  // Coluna de contexto: os quatro blocos existem (vazios ou não).
  await expect(page.getByRole("heading", { name: "Mensagens" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Follow-ups ativos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recomendações" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pedidos e atalhos" })).toBeVisible();

  await saudavel(page);
  await page.screenshot({ path: "evidence/meu-dia/1-meu-dia-1280.png", fullPage: true });

  // ---- Concluir: PATCH + refetch, a linha some da tela ----
  const linha = page.locator("li", { hasText: TITULO_HOJE });
  await linha.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByText(TITULO_HOJE)).toHaveCount(0, { timeout: 10_000 });
  await saudavel(page);

  // ---- mobile 390: pilha única, a mesma tela em ordem ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/meu-dia");

  await expect(
    page.getByRole("heading", { level: 1, name: /(Bom dia|Boa tarde|Boa noite)/ }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /^Atrasado/ })).toBeVisible();
  await expect(page.getByText(TITULO_ATRASADA)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mensagens" })).toBeVisible();

  await saudavel(page);
  await page.screenshot({ path: "evidence/meu-dia/2-meu-dia-390.png", fullPage: true });

  // ---- limpeza: o banco do e2e é compartilhado entre specs, sem reset —
  // a atrasada sai da fila para não disputar nenhuma tela seguinte. ----
  const limpeza = await page.request.patch(`/api/v1/tarefas/${idAtrasada}`, {
    data: { status: "cancelada" },
  });
  expect(limpeza.ok(), `PATCH limpeza → ${limpeza.status()}`).toBeTruthy();
});
