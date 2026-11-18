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
  await expect(page.getByText(/recusado/)).toBeVisible();
  await expect(page.getByText(/limite de crédito/)).toBeVisible();
});

test("shell: recusado tem saída — tentar de novo e descartar", async ({ page }) => {
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
    const linha = async (uuid: string, numero: string, status: string, erro: string | null) => {
      await db.execute(
        `INSERT INTO pedidos_pendentes (uuid, numero_provisorio, payload, status, tentativas, ultimo_erro, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          numero,
          JSON.stringify({ cliente_nome: "Cliente", itens: [] }),
          status,
          erro ? 1 : 0,
          erro,
          new Date().toISOString(),
        ],
      );
    };
    await linha("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "OFF-0009", "rejeitado", "Crédito excedido.");
    await linha("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "OFF-0010", "pendente", null);
  });
  await page.reload();

  // ─── Tentar de novo: a decisão humana devolve à fila ─────────────────────
  await expect(page.getByText("OFF-0009")).toBeVisible();
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByText(/OFF-0009 voltou para a fila/)).toBeVisible();
  await expect(page.getByText("OFF-0009", { exact: true })).toBeVisible();
  await expect(page.getByText(/aguardando sinal/).first()).toBeVisible();
  await expect(page.getByText(/recusado/)).toHaveCount(0);

  // ─── Descartar pede confirmação: descarte é irreversível ─────────────────
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Descartar" }).first().click();
  await expect(page.getByText(/OFF-0009 descartado/)).toBeVisible();
  // Escopo na lista: o aviso acima também cita o número do pedido.
  await expect(page.locator("#fila").getByText("OFF-0009", { exact: true })).toHaveCount(0);
  await expect(page.locator("#fila").getByText("OFF-0010", { exact: true })).toBeVisible();
});

test("shell: toque duplo em salvar NÃO enfileira dois pedidos", async ({ page }) => {
  // O toque duplo gera dois UUIDs e a idempotência do servidor não cobre isso
  // (são chaves diferentes — dois pedidos legítimos para ele). O cliente
  // receberia o dobro. A trava é síncrona, antes do primeiro await.
  await page.goto("/index.html");
  await offline(page);
  await semearCatalogo(page);
  await page.goto("/novo-pedido.html");
  await page.getByPlaceholder("Digite o nome…").fill("santa clara");
  await page.getByRole("button", { name: /Fazenda Santa Clara/ }).click();
  await page.getByPlaceholder("Digite o produto…").fill("sabão");
  await page.getByRole("button", { name: /Sabão Líquido/ }).click();

  await page.getByRole("button", { name: "Salvar na fila" }).dblclick();
  await expect(page).toHaveURL(/index\.html/);
  await expect(page.locator("#fila").getByText("OFF-0001", { exact: true })).toBeVisible();
  await expect(page.locator("#fila").getByText("OFF-0002", { exact: true })).toHaveCount(0);
});

test("shell: o botão Enviar agora explica em vez de não fazer nada", async ({ page }) => {
  // Medido antes desta correção: o `<button id="btn-enviar">` existia no HTML e
  // não tinha handler — tocar nele não produzia nada. Silêncio em botão é pior
  // que erro: o vendedor acha que enviou.
  await page.goto("/index.html");
  await offline(page);
  // O handler só existe depois que `renderizar()` termina (o banco abre em
  // js/wasm, e não instantaneamente). "Catálogo vazio" é o último texto que
  // ela escreve — esperar por ele é esperar pela ligação do botão.
  await expect(page.getByText("Catálogo vazio", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Enviar agora" }).click();
  await expect(page.getByText("Não há pedido esperando envio.")).toBeVisible();
});
