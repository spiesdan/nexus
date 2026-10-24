import { execNpx } from "./utils/npx";
import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * O CONTROLE da campanha no canal oficial mostra o que o canal CONFIRMOU.
 *
 * O defeito que esta spec tranca: a rota do webhook da Cloud API gravava
 * `failed ? "failed" : "sent"`. `delivered` e `read` chegavam no payload e
 * morriam ali, então a tela dizia "Enviada" para sempre e o operador não tinha
 * como distinguir "saiu" de "chegou" — exatamente a confusão que o 131047
 * (re-engagement) causa: a mensagem foi aceita e nunca entregue.
 *
 * O seed grava `messages` no estado que o webhook gravaria (`delivered`,
 * `read`, `failed` + `error_code`), porque a suíte não tem uma WABA conectada.
 * É honesto: a tela lê `messages` e nada mais.
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

function campanhaSemeada(): string {
  const p = path.join(RAIZ, ".e2e-campanha-entrega.json");
  if (!fs.existsSync(p)) throw new Error("seed não escreveu `.e2e-campanha-entrega.json`");
  return (JSON.parse(fs.readFileSync(p, "utf8")) as { campaign_id: string }).campaign_id;
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
  execNpx(["tsx", "scripts/seed-e2e-campanha-entrega.ts"], { stdio: "inherit", cwd: RAIZ });
});

test("o controle separa enviada, entregue, lida e falha na entrega", async ({ page }) => {
  const creds = lerCreds();
  const campanhaId = campanhaSemeada();
  await entrar(page, creds);
  await page.goto(`/app/prospeccao/campanhas/${campanhaId}`);

  // ── O resumo da campanha ───────────────────────────────────────────────────
  // Três envios confirmados; dois chegaram (um deles foi lido) e um falhou.
  await expect(page.getByText("2 entregues")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1 lidas")).toBeVisible();
  await expect(page.getByText("1 falharam na entrega")).toBeVisible();

  // ── O degrau por empresa ───────────────────────────────────────────────────
  // `exact` porque "Entregue em <data>" é outro nó: sem ele, a asserção passaria
  // pelo instante de confirmação mesmo se o BADGE não existisse.
  await expect(page.getByText("Entregue", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Lida", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Falhou na entrega", { exact: true }).first()).toBeVisible();

  // O instante da confirmação acompanha o degrau — "Entregue" sem quando não
  // responde a pergunta operacional ("chegou antes ou depois do meu plantão?").
  await expect(page.getByText(/Entregue em \d/).first()).toBeVisible();
  await expect(page.getByText(/Lida em \d/).first()).toBeVisible();

  // ── O filtro que isola o que precisa de ação ───────────────────────────────
  await page.getByRole("button", { name: /Falhas na entrega/ }).click();
  // `.first()`: a empresa aparece na tabela (desktop) E na lista (mobile) — as
  // duas estão no DOM, e o filtro tem de valer para as duas.
  await expect(page.getByText("Oficina E2E Entrega").first()).toBeVisible();
  await expect(page.getByText("Padaria E2E Entrega")).toHaveCount(0);
  await expect(page.getByText("Mercado E2E Entrega")).toHaveCount(0);
});
