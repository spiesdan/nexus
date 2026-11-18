import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import type { CredsE2E } from "./helpers/login-admin";
import { lerCreds } from "./helpers/login-admin";

/**
 * Sentinel v1.3 — o painel provado como um leigo faria, com a ocorrência
 * nascendo do SCAN, não de um INSERT na tabela de ocorrências.
 *
 * A fixture planta dois problemas de negócio no banco de TESTE:
 *
 *  1. um produto controlado com 9.999 unidades e NENHUMA movimentação — o
 *     detector `operacao.estoque_divergente` tem de encontrá-lo (left join);
 *  2. um job na dead-letter — `operacao.job_fila_travado` tem de encontrá-lo.
 *
 * Depois o teste clica "Executar agora" e prova: KPIs, filtros, detalhe com
 * evidência/causa/histórico, gestor ignorando/encerrando com motivo, e
 * viewer/agent sem os botões de gestão.
 *
 * O banco é o Supabase LOCAL (`127.0.0.1:54321`). Nada aqui roda contra
 * produção: `carregarEnvLocal()` recusa destino remoto.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const CARIMBO = Date.now();
const CODIGO = `E2E-SENT-${CARIMBO}`;
const NOME = `E2E Sentinel estoque ${CARIMBO}`;
const MOTIVO_PRODUTO = "fixture E2E: divergência de teste";
const MOTIVO_JOB = "fixture E2E: job de teste";

let db: SupabaseClient;
let orgId: string;
let produtoId: string;
let jobId: string;
let configuracaoAnterior: Record<string, unknown> | null = null;
let creds: CredsE2E;

async function semear(): Promise<void> {
  const env = carregarEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceRole) throw new Error(".env.e2e sem URL/service role do Supabase");
  db = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org, error: erroOrg } = await db
    .from("organizations")
    .select("id")
    .eq("slug", "e2e-test-org")
    .maybeSingle();
  if (erroOrg || !org) throw new Error("org e2e-test-org não encontrada — rode o seed de credenciais");
  orgId = (org as { id: string }).id;

  const { data: config } = await db
    .from("sentinel_settings")
    .select("ativo, intervalo_minutos, retencao_dias, limite_ocorrencias, detectores_desativados")
    .eq("organization_id", orgId)
    .maybeSingle();
  configuracaoAnterior = (config as Record<string, unknown> | null) ?? null;

  await db.from("sentinel_settings").upsert(
    {
      organization_id: orgId,
      ativo: true,
      // Um teste anterior pode ter desligado o detector que esta fixture usa.
      detectores_desativados: [],
      limite_ocorrencias: 500,
    },
    { onConflict: "organization_id" },
  );

  const { data: produto, error: erroProduto } = await db
    .from("catalog_products")
    .insert({
      organization_id: orgId,
      codigo: CODIGO,
      nome: NOME,
      preco_cents: 1000,
      quantidade: 9999,
      controla_estoque: true,
    })
    .select("id")
    .single();
  if (erroProduto || !produto) throw new Error(`semear produto: ${erroProduto?.message}`);
  produtoId = (produto as { id: string }).id;

  const { data: job, error: erroJob } = await db
    .from("job_queue")
    .insert({
      organization_id: orgId,
      kind: "watchdog",
      status: "dead",
      attempts: 5,
      max_attempts: 5,
      last_error: `fixture E2E ${CARIMBO}`,
    })
    .select("id")
    .single();
  if (erroJob || !job) throw new Error(`semear job: ${erroJob?.message}`);
  jobId = (job as { id: string }).id;
}

async function limpar(): Promise<void> {
  if (!db || !orgId) return;
  // Só as ocorrências das NOSSAS entidades; o resto do banco de teste fica.
  await db
    .from("sentinel_occurrences")
    .delete()
    .eq("organization_id", orgId)
    .in("entidade_id", [produtoId, jobId]);
  if (jobId) await db.from("job_queue").delete().eq("id", jobId).eq("organization_id", orgId);
  if (produtoId)
    await db.from("catalog_products").delete().eq("id", produtoId).eq("organization_id", orgId);

  if (configuracaoAnterior) {
    await db
      .from("sentinel_settings")
      .update({
        ativo: configuracaoAnterior.ativo,
        intervalo_minutos: configuracaoAnterior.intervalo_minutos,
        retencao_dias: configuracaoAnterior.retencao_dias,
        limite_ocorrencias: configuracaoAnterior.limite_ocorrencias,
        detectores_desativados: configuracaoAnterior.detectores_desativados,
      })
      .eq("organization_id", orgId);
  } else {
    await db.from("sentinel_settings").delete().eq("organization_id", orgId);
  }
}

/**
 * Login por cookie de sessão, não pelo formulário.
 *
 * O alvo desta spec é o PAINEL; o formulário de login tem specs próprias
 * (`auth`, `password-recovery`, `reset-password-mfa`). Injetar a sessão do
 * Supabase local (`@supabase/ssr` usa `sb-nexus-auth`) evita acoplar esta prova
 * à hidratação da tela de login — que, na máquina compartilhada, é o elo lento.
 */
