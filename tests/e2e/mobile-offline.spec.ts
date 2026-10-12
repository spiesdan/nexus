/**
 * O SHELL OFFLINE DE PONTA A PONTA — captura sem rede, fila com número
 * provisório, e o portão do catálogo.
 *
 * ─── O que esta spec prova, e onde ela NÃO vai ──────────────────────────────
 *
 * Prova (no navegador, com SQLite de verdade via jeep-sqlite):
 *  1. sem catálogo, a captura não abre — o botão explica em vez de deixar
 *     capturar preço chutado;
 *  2. com catálogo, o fluxo cliente → item → quantidade → salvar enfileira com
 *     `OFF-0001` e o total certo;
 *  3. COM O BACKEND MORTO (route-abort fora do localhost) a captura funciona —
 *     é o teste que importa;
 *  4. o segundo pedido é `OFF-0002` (a sequência anda);
 *  5. rejeitado aparece com o motivo (é o que manda o vendedor decidir).
 *
 * NÃO prova: o dreno contra o backend real. O dreno é testado em 14 casos de
 * unidade (`offline-outbox-sync.test.ts`) e a idempotência do servidor em 8
 * (`pedido-chave-sincronizacao.test.ts`) + 1 e2e ao vivo
 * (`pedido-idempotencia.spec.ts`, na suíte principal, com banco de verdade).
 * Juntar os dois aqui exigiria sessão autenticada cross-origin — e um teste
 * que finge sessão com header manual provaria o dreno contra um backend que
 * não é o backend.
 */
import { expect, test, type Page } from "@playwright/test";

async function offline(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as unknown as { __offline?: { banco: () => Promise<unknown> } }).__offline;
    if (!api)
      throw new Error("gancho __offline ausente — a spec precisa do vite dev, não do build");
  });
}

async function semearCatalogo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = (
      window as unknown as {
        __offline: {
          banco: () => Promise<{
            execute: (sql: string, params?: unknown[]) => Promise<unknown>;
          }>;
        };
      }
    ).__offline;
    const db = await api.banco();
    await db.execute(
      `INSERT INTO catalogo_contatos (id, nome, documento, cidade, limite_cents) VALUES (?, ?, ?, ?, ?)`,
      ["c1", "Fazenda Santa Clara", "12345678000199", "Canoinhas", 500000],
    );
    await db.execute(
      `INSERT INTO catalogo_produtos (id, codigo, nome, preco_cents, controla_estoque, quantidade, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["p1", "SABAO1", "Sabão Líquido 5L", 4990, 0, null, 1],
    );
    await db.execute(`INSERT INTO meta (chave, valor) VALUES ('catalogo_sincronizado_em', ?)`, [
      new Date().toISOString(),
    ]);
  });
}

test.setTimeout(120_000);

test("shell: sem catálogo a captura não abre", async ({ page }) => {
  await page.goto("/index.html");
  await offline(page);
  await expect(page.getByRole("heading", { name: "Bill Higiene" })).toBeVisible();
  await expect(page.getByText("Catálogo vazio")).toBeVisible();

  // O botão existe mas explica em vez de navegar: capturar sem preço é o que o
  // servidor recusa no sync, e aí a viagem vira retrabalho. `dispatch_event`
  // porque o `aria-disabled` (correto para leitor de tela) barra o click
  // normal do Playwright — e é o handler que está em teste, não a navegabilidade.
  await page.getByRole("link", { name: "Novo pedido offline" }).dispatchEvent("click");
  await expect(page.getByText("Baixe o catálogo primeiro")).toBeVisible();
  expect(page.url()).toContain("index.html");
});

/**
 * "Sem área" fiel no navegador: aborta tudo que NÃO é o próprio servidor do
 * shell. `context.setOffline(true)` não serve — ele derruba o localhost junto
 * e a página nem carrega (no aparelho o shell é arquivo local e abre sempre).
 */
async function semArea(page: Page): Promise<void> {
  const ctx = page.context();
  await ctx.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    return route.abort();
  });
}

test("shell: captura offline enfileira com OFF-0001 e o total certo", async ({ page }) => {
  await page.goto("/index.html");
  await offline(page);
  await semearCatalogo(page);

  // "Sem área": o backend some, o shell continua. Nada nesta spec pode
  // depender de request fora do localhost.
  await semArea(page);
  {
    await page.goto("/novo-pedido.html");
    await expect(page.getByText(/provisório OFF-/)).toBeVisible();

    await page.getByPlaceholder("Digite o nome…").fill("santa clara");
    await page.getByRole("button", { name: /Fazenda Santa Clara/ }).click();
    await expect(page.getByText("cliente: Fazenda Santa Clara")).toBeVisible();

    await page.getByPlaceholder("Digite o produto…").fill("sabão");
    await page.getByRole("button", { name: /Sabão Líquido/ }).click();
    await page.getByRole("button", { name: "aumentar Sabão Líquido 5L" }).click();
    await expect(page.getByText("Total: R$ 99,80")).toBeVisible();

    await page.getByPlaceholder("Ex.: entregar após as 14h").fill("deixar no galpão");
    await page.getByRole("button", { name: "Salvar na fila" }).click();

    await expect(page).toHaveURL(/index\.html/);
    await expect(page.getByText("OFF-0001")).toBeVisible();
    await expect(page.getByText("Fazenda Santa Clara")).toBeVisible();
    await expect(page.getByText("R$ 99,80")).toBeVisible();
    await expect(page.getByText("aguardando sinal")).toBeVisible();
  }
});

test("shell: o segundo pedido é OFF-0002", async ({ page }) => {
  await page.goto("/index.html");
  await offline(page);
  await semearCatalogo(page);

  for (const cliente of ["santa clara", "santa clara"]) {
    await page.goto("/novo-pedido.html");
    await page.getByPlaceholder("Digite o nome…").fill(cliente);
    await page.getByRole("button", { name: /Fazenda Santa Clara/ }).click();
    await page.getByPlaceholder("Digite o produto…").fill("sabão");
    await page.getByRole("button", { name: /Sabão Líquido/ }).click();
    await page.getByRole("button", { name: "Salvar na fila" }).click();
    await expect(page).toHaveURL(/index\.html/);
  }
  await expect(page.getByText("OFF-0001")).toBeVisible();
  await expect(page.getByText("OFF-0002")).toBeVisible();
});

test("shell: rejeitado aparece com o motivo", async ({ page }) => {
  await page.goto("/index.html");
  await offline(page);
  await page.evaluate(async () => {
    const api = (
      window as unknown as {
        __offline: {
          banco: () => Promise<{
            execute: (sql: string, params?: unknown[]) => Promise<unknown>;
          }>;
        };
      }
    ).__offline;
    const db = await api.banco();
    await db.execute(
      `INSERT INTO pedidos_pendentes (uuid, numero_provisorio, payload, status, tentativas, ultimo_erro, criado_em)
       VALUES (?, ?, ?, 'rejeitado', 1, ?, ?)`,
      [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "OFF-0009",
        JSON.stringify({ cliente_nome: "Cliente", itens: [] }),
        "Cliente acima do limite de crédito.",
        new Date().toISOString(),
      ],
    );
  });
  await page.reload();
  await expect(page.getByText("OFF-0009")).toBeVisible();
  await expect(page.getByText(/precisa de decisão/)).toBeVisible();
  await expect(page.getByText(/limite de crédito/)).toBeVisible();
});
