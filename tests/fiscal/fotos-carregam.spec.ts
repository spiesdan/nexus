import { expect, test } from "@playwright/test";
import { lerCreds, loginComoDono } from "../e2e/helpers/login-admin";

test.setTimeout(300_000);

/**
 * Responder 200 não prova que a foto APARECERÁ. Este teste fecha a cadeia
 * inteira, do upload ao pixel na tela:
 *
 *   1. sobe uma foto de verdade (PNG gerado aqui, sem arquivo no repositório);
 *   2. pede o LOTE e confere que o produto aparece com a foto;
 *   3. carrega a URL que o lote devolveu, esperando 200 e `image/*`;
 *   4. confere que a tela mostra <img> com aquela URL de verdade.
 *
 * Sem o passo 1 o teste não diria nada: a organização de e2e nasce com
 * produtos SEM foto (9 produtos, 0 fotos), então uma asserção sobre "o lote
 * traz fotos" passaria por vacuidade. Foi o que aconteceu na primeira versão
 * deste arquivo — ela falhou honestamente em vez de dar verde vazio.
 */
test("a foto semeada aparece na tela pelo caminho do lote", async ({ page }) => {
  await loginComoDono(page, lerCreds());

  // 1. Produto com foto, semeado AGORA (o estado da org é o que se mede).
  const semeado = await page.evaluate(async () => {
    // PNG 2x2 válido, gerado no navegador para não depender de arquivo.
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#7c3aed";
    ctx.fillRect(0, 0, 2, 2);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png"));

    // Um produto só nosso, para poder achar de novo sem colidir com a lista.
    // `preco_cents` é obrigatório (medido: sem ele a API devolve 422) — o mesmo
    // campo que `semearProduto` manda.
    const criado = await fetch("/api/v1/products", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "evidência — foto do lote",
        codigo: `EVFOTO${Math.floor(Math.random() * 900000 + 100000)}`,
        preco_cents: 4990,
        controla_estoque: false,
      }),
    });
    if (!criado.ok)
      return { erro: `produto: HTTP ${criado.status} ${(await criado.text()).slice(0, 120)}` };
    const pj = (await criado.json()) as { data: { id: string; nome: string } };
    const produto = pj.data;

    const form = new FormData();
    form.append("file", new File([blob], "evidencia.png", { type: "image/png" }));
    const up = await fetch(`/api/v1/products/${produto.id}/images`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!up.ok) return { erro: `upload: HTTP ${up.status} ${(await up.text()).slice(0, 120)}` };

    return { produto, erro: null as string | null };
  });

  expect(semeado.erro, `não consegui semear: ${semeado.erro}`).toBeNull();
  const produtoId = (semeado.produto as { id: string }).id;
  console.log("produto semeado:", produtoId);

  // 2. O LOTE tem que devolver essa foto.
  const viaLote = await page.evaluate(async (id) => {
    const r = await fetch("/api/v1/products/images", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    const corpo = (await r.json()) as { data: Record<string, { url: string; posicao: number }[]> };
    return {
      status: r.status,
      fotos: corpo.data?.[id] ?? [],
      chavePresente: id in (corpo.data ?? {}),
    };
  }, produtoId);
  console.log("status do lote:", viaLote.status, "| fotos:", viaLote.fotos.length);
  expect(viaLote.status).toBe(200);
  expect(viaLote.chavePresente, "o lote não devolveu chave para o produto pedido").toBe(true);
  expect(viaLote.fotos.length, "o produto semeado com foto não veio no lote").toBeGreaterThan(0);

  // 3. A URL devolvida tem que ser uma imagem que carrega.
  const primeira = viaLote.fotos[0];
  expect(primeira, "o lote devolveu uma lista de fotos vazia").toBeDefined();
  const urlFoto = primeira!.url;
  console.log("url da foto:", urlFoto);
  const img = await page.request.get(urlFoto);
  const corpo = await img.body();
  console.log(
    "status da foto:",
    img.status(),
    "| tipo:",
    img.headers()["content-type"],
    "| bytes:",
    corpo.length,
  );
  expect(img.status(), `a foto não carrega: ${urlFoto}`).toBe(200);
  expect(img.headers()["content-type"]).toMatch(/image\//);
  expect(corpo.length).toBeGreaterThan(50);

  // 4. E a tela precisa mesmo renderizar o <img> — o que o usuário vê.
  await page.goto("/app/products", { waitUntil: "domcontentloaded" });
  // O placeholder da busca vem de `t()` e o e2e roda com outro idioma em
  // parte das rodadas: casa pelo TIPO do campo dentro da área de busca, não pelo
  // texto. `Buscar por nome, código ou marca` era o caminho frágil.
  const busca = page.locator('input[type="search"], input[type="text"]').first();
  await busca.waitFor({ state: "visible", timeout: 20_000 });
  await busca.fill("evidência — foto do lote");
  await page.waitForTimeout(8000);

  const renderizadas = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .map((i) => i.getAttribute("src") ?? "")
      .filter((s) => s.includes("/images/")),
  );
  console.log("<img> de produto na tela:", renderizadas.length);
  expect(renderizadas.length, "a tela não renderizou nenhuma foto de produto").toBeGreaterThan(0);

  const quebradas: string[] = [];
  for (const src of renderizadas) {
    const r = await page.request.get(src);
    if (!r.ok() || !r.headers()["content-type"]?.startsWith("image/"))
      quebradas.push(`${r.status()} ${src}`);
  }
  console.log("fotos quebradas na tela:", quebradas.length);
  expect(quebradas, `fotos quebradas: ${quebradas.join(", ")}`).toHaveLength(0);

  await page.screenshot({ path: "evidence/fotos-produto-carregam.png" });
  console.log("evidência: evidence/fotos-produto-carregam.png");
});