async function entrarComSessao(page: Page, email: string, senha: string): Promise<void> {
  const env = carregarEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) throw new Error(".env.e2e sem URL/anon key do Supabase");

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`login de ${email}: ${error?.message ?? "sem sessão"}`);

  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  await page.context().addCookies([
    {
      name: "sb-nexus-auth",
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

async function buscar(page: Page, texto: string): Promise<void> {
  const campo = page.getByRole("textbox", { name: "Buscar ocorrência" });
  await campo.fill(texto);
}

async function abrirOcorrencia(
  page: Page,
  textoBusca: string,
  nomeDoBotao: string = textoBusca,
): Promise<void> {
  await buscar(page, textoBusca);
  const seguro = nomeDoBotao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linha = page.getByRole("button", { name: new RegExp(seguro) });
  await expect(linha.first()).toBeVisible({ timeout: 30_000 });
  await linha.first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function executarScan(page: Page): Promise<void> {
  await page.goto("/app/sentinel");
  const botao = page.getByRole("button", { name: /Executar agora/ });
  await expect(botao).toBeEnabled({ timeout: 30_000 });
  await botao.click();
  // A rota espera a rodada terminar; o toast confirma. O refresh traz a lista.
  await expect(page.getByText(/Varredura concluída/)).toBeVisible({ timeout: 90_000 });
}

test.beforeAll(async () => {
  creds = lerCreds();
  await semear();
});

test.afterAll(async () => {
  await limpar();
});

test("gestor: o scan cria as ocorrências, os KPIs abrem e os filtros recortam", async ({
  page,
}) => {
  await entrarComSessao(page, creds.users.manager!.email, creds.password);
  await executarScan(page);

  // KPIs do painel.
  await expect(page.getByText("Abertas").first()).toBeVisible();
  await expect(page.getByText("Alta prioridade").first()).toBeVisible();
  await expect(page.getByText("Ação necessária").first()).toBeVisible();
  await expect(page.getByText("Recorrentes").first()).toBeVisible();

  // O scan encontrou o produto sem movimentação e o job na dead-letter.
  await buscar(page, NOME);
  await expect(page.getByText(NOME)).toBeVisible({ timeout: 30_000 });
  await buscar(page, jobId);
  await expect(page.getByText("Job na dead-letter")).toBeVisible({ timeout: 30_000 });

  // Filtro por severidade: o job é crítica, o produto é baixa.
  await buscar(page, "");
  await page.getByRole("combobox", { name: "Filtrar por severidade" }).click();
  await page.getByRole("option", { name: "Crítica" }).click();
  await expect(page.getByText("Job na dead-letter")).toBeVisible();
  await expect(page.getByText(NOME)).toHaveCount(0);
  await page.getByRole("combobox", { name: "Filtrar por severidade" }).click();
  await page.getByRole("option", { name: "Toda severidade" }).click();

  // Fechadas não mostra o que está aberto.
  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Fechadas" }).click();
  await expect(page.getByText(NOME)).toHaveCount(0);
  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Abertas" }).click();
  await expect(page.getByText(NOME)).toBeVisible();
});

test("detalhe: evidência, causa, plano revisável e histórico do scan", async ({ page }) => {
  await entrarComSessao(page, creds.users.manager!.email, creds.password);
  await page.goto("/app/sentinel");
  await abrirOcorrencia(page, NOME);

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("O que foi encontrado")).toBeVisible();
  await expect(dialogo.getByText("Causa provável")).toBeVisible();
  await expect(dialogo.getByText("Plano de correção (revisável)")).toBeVisible();
  await expect(dialogo.getByText("Confiança baixa")).toBeVisible();
  await expect(dialogo.getByText(/O razão não tem saldo de abertura/).first()).toBeVisible();
  await expect(dialogo.getByText("Evidência")).toBeVisible();
  await expect(dialogo.getByText("Histórico")).toBeVisible();
  await expect(dialogo.getByText("detectada", { exact: true })).toBeVisible();
});

test("viewer: vê a ocorrência e o plano, mas não configura nem age", async ({ page }) => {
  await entrarComSessao(page, creds.users.viewer!.email, creds.password);
  await page.goto("/app/sentinel");

  await expect(page.getByRole("button", { name: /Executar agora/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configurações" })).toHaveCount(0);

  await abrirOcorrencia(page, NOME);
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Plano de correção (revisável)")).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Assumir" })).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Pedir ação" })).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Ignorar" })).toHaveCount(0);
});

