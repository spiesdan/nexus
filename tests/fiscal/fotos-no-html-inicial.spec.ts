import { expect, test } from "@playwright/test";
import { lerCreds, loginComoDono } from "../e2e/helpers/login-admin";

test.setTimeout(300_000);

/**
 * AS FOTOS CHEGAM NO HTML — a coluna não pode aparecer vazia e depois
 * preencher.
 *
 * O sintoma que o dono descreveu: "aparece os produtos sem foto e só depois a
 * página já carregada é que carrega as imagens, depois de alguns segundos".
 *
 * ─── Por que este teste olha o MAPA, e não um `<img>` qualquer ──────────────
 *
 * A primeira versão procurava `<img src="…/images/…">` na página e achava o
 * LOGO, dando verde com o mapa de fotos TODO VAZIO. É o mesmo erro do sintoma
 * original: medir um sinal que não é o do defeito.
 *
 * A segunda versão tinha o furo oposto: o produto semeado pode ficar fora do
 * corte de 500 da página, e aí ele nunca chega ao mapa — o teste reprovaria por
 * um motivo errado.
 *
 * A forma honesta é as duas: semear o produto, PROCURAR POR ELE dentro do mapa
 * que a página entregou, e exigir foto nessa entrada. Se o mapa vier vazio, o
 * produto sem foto não tem como parecer, e se o produto não estiver na página
 * o teste diz isso em vez de accusear o mapa.
 */
test("o HTML inicial já vem com a foto do produto, sem depender de JavaScript", async ({ page }) => {
  await loginComoDono(page, lerCreds());

  // 1. Produto COM foto, semeado agora.
  const semeado = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(0, 0, 2, 2);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png"));

    const criado = await fetch("/api/v1/products", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "sonda — foto no html",
        codigo: `HTMLFOTO${Math.floor(Math.random() * 900000 + 100000)}`,
        preco_cents: 4990,
        controla_estoque: false,
      }),
    });
    if (!criado.ok) return { erro: `produto HTTP ${criado.status}` };
    const pj = (await criado.json()) as { data: { id: string } };

    const form = new FormData();
    form.append("file", new File([blob], "sonda.png", { type: "image/png" }));
    const up = await fetch(`/api/v1/products/${pj.data.id}/images`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!up.ok) return { erro: `upload HTTP ${up.status} ${(await up.text()).slice(0, 100)}` };
    return { id: pj.data.id, erro: null as string | null };
  });
  expect(semeado.erro, `não consegui semear: ${semeado.erro}`).toBeNull();
  const id = semeado.id!;

  // 2. O HTML CRU do servidor, sem rodar o JavaScript.
  const cru = await page.request.get("/app/products");
  const html = await cru.text();
  console.log("HTML do servidor:", (html.length / 1024).toFixed(0), "KB | status", cru.status());

  // 3. O produto está na página? Sem isto o resto do teste mede o corte de 500.
  const listaTemOProduto = html.includes(id);
  console.log("produto no HTML:", listaTemOProduto);
  expect(listaTemOProduto, "o produto semeado não está na página — o teste não mediu nada").toBe(true);

  // 4. A entrada DELE no mapa de fotos, e não a de qualquer outro.
  // O payload do RSC vem com as aspas escapadas (`\"`), daí o padrão tolerante.
  const entrada = new RegExp(`${id}[\\\\"]{0,2}\\s*:\\s*(\\[[^\\]]*\\])`).exec(html);
  console.log("entrada no mapa:", entrada?.[1]?.slice(0, 110) ?? "(ausente)");
  expect(entrada, `o produto semeado não tem entrada no mapa de fotos`).not.toBeNull();

  const valor = entrada![1]!;
  expect(
    valor,
    "o mapa traz o produto SEM foto — a coluna apareceria vazia e preencheria depois (o defeito reportado)",
  ).not.toBe("[]");
  expect(valor, "a entrada do mapa não tem nenhuma foto").toContain("url");

  // 5. A URL presente no HTML realmente carrega — sem esperar o JavaScript.
  const url = valor
    .split("\\\"")
    .map((p) => (/^https?:/.test(p) ? p : null))
    .find((p): p is string => p !== null);
  console.log("url da foto:", url ? url.slice(0, 90) : "(nao extraida)");
  expect(url, "a foto do mapa não tem URL absoluta").toBeTruthy();
  // O caminho do redimensionador do Cloud dá 404 no self-host — ver
  // `lib/storage/foto.ts`.
  expect(url).not.toContain("/render/image/");

  const r = await page.request.get(url!);
  console.log("status da foto do HTML:", r.status(), "| tipo:", r.headers()["content-type"]);
  expect(r.status(), `a foto do HTML não carrega: ${url}`).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/image\//);

  await page.screenshot({ path: "evidence/fotos-no-html-inicial.png" });
  console.log("evidência: evidence/fotos-no-html-inicial.png");
});