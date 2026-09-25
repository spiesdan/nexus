import { execNpx } from "./utils/npx";
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
  execNpx(["tsx", "scripts/seed-e2e-prospeccao-mapa.ts"], { stdio: "inherit", cwd: RAIZ });
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
  // handle. Em duas fases: primeiro QUEBRA os clusters por despacho (rápido,
  // sem espera de estabilidade — e a seleção prova que o evento chega: o card
  // da lista acende); depois o clique REAL num ponto abre a popup (o Leaflet
  // só abre popup em evento confiável, não em sintético).
  //
  // `dispatchEvent` na fase 1 porque a camada é recriada a cada `zoomend`
  // `moveend` (o `setView` inicial já dispara um): a checagem de estabilidade
  // do `click` nunca sossega ali e cada tentativa estouraria o timeout.
  for (let volta = 0, anterior = -1; volta < 4; volta++) {
    const n = await marcadores.count();
    if (n >= 4 || (volta > 0 && n === anterior)) break;
    anterior = n;
    for (let i = 0; i < n; i++) {
      await marcadores.nth(i).dispatchEvent("click").catch(() => undefined);
    }
    await page.waitForTimeout(800);
  }

  const verEmpresa = page.getByRole("button", { name: /ver empresa/i }).first();
  let abriu = false;
  for (let i = 0; i < 6 && !abriu; i++) {
    const n = await marcadores.count();
    if (n === 0) {
      await page.waitForTimeout(500);
      continue;
    }
    // Só aperta Enter com o foco CONFIRMADO no marcador: sem isso o Enter
    // cairia no último botão clicado (ex. o alternador Mapa/Tabela) e a tela
    // mudaria no meio do teste.
    const focou = await marcadores
      .nth(i % n)
      .focus({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!focou) continue;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    abriu = await verEmpresa.isVisible().catch(() => false);
  }
  await expect(verEmpresa, "nenhum marcador abriu a popup de empresa").toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /ver empresa/i }).first().click();
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog").first()).toContainText(/Restaurante E2E Mapa|Mercado E2E Mapa|Padaria E2E Mapa/);
});