test("agent: age no detalhe, mas não configura nem ignora/encerra", async ({ page }) => {
  await entrarComSessao(page, creds.users.agent!.email, creds.password);
  await page.goto("/app/sentinel");

  await expect(page.getByRole("button", { name: /Executar agora/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configurações" })).toHaveCount(0);

  await abrirOcorrencia(page, NOME);
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("button", { name: "Assumir" })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Pedir ação" })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Ignorar" })).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Encerrar" })).toHaveCount(0);
});

test("gestor: ignora e encerra com motivo, e o histórico registra a decisão", async ({ page }) => {
  await entrarComSessao(page, creds.users.manager!.email, creds.password);
  await page.goto("/app/sentinel");

  // Ignorar o produto (decisão de gestor, motivo obrigatório).
  await abrirOcorrencia(page, NOME);
  let dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Ignorar" }).click();
  const confirmacao = page.getByRole("dialog").filter({ hasText: "Ignorar exige motivo" });
  await confirmacao.getByLabel("Motivo").fill(MOTIVO_PRODUTO);
  await confirmacao.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialogo.getByText("Ignorada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(dialogo.getByText(new RegExp(MOTIVO_PRODUTO))).toBeVisible();
  await page.keyboard.press("Escape");

  // Encerrar o job (motivo opcional, mas registrado).
  await abrirOcorrencia(page, jobId, "Job na dead-letter");
  dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Job na dead-letter")).toBeVisible();
  await dialogo.getByRole("button", { name: "Encerrar" }).click();
  const encerramento = page.getByRole("dialog").filter({ hasText: "O motivo é opcional" });
  await encerramento.getByLabel("Motivo").fill(MOTIVO_JOB);
  await encerramento.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialogo.getByText("Encerrada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");

  // O filtro de fechadas agora mostra as duas decisões.
  await buscar(page, "");
  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Fechadas" }).click();
  await expect(page.getByText(NOME)).toBeVisible();
  await expect(page.getByText("Job na dead-letter").first()).toBeVisible();

  // O histórico não apaga a decisão: reabre o produto e lê o motivo.
  await abrirOcorrencia(page, NOME);
  await expect(page.getByRole("dialog").getByText("estado_alterado", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText(new RegExp(MOTIVO_PRODUTO))).toBeVisible();
});
