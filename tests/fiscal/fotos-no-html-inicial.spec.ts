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
test("o HTML inicial já vem com a foto do produto, sem depender de JavaScript", async ({
  page,
}) => {
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

    const codigo = `HTMLFOTO${Math.floor(Math.random() * 900000 + 100000)}`;
    const criado = await fetch("/api/v1/products", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "sonda — foto no html",
        codigo,
        preco_cents: 4990,
        controla_estoque: false,
      }),
    });
    if (!criado.ok) return { erro: `produto HTTP ${criado.status}`, codigo: "" };
    const pj = (await criado.json()) as { data: { id: string } };

    const form = new FormData();
    form.append("file", new File([blob], "sonda.png", { type: "image/png" }));
    const up = await fetch(`/api/v1/products/${pj.data.id}/images`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!up.ok) {
      return { erro: `upload HTTP ${up.status} ${(await up.text()).slice(0, 100)}`, codigo };
    }
    return { id: pj.data.id, erro: null as string | null, codigo };
  });
  expect(semeado.erro, `não consegui semear: ${semeado.erro}`).toBeNull();
  // O código volta porque a lista de produtos marca a linha com ELE
  // (`data-testid="produto-{codigo}"`), e não com o id.
  const codigo = semeado.codigo;
  const id = semeado.id!;

  // 2. O HTML CRU do servidor, sem rodar o JavaScript.
  const cru = await page.request.get("/app/products");
  const html = await cru.text();
  console.log("HTML do servidor:", (html.length / 1024).toFixed(0), "KB | status", cru.status());

  // 3. O produto está na página? Sem isto o resto do teste mede o corte de 500.
  const listaTemOProduto = html.includes(id);
  console.log("produto no HTML:", listaTemOProduto);
  expect(listaTemOProduto, "o produto semeado não está na página — o teste não mediu nada").toBe(
    true,
  );

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
  //
  // Duas formas são legítimas, e a função decide: foto em DISCO vira a rota da
  // API (`/api/v1/products/{id}/images/{fotoId}`), foto no BUCKET vira a URL do
  // storage. A versão anterior só aceitava URL absoluta e por isso reprovava
  // com a forma correta em uso — medir o instrumento, não o defeito.
  //
  // O payload do RSC vem escapado — `{\"url\":\"…\"}`, com a barra ANTES das
  // aspas. O padrão `/"url":"([^"]+)"/` não casa com `\"url\":\"` e devolve
  // nada mesmo com a foto presente: foi o que aconteceu nesta versão, que
  // reprovou vendo a URL certa na tela. O padrão tolera a barra opcional.
  const bruta = /\\?"url\\?":\\?"([^"\\]+)/.exec(valor)?.[1];
  console.log("url da foto (bruta):", bruta ?? "(nao extraida)");
  expect(bruta, "a entrada do mapa não tem campo url").toBeTruthy();

  const url = bruta!.replace(/\\u002F/gi, "/");
  console.log("url da foto:", url.slice(0, 90));
  // O caminho do redimensionador do Cloud dá 404 no self-host — ver
  // `lib/storage/foto.ts`.
  expect(url).not.toContain("/render/image/");
  expect(
    url.startsWith("/api/v1/") || url.startsWith("http"),
    `URL de foto fora das duas formas conhecidas: ${url}`,
  ).toBe(true);

  const completa = url.startsWith("/") ? `https://crm.billhigiene.tech${url}` : url;
  const r = await page.request.get(completa);
  console.log("status da foto do HTML:", r.status(), "| tipo:", r.headers()["content-type"]);
  expect(r.status(), `a foto do HTML não carrega: ${completa}`).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/image\//);

  // 6. E a PROVA que o dono pediu: na tela, a coluna preenchida já na primeira
  // pintura.
  //
  // A evidência anterior era tirada sem navegar, e por isso registrava o INBOX —
  // a tela em que o login deixou a página, não a de produtos. Um arquivo de
  // imagem que documenta outra tela é pior que nenhum: passa por prova e não
  // prova nada.
  //
  // Aqui a navegação é bloqueada de propósito no `/api/v1/products/images`, a
  // rota que o client usava antes. Se a coluna ainda dependesse dela, o produto
  // apareceria SEM foto para sempre — e o defeito está de volta na tela, que é
  // onde ele foi relatado.
  let chamadasDeLote = 0;
  await page.route("**/api/v1/products/images", async (rota) => {
    chamadasDeLote++;
    await rota.abort();
  });

  await page.goto("/app/products", { waitUntil: "domcontentloaded" });
  // Âncora no `data-testid` que a PRÓPRIA aplicação põe na linha
  // (`produto-${codigo}`). A versão anterior procurava `tr[data-produto]`, que
  // não existe — a lista é um `<ul>` — e caía no `getByText`, que resolve para
  // o `<p>` do NOME: o `<img>` é irmão desse `<p>`, não filho, então a busca
  // dentro dele nunca acharia a foto mesmo com tudo correto na tela.
  const linha = page.locator(`[data-testid="produto-${codigo}"]`).first();
  await linha.waitFor({ state: "visible", timeout: 30_000 });

  const img = linha.locator('img[src*="/images/"]').first();
  await img.waitFor({ state: "visible", timeout: 30_000 });

  // `visible` só quer dizer "está no DOM com caixa" — a imagem pode ainda estar
  // em trânsito. Medir `naturalWidth` logo depois dava 0 mesmo com tudo certo,
  // que é como um teste passa a reprovar por motivo errado. Aqui espera-se o
  // sinal que真正 distingue "carregou" de "está na tela".
  const src = await img.getAttribute("src");
  console.log("img na tela:", src?.slice(0, 70));

  await img.evaluate(
    (el) =>
      new Promise<void>((resolve, reject) => {
        const i = el as HTMLImageElement;
        if (i.complete && i.naturalWidth > 0) return resolve();
        const t = setTimeout(() => reject(new Error("espera de 20 s esgotada")), 20_000);
        i.addEventListener(
          "load",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
        i.addEventListener(
          "error",
          () => {
            clearTimeout(t);
            reject(new Error(`a foto deu erro de carregamento: ${i.getAttribute("src")}`));
          },
          { once: true },
        );
      }),
  );

  const dimensao = await img.evaluate((el) => {
    const i = el as HTMLImageElement;
    return { w: i.naturalWidth, completo: i.complete };
  });
  console.log("dimensões:", dimensao.w, "| completo:", dimensao.completo);
  console.log("chamadas à rota de lote durante a render:", chamadasDeLote);

  expect(
    dimensao.w,
    `a foto está no DOM mas não carregou (naturalWidth 0, src ${src})`,
  ).toBeGreaterThan(0);
  expect(
    chamadasDeLote,
    "a coluna ainda depende da rota de lote no client — o defeito voltou",
  ).toBe(0);

  // A evidência precisa mostrar A LINHA DO PRODUTO, com a foto no lugar. Sem
  // rolar até ela, o arquivo registra o topo da lista — onde não está o
  // produto semeado — e documenta uma tela que não tem nada a ver com o defeito
  // (foi o que aconteceu na primeira versão desta evidência).
  //
  // Rolar, e não filtrar: filtrar passaria pelo client e a prova deixaria de ser
  // sobre a PRIMEIRA pintura, que é exatamente o que se quer provar.
  await img.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await linha.screenshot({ path: "evidence/fotos-no-html-inicial.png" });
  console.log("evidência: evidence/fotos-no-html-inicial.png");
});
