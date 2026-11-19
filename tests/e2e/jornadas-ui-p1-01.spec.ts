/**
 * P1-01 — A PROVA DE UI que faltava para J6, J13 e J14.
 *
 * As rotas e os componentes já têm prova em Vitest (#570). Este arquivo abre o
 * NAVEGADOR contra o Supabase local e prova o que só a tela prova:
 *
 *   J6  — fechar a conversa pelo diálogo de confirmação e ver o estado mudar;
 *   J13 — o botão de sincronizar: 502 visível e RETRY funcionando no segundo
 *         clique (a SEFAZ é interceptada; nada sai para a rede de verdade);
 *   J14 — aprovar a solicitação de LGPD pela tela (o passo que dispara a
 *         anonimização) e baixar o CSV da trilha de auditoria.
 *
 * A anonimização em si não tem botão: ela é executada pela rota/worker, com
 * prova em `tests/unit/j14-lgpd-anonimizar.test.ts`. O que a tela oferece é a
 * aprovação — e é isso que este spec mede.
 *
 * Nada aponta para produção: a base é `http://localhost:3001` com `.env.e2e`
 * (Supabase local). Fixtures são semeadas por script e ressemeadas antes de
 * cada teste que muda estado.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { execNpx } from "./utils/npx";
import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "docs/auditoria/evidencias/jornadas-ui-2026-11-18");

interface CredsComFila extends CredsE2E {
  org_id?: string;
  queue?: { conversation_id: string; contact_name: string };
  lgpd?: { request_id: string; contact_id: string };
}

function creds(): CredsComFila {
  return lerCreds() as CredsComFila;
}

async function loginSimples(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 60_000 });
}

test.describe("P1-01 — UI das jornadas críticas", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(() => {
    fs.mkdirSync(EVIDENCIA, { recursive: true });
  });

  test("J6 · fechar a conversa pelo diálogo e ver o estado virar Fechada", async ({ page }) => {
    // Ressemeia a fila (idempotente) para a conversa existir e estar aberta.
    execNpx(["tsx", "scripts/seed-e2e-queue.ts"], { stdio: "inherit" });
    const c = creds();
    if (!c.queue) throw new Error("seed-e2e-queue não gravou o bloco queue");
    const manager = c.users.manager!;

    await loginSimples(page, manager.email, c.password);
    await page.goto(`/app/inbox/${c.queue.conversation_id}`);

    // O botão do cabeçalho da conversa; o `header` da casca também existe na
    // página, então o papel+ nome é o seletor estável.
    const fechar = page.getByRole("button", { name: "Fechar", exact: true });
    await expect(fechar).toBeVisible({ timeout: 60_000 });

    await fechar.click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo.getByText("Fechar esta conversa?")).toBeVisible();
    await dialogo.getByRole("button", { name: "Fechar" }).click();
    // O clique só valeu quando o diálogo sai de cena — esperar por ele evita
    // medir o "antes" do POST e ler o resultado como falha de produto.
    await expect(dialogo).toHaveCount(0);

    // O estado vem do servidor (close + invalidação da query), não de um
    // otimismo local: o selo do CABEÇALHO passa a "Fechada" e o botão some.
    //
    // `exact: true` não é estilo: sem ele `getByText("Fechada")` casa também o
    // rótulo da aba de filtros "Fechadas", que está SEMPRE na tela. Medido em
    // 19/11/2026: com o POST de fechar ainda em voo, esta linha passava contra
    // a aba e o teste só reprovava duas linhas abaixo — o diagnóstico apontava
    // para o botão, não para a asserção que mentiu.
    await expect(page.getByText("Fechada", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // Timeout explícito: o default de 5 s do `expect` é menor que o ida-e-volta
    // do POST + invalidação + refetch sob carga. Medido no trace do run que
    // reprovou: a requisição de `/close` ainda estava em voo aos 5 s.
    await expect(page.getByRole("button", { name: "Fechar", exact: true })).toHaveCount(0, {
      timeout: 30_000,
    });
    await page.screenshot({ path: path.join(EVIDENCIA, "50-j6-conversa-fechada.png"), fullPage: true });
  });

  test("J13 · 502 da SEFAZ fica visível e o retry sincroniza no segundo clique", async ({ page }) => {
    let criadas = 0;
    await page.route("**/api/v1/fiscal-entradas", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      criadas += 1;
      if (criadas === 1) {
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "internal_error", message: "SEFAZ inalcançável (teste)" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            novas: 1,
            atualizadas: 0,
            erros: 0,
            aviso: null,
            cstat: null,
            proximaTentativa: null,
          },
        }),
      });
    });

    const c = creds();
    await loginComoAdmin(page, c);
    await page.goto("/app/fiscal/sincronizacoes");

    const botao = page.getByRole("button", { name: "Sincronizar agora" });
    await expect(botao).toBeVisible({ timeout: 60_000 });

    await botao.click();
    // `showApiError` traduz o código (`internal_error`) para uma frase própria —
    // a mensagem crua da rota não é o que a pessoa lê. O que importa aqui é que
    // a falha FICA na tela e o botão volta a habilitar.
    await expect(page.getByText("Erro interno. Tente de novo em instantes.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(botao).toBeEnabled();

    await botao.click();
    await expect(page.getByText("1 nova(s), 0 atualizada(s), 0 erro(s).")).toBeVisible({
      timeout: 20_000,
    });
    expect(criadas).toBe(2);
    await page.screenshot({ path: path.join(EVIDENCIA, "51-j13-retry-apos-502.png"), fullPage: true });
  });

  test("J14 · aprovar a solicitação de LGPD pela tela (o passo que dispara a anonimização)", async ({
    page,
  }) => {
    // Idempotente: volta o pedido para `received` e o contato para o estado vivo.
    // O seed de LGPD depende do `crm_vivo` (pipeline/etapas) — numa base recém
    // semeada ele não existe, e a LGPD não é a dona dessa fixture.
    execNpx(["tsx", "scripts/seed-crm-vivo.ts"], { stdio: "inherit" });
    execNpx(["tsx", "scripts/seed-e2e-lgpd.ts"], { stdio: "inherit" });
    const c = creds();
    if (!c.lgpd) throw new Error("seed-e2e-lgpd não gravou o bloco lgpd");

    await loginComoAdmin(page, c);
    await page.goto(`/app/lgpd/requests/${c.lgpd.request_id}`);

    const abrir = page.getByRole("button", { name: /Aprovar anonimização/ });
    await expect(abrir).toBeVisible({ timeout: 60_000 });
    await abrir.click();

    const dialogo = page.getByRole("alertdialog");
    await dialogo
      .getByPlaceholder(/Descreva o motivo da aprovação/)
      .fill("Solicitação conferida pelo DPO no teste de UI.");
    await dialogo.getByRole("button", { name: "Confirmar aprovação" }).click();

    await expect(page.getByText(/Aprovação registrada/)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByText("Processando").first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(EVIDENCIA, "52-j14-lgpd-aprovada.png"),
      fullPage: true,
    });
  });

  test("J14 · exportar a trilha de auditoria em CSV pela tela", async ({ page }) => {
    const c = creds();
    await loginComoAdmin(page, c);
    await page.goto("/app/audit");

    const exportar = page.getByRole("button", { name: "Exportar CSV" });
    await expect(exportar).toBeVisible({ timeout: 60_000 });

    const [download] = await Promise.all([page.waitForEvent("download"), exportar.click()]);
    expect(download.suggestedFilename()).toMatch(/^audit-\d{4}-\d{2}-\d{2}\.csv$/);

    const destino = path.join(EVIDENCIA, "53-j14-auditoria.csv");
    await download.saveAs(destino);
    const csv = fs.readFileSync(destino, "utf8");
    expect(csv.split("\n")[0]).toBe(
      "id,created_at,actor_user_id,action,resource_type,resource_id,request_id,actor_ip,metadata",
    );
    await page.screenshot({
      path: path.join(EVIDENCIA, "53-j14-exportar-auditoria.png"),
      fullPage: true,
    });
  });
});
