import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import type { CredsE2E } from "./helpers/login-admin";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * Sentinel v1.1 — o painel, provado como um leigo faria.
 *
 * Cobre o que a doutrina de QA visual cobra e o unitário não vê: a tela ABRE,
 * filtra, mostra o plano revisável e o histórico, o kill switch desliga de
 * verdade, e cada papel vê a porta que lhe pertence (viewer não age, agent age
 * mas não configura, admin configura).
 *
 * A fixture é semeada no banco de TESTE (`.env.e2e`, local) com fingerprint
 * única e removida no `afterAll`. Nenhum dado real, nenhuma chamada fiscal.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const CARIMBO = Date.now();
const FP_ABERTA = `e2e-sentinel-${CARIMBO}-aberta`;
const FP_FECHADA = `e2e-sentinel-${CARIMBO}-fechada`;
const TITULO_ABERTA = `E2E Sentinel — estoque negativo ${CARIMBO}`;
const TITULO_FECHADA = `E2E Sentinel — campanha ignorada ${CARIMBO}`;

let db: SupabaseClient;
let orgId: string;
let runId: string;
let configuracaoAnterior: Record<string, unknown> | null = null;
let creds: CredsE2E;

function plano(risco: "baixo" | "medio" | "alto") {
  return {
    resumo: "Contar fisicamente e corrigir com movimento, nunca com UPDATE direto.",
    passos: ["Confira o saldo físico do produto.", "Lance o ajuste com motivo e responsável."],
    campos_pendentes: ["contagem física", "motivo do ajuste"],
    risco,
    reversibilidade: "reversivel",
    exige_aprovacao: true,
    fonte: ["catalog_products", "inventory_movements"],
    limitacao: null,
    confianca: "alta",
  };
}

async function semear(): Promise<void> {
  const env = carregarEnvLocal();
  const url = env.url ?? "";
  const serviceRole = env.serviceRole ?? "";
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
    .select("organization_id, ativo, intervalo_minutos, retencao_dias, limite_ocorrencias, detectores_desativados")
    .eq("organization_id", orgId)
    .maybeSingle();
  configuracaoAnterior = (config as Record<string, unknown> | null) ?? null;

  await db.from("sentinel_settings").upsert(
    {
      organization_id: orgId,
      ativo: true,
      intervalo_minutos: 360,
      retencao_dias: 180,
      limite_ocorrencias: 500,
      detectores_desativados: [],
    },
    { onConflict: "organization_id" },
  );

  runId = randomUUID();
  const { error: erroRun } = await db.from("sentinel_runs").insert({
    id: runId,
    organization_id: orgId,
    origem: "manual",
    status: "sucesso",
    finalizado_em: new Date().toISOString(),
    achados: 2,
    criadas: 2,
  });
  if (erroRun) throw new Error(`semear run: ${erroRun.message}`);

  const { error: erroAberta } = await db.rpc("fn_sentinel_registrar_ocorrencia", {
    p_organization_id: orgId,
    p_execucao_id: runId,
    p_fingerprint: FP_ABERTA,
    p_regra: "operacao.estoque_negativo",
    p_categoria: "operacao",
    p_entidade_tipo: "catalog_products",
    p_entidade_id: `e2e-produto-${CARIMBO}`,
    p_titulo: TITULO_ABERTA,
    p_resumo: "O saldo ficou abaixo de zero.",
    p_causa_provavel: "Saída sem entrada correspondente.",
    p_severidade: "critica",
    p_href: "/app/estoque",
    p_evidencia: { quantidade: -2, codigo: "E2E-SENTINEL" },
    p_recomendacao: plano("alto"),
  });
  if (erroAberta) throw new Error(`semear ocorrência aberta: ${erroAberta.message}`);

  // Reexecuta a mesma fingerprint: o histórico precisa ter `reafirmada`.
  await db.rpc("fn_sentinel_registrar_ocorrencia", {
    p_organization_id: orgId,
    p_execucao_id: runId,
    p_fingerprint: FP_ABERTA,
    p_regra: "operacao.estoque_negativo",
    p_categoria: "operacao",
    p_entidade_tipo: "catalog_products",
    p_entidade_id: `e2e-produto-${CARIMBO}`,
    p_titulo: TITULO_ABERTA,
    p_resumo: "O saldo ficou abaixo de zero.",
    p_causa_provavel: "Saída sem entrada correspondente.",
    p_severidade: "critica",
    p_href: "/app/estoque",
    p_evidencia: { quantidade: -2, codigo: "E2E-SENTINEL" },
    p_recomendacao: plano("alto"),
  });

  const { error: erroFechada } = await db.from("sentinel_occurrences").insert({
    organization_id: orgId,
    fingerprint: FP_FECHADA,
    regra: "campanha.cidade_repetida",
    categoria: "campanha",
    entidade_tipo: "prospecting_campaigns",
    entidade_id: `e2e-campanha-${CARIMBO}`,
    titulo: TITULO_FECHADA,
    resumo: "Cidade repetida no recorte.",
    causa_provavel: "Seleção repetida na tela.",
    severidade: "baixa",
    estado: "ignorada",
    ignorada_motivo: "fixture E2E",
    href: "/app/campanhas",
    evidencia: { total_cidades: 2 },
    recomendacao: plano("baixo"),
  });
  if (erroFechada) throw new Error(`semear ocorrência fechada: ${erroFechada.message}`);
}

