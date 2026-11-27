import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

import { loginComoAdmin, semearCredenciais, type CredsE2E } from "./helpers/login-admin";

/**
 * A ABA PESQUISAS DE /app/campanhas NÃO MENTE.
 *
 * Com 132 buscas no banco a tela dizia "Nenhuma busca ainda" quando a leitura
 * falhava. Aqui: (a) uma busca semeada aparece e o contador não é zero;
 * (b) GET forçado a 500 mostra o estado de erro com "Tentar de novo", nunca o
 * vazio. O corte de 100 também tem rótulo próprio — coberto no unitário do
 * componente e no código.
 */
const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let creds: CredsE2E;
let orgId = "";
let buscaId = "";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.beforeAll(async () => {
  creds = semearCredenciais();
  orgId = (creds as unknown as { org_id: string }).org_id;
});

test.afterAll(async () => {
  if (buscaId) await admin.from("prospecting_searches").delete().eq("id", buscaId);
});

test("busca semeada aparece na aba Pesquisas e o contador não é zero", async ({ page }) => {
  await loginComoAdmin(page, creds);
  const carimbo = Date.now();
  const categoria = `oficina campanhas ${carimbo}`;

  const { data, error } = await admin
    .from("prospecting_searches")
    .insert({
      organization_id: orgId,
      categorias: [categoria],
      cidade: "Mafra",
      estado: "SC",
      raio_km: 30,
      max_empresas: 100,
      provider: "osm_overpass",
      status: "completed",
      encontradas: 3,
      novas: 1,
      duplicadas: 2,
    })
    .select("id")
    .single();
  expect(error, "seed da busca").toBeNull();
  buscaId = (data as { id: string }).id;

  await page.goto("/app/campanhas?subtela=prospeccao&aba=pesquisas");
  await expect(page.getByTestId("buscas-lista").getByText(categoria)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("buscas-total")).not.toHaveText("0");
});

test("falha de leitura mostra erro com Tentar de novo, nunca o vazio", async ({ page }) => {
  await loginComoAdmin(page, creds);
  await page.route("**/api/v1/prospecting/searches", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal_error", message: "falha forçada" } }),
    }),
  );

  await page.goto("/app/campanhas?subtela=prospeccao&aba=pesquisas");
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible({
    timeout: 30_000,
  });
  // A tela não pode dizer que não há buscas quando a leitura falhou.
  await expect(page.getByText("Nenhuma busca ainda.")).toHaveCount(0);
});
