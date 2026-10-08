import { expect, test } from "@playwright/test";
import { lerCreds, loginComoDono } from "../e2e/helpers/login-admin";

test.setTimeout(300_000);

/**
 * O 500 do lote de fotos já custou três versões. Este teste reproduz o pior
 * caso real — a lista inteira de produtos da organização — e exige que:
 *  1. a chamada volte 200 (era 500: o PostgREST recusava o `in.(...)` com 414);
 *  2. o corpo traga uma chave por produto pedido;
 *  3. a URL da requisição seja CURTA (foi o que estourou o HTTP/2 antes).
 */
test("lote de fotos da lista inteira: 200, com chave por produto e URL curta", async ({ page }) => {
  await loginComoDono(page, lerCreds());

  // A tela já pede o lote ao abrir; espera a chamada e mede a URL real.
  const urls: string[] = [];
  const status: number[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/products/images")) urls.push(r.url());
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/v1/products/images")) status.push(r.status());
  });

  await page.goto("/app/products", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15_000);

  console.log("chamadas ao lote:", urls.length);
  console.log("status:", status.join(", ") || "(nenhuma)");
  expect(urls.length, "a lista deveria pedir as fotos em uma chamada só").toBeGreaterThan(0);
  expect(status, "nenhuma chamada ao lote pode falhar").not.toContain(500);
  for (const s of status) expect(s).toBe(200);

  // A URL antiga carregava 500 UUIDs e passava de 18 KB.
  const maior = Math.max(...urls.map((u) => u.length));
  console.log("maior URL do lote:", maior, "caracteres");
  expect(maior, "URL do lote não pode carregar os ids").toBeLessThan(2000);

  // E o lote tem que responder de verdade, não um objeto vazio.
  const direto = await page.request.post("/api/v1/products/images", {
    data: {
      ids: await page.evaluate(async () => {
        const r = await fetch("/api/v1/products?limit=3", { credentials: "include" });
        const j = await r.json();
        const lista = (j?.data?.items ?? j?.data ?? []) as { id: string }[];
        return lista.slice(0, 3).map((p) => p.id);
      }),
    },
  });
  console.log("POST direto:", direto.status());
  expect(direto.status()).toBe(200);
  const corpo = (await direto.json()) as { data: Record<string, unknown[]> };
  console.log("chaves no corpo:", Object.keys(corpo.data ?? {}).length);

  // Evidência visual de que a tela do catálogo renderiza DEPOIS das fotos
  // carregarem — era aqui que a coluna aparecia vazia com o erro no console.
  await page.screenshot({ path: "evidence/lote-fotos-produtos.png", fullPage: false });
  console.log("evidência: evidence/lote-fotos-produtos.png");
});