async function limpar(): Promise<void> {
  if (!db || !orgId) return;
  await db
    .from("sentinel_occurrences")
    .delete()
    .eq("organization_id", orgId)
    .in("fingerprint", [FP_ABERTA, FP_FECHADA]);
  if (runId) await db.from("sentinel_runs").delete().eq("id", runId).eq("organization_id", orgId);

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

async function loginSimples(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });
}

test.beforeAll(async () => {
  creds = lerCreds();
  await semear();
});

test.afterAll(async () => {
  await limpar();
});

test("admin: abre, filtra, lê plano/histórico e desliga/religa o kill switch", async ({
  page,
}) => {
  await loginComoAdmin(page, creds);
  await page.goto("/app/sentinel");

  await expect(page.getByRole("heading", { name: "Sentinel", level: 1 })).toBeVisible();
  await expect(page.getByText("Abertas").first()).toBeVisible();
  await expect(page.getByText(TITULO_ABERTA)).toBeVisible();

  // Filtro por estado: fechadas esconde a aberta e mostra a ignorada.
  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Fechadas" }).click();
  await expect(page.getByText(TITULO_ABERTA)).toHaveCount(0);
  await expect(page.getByText(TITULO_FECHADA)).toBeVisible();

  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Abertas" }).click();
  await expect(page.getByText(TITULO_ABERTA)).toBeVisible();

  // Severidade: crítica mantém a aberta; baixa a esconde.
  await page.getByRole("combobox", { name: "Filtrar por severidade" }).click();
  await page.getByRole("option", { name: "Crítica" }).click();
  await expect(page.getByText(TITULO_ABERTA)).toBeVisible();
  await page.getByRole("combobox", { name: "Filtrar por severidade" }).click();
  await page.getByRole("option", { name: "Toda severidade" }).click();

  // Detalhe: plano revisável, risco, passos e histórico.
  await page.getByRole("button", { name: new RegExp(TITULO_ABERTA) }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText("Plano de correção (revisável)")).toBeVisible();
  await expect(dialogo.getByText("Risco alto")).toBeVisible();
  await expect(dialogo.getByText("Exige aprovação")).toBeVisible();
  await expect(dialogo.getByText("Confira o saldo físico do produto.")).toBeVisible();
  await expect(dialogo.getByText("Histórico")).toBeVisible();
  await expect(dialogo.getByText("reafirmada", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Kill switch pela tela: desliga, o banner aparece e o botão de varrer cai.
  await page.getByRole("button", { name: "Configurações" }).click();
  const config = page.getByRole("dialog");
  await expect(config.getByText("Configurações do Sentinel")).toBeVisible();
  await config.getByRole("switch").click();
  await config.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("O Sentinel está desligado para esta organização.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Executar agora/ })).toBeDisabled();

  // Religa para não deixar a fixture desligada.
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("dialog").getByRole("switch").click();
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("O Sentinel está desligado para esta organização.")).toHaveCount(0);
});

test("viewer: enxerga a ocorrência e o plano, mas não configura nem age", async ({ page }) => {
  await loginSimples(page, creds.users.viewer!.email, creds.password);
  await page.goto("/app/sentinel");

  await expect(page.getByText(TITULO_ABERTA)).toBeVisible();
  await expect(page.getByRole("button", { name: /Executar agora/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configurações" })).toHaveCount(0);

  await page.getByRole("button", { name: new RegExp(TITULO_ABERTA) }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Plano de correção (revisável)")).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Assumir" })).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Pedir ação" })).toHaveCount(0);
});

test("agent: age no detalhe, mas não configura a varredura", async ({ page }) => {
  await loginSimples(page, creds.users.agent!.email, creds.password);
  await page.goto("/app/sentinel");

  await expect(page.getByText(TITULO_ABERTA)).toBeVisible();
  await expect(page.getByRole("button", { name: /Executar agora/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configurações" })).toHaveCount(0);

  await page.getByRole("button", { name: new RegExp(TITULO_ABERTA) }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("button", { name: "Assumir" })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Pedir ação" })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Ignorar" })).toHaveCount(0);
});
