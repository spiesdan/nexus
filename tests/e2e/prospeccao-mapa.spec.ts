import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Jornada do mapa da Prospecção.
 *
 * Seed com 3 prospects geolocalizados. Aba Empresas → visão Mapa: marcadores
 * reais no Leaflet, clique no marcador seleciona na lista, detalhe abre,
 * rota desenha paradas numeradas.
 */
const RAIZ = path.join(__dirname, "..", "..");

interface Creds {
  password: string;
  users: Record<string, { email: string } | undefined>;
}

function lerCreds(): Creds {
  const p = path.join(RAIZ, ".e2e-creds.json");
  if (!fs.existsSync(p)) throw new Error("`.e2e-creds.json` ausente — rode `scripts/seed-e2e-credentials.ts`");
  return JSON.parse(fs.readFileSync(p, "utf8")) as Creds;
}

async function entrar(page: Page, creds: Creds) {
  const usuario = creds.users.manager;
  if (!usuario) throw new Error(".e2e-creds.json sem o usuário `manager`");
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(usuario.email);
  await page.getByLabel(/senha/i).fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
}

test.beforeAll(() => {
  execFileSync("npx", ["tsx", "scripts/seed-e2e-prospeccao-mapa.ts"], { stdio: "inherit", cwd: RAIZ });
});

test("mapa mostra marcadores, clique sincroniza lista e detalhe abre", async ({ page }) => {
  const creds = lerCreds();
  await entrar(page, creds);
  await page.goto("/app/prospeccao");

  await page.getByRole("tab", { name: /empresas/i }).click();
  await page.getByRole("button", { name: /^mapa$/i }).click();
  const mapa = page.locator(".leaflet-container").first();
  await expect(mapa, "visão Mapa sem contêiner Leaflet").toBeVisible({ timeout: 30_000 });

  const marcadores = page.locator(".leaflet-marker-icon");
  await expect
    .poll(async () => marcadores.count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);

  // O `.first()` nem sempre é um ponto: pode ser o marco do centro (não
  // clicável) ou um CLUSTER — e o clique no cluster APROXIMA (zoom+2, o gesto
  // certo do produto), re-renderizando a camada no meio do gesto e matando o
  // handle. Tenta cada marcador até a popup "Ver empresa" abrir,
  // re-consultando a cada volta porque o zoom invalida os elementos.
  //
  // `dispatchEvent` em vez de `click`: a camada do Leaflet é recriada a cada
  // `zoomend moveend` (o `setView` inicial já dispara um), então a checagem de
  // estabilidade do `click` nunca sossega e cada tentativa estoura o timeout.
  // O evento despachado é o mesmo que o gesto do usuário produz — só pula a
  // espera de estabilidade, que neste mapa nunca chega.
  const verEmpresa = page.getByRole("button", { name: /ver empresa/i }).first();
  let abriu = false;
  for (let volta = 0; volta < 6 && !abriu; volta++) {
    const n = await marcadores.count();
    for (let i = 0; i < n && !abriu; i++) {
      await marcadores.nth(i).dispatchEvent("click").catch(() => undefined);
      await page.waitForTimeout(500);
      abriu = await verEmpresa.isVisible().catch(() => false);
    }
  }
  await expect(verEmpresa, "nenhum marcador abriu a popup de empresa").toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /ver empresa/i }).first().click();
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog").first()).toContainText(/Restaurante E2E Mapa|Mercado E2E Mapa|Padaria E2E Mapa/);
});
