/**
 * J14 NA CAMADA DE NAVEGADOR — o ciclo LGPD pela tela do DPO: sucesso, erro e recuperação.
 *
 * A J14 existe sem prova de navegador: `j14-lgpd-ciclo` prova rota e
 * `j14-lgpd-aprovar-pela-tela` prova o componente. O que faltava é a tela que a
 * pessoa com papel `admin` usa de verdade — abrir a solicitação, ver a prévia
 * mascarada, aprovar com justificativa e ver o estado mudar na mesma página.
 *
 * ─── Os três desfechos ──────────────────────────────────────────────────────
 *
 *   1. **sucesso**     — prévia abre com as contagens; aprovar com justificativa
 *                        muda o status para "Processando" e deixa a trilha
 *                        (`lgpd.manually_approved`) na própria tela;
 *   2. **erro**        — a primeira confirmação de OUTRA solicitação é abortada
 *                        pelo navegador (rede instável, o caso real): a tela diz
 *                        "Falha ao aprovar…" e o status continua "Recebido" —
 *                        nunca um sucesso otimista;
 *   3. **recuperação** — sem a falha injetada, a mesma solicitação é aprovada e
 *                        vai para "Processando". O botão não travou.
 *
 * A falha é injetada no FIOS (`page.route` com `abort`), não mockada no módulo:
 * o POST não chega ao servidor, que é exatamente o que uma queda de rede faz.
 * As duas solicitações nascem semeadas porque a tela não cria solicitação — ela
 * vem de API/webhook (ver `app/api/v1/lgpd/requests`).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

import { entrarComoAdmin } from "./helpers/entrar-como-admin";
import { semearCredenciais, type CredsE2E } from "./helpers/login-admin";

const EVIDENCE = path.join(process.cwd(), "evidence/jornadas-2026-11-19");

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Re-semeado no `beforeAll`: outra sessão pode ter rotacionado o fator TOTP
// do admin desde a última execução, e o `.e2e-creds.json` em disco é a única
// fonte que o login lê.
let creds: CredsE2E;
// `org_id` está no arquivo (o seed escreve), mas não na interface do helper.
let orgId: string;

let pedidoOk: string;
let pedidoErro: string;
let contactId: string | null;

async function semearSolicitacao(): Promise<string> {
  const { data, error } = await admin
    .from("lgpd_requests")
    .insert({
      organization_id: orgId,
      request_type: "data_request",
      source: "manual",
      status: "received",
      contact_id: contactId,
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      request_payload: { origem: "e2e-j14" },
      scope: "contact",
    })
    .select("id")
    .single();
  if (error) throw new Error(`não consegui semear lgpd_requests: ${error.message}`);
  return (data as { id: string }).id;
}

test.describe("J14 — aprovar solicitação LGPD pela tela", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    creds = semearCredenciais();
    orgId = (creds as unknown as { org_id: string }).org_id;

    const { data: contato } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_anonymized", false)
      .not("phone_number", "is", null)
      .limit(1)
      .maybeSingle();
    contactId = (contato as { id: string } | null)?.id ?? null;

    // Restos de execuções anteriores (a suíte reusa o banco): sem isto a lista
    // enche e a linha desta rodada pode cair fora da primeira página.
    await admin
      .from("lgpd_requests")
      .delete()
      .eq("organization_id", orgId)
      .eq("request_payload->>origem", "e2e-j14");

    pedidoOk = await semearSolicitacao();
    pedidoErro = await semearSolicitacao();
  });

  test.afterAll(async () => {
    const ids = [pedidoOk, pedidoErro].filter(Boolean);
    if (ids.length > 0) await admin.from("lgpd_requests").delete().in("id", ids);
  });

  test("prévia, aprovação com justificativa, falha de rede e recuperação", async ({ page }) => {
    await entrarComoAdmin(page, creds);

    // ─── 0. A PORTA: a lista do DPO abre e mostra a solicitação ──────────────
    await page.goto("/app/lgpd/requests");
    await expect(
      page.getByRole("heading", { level: 1, name: "Solicitações LGPD" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(pedidoOk.slice(0, 8)).first()).toBeVisible({ timeout: 30_000 });

    // ─── 1. SUCESSO: prévia mascarada e aprovação com justificativa ──────────
    await page.goto(`/app/lgpd/requests/${pedidoOk}`);
    await expect(page.getByText("Recebido", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Pré-visualizar dados" }).click();
    const previa = page.getByRole("dialog");
    await expect(previa.getByText("Prévia de dados do titular")).toBeVisible({ timeout: 30_000 });
    // A prévia conta o que será entregue — e não despeja CPF/telefone crus.
    await expect(previa.getByText("Conversas", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(previa.getByText("Entradas de auditoria", { exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, "j14-01-previa-da-solicitacao.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Aprovar export" }).click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo.getByText("Aprovar exportação de dados")).toBeVisible();

    // O guard da justificativa: menos de 10 caracteres NÃO confirma.
    const confirmar = dialogo.getByRole("button", { name: "Confirmar aprovação" });
    await expect(confirmar).toBeDisabled();
    const justificativa = dialogo.getByLabel(/Justificativa/);
    await justificativa.fill("curta");
    await expect(confirmar).toBeDisabled();

    await justificativa.fill("Titular solicitou os dados pelo canal de suporte (e2e).");
    await expect(confirmar).toBeEnabled();
    await confirmar.click();

    await expect(page.getByText("Aprovação registrada — request mudou para processing")).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByText("Processando", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // A trilha de auditoria aparece na MESMA tela, e é o registro que sobrevive.
    await expect(page.getByText("lgpd.manually_approved")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(EVIDENCE, "j14-02-aprovada-e-auditada.png"),
      fullPage: true,
    });

    // ─── 2. ERRO: a rede cai no POST e a tela NÃO finge sucesso ───────────────
    await page.goto(`/app/lgpd/requests/${pedidoErro}`);
    await expect(page.getByText("Recebido", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await page.route("**/api/v1/lgpd/requests/*/approve", (rota) => rota.abort("failed"));
    await page.getByRole("button", { name: "Aprovar export" }).click();
    await page
      .getByRole("alertdialog")
      .getByLabel(/Justificativa/)
      .fill("Titular solicitou os dados por e-mail (e2e, tentativa 1).");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirmar aprovação" })
      .click();

    await expect(
      page.getByText("Falha ao aprovar a solicitação. Tente novamente."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Recebido", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Processando", { exact: true }).first()).toHaveCount(0);
    await page.screenshot({
      path: path.join(EVIDENCE, "j14-03-falha-de-rede-nao-vira-sucesso.png"),
      fullPage: true,
    });

    // ─── 3. RECUPERAÇÃO: a rede volta e a MESMA solicitação é aprovada ───────
    // O diálogo continua aberto depois da falha (é o contrato do `handleConfirm`:
    // só fecha no sucesso), então a nova tentativa é o MESMO botão — sem
    // reabrir nada.
    await page.unroute("**/api/v1/lgpd/requests/*/approve");
    await page
      .getByRole("alertdialog")
      .getByLabel(/Justificativa/)
      .fill("Titular solicitou os dados por e-mail (e2e, tentativa 2).");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirmar aprovação" })
      .click();

    await expect(page.getByText("Aprovação registrada — request mudou para processing")).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByText("Processando", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(EVIDENCE, "j14-04-recuperada-apos-a-falha.png"),
      fullPage: true,
    });
  });
});
