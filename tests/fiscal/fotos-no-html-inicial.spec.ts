/**
 * AS FOTOS CHEGAM NO HTML — a coluna não pode aparecer vazia e depois
 * preencher.
 *
 * O sintoma que o dono descreveu, palavra por palavra: "aparece os produtos
 * sem foto e só depois a página já carregada é que carrega as imagens, depois
 * de alguns segundos".
 *
 * A causa era arquitetura, não estilo: o servidor entregava os produtos no HTML
 * inicial, mas as fotos eram buscadas num efeito do client — ou seja, depois
 * da primeira pintura, por definição. O lote existia e era rápido; chegava
 * tarde.
 *
 * Este teste mede a PROMESSA da página, não a animação: no HTML que o servidor
 * devolve, cada produto que tem foto no banco precisa aparecer com o `<img>`
 * já apontando para a URL. Se a foto só entra depois por JavaScript, o teste
 * reprova — que é exatamente o defeito.
 */
import { expect, test } from "@playwright/test";
import { lerCreds, loginComoDono } from "../e2e/helpers/login-admin";

test.setTimeout(300_000);

test("o HTML inicial já vem com as fotos, sem depender de JavaScript", async ({ page }) => {
  await loginComoDono(page, lerCreds());

  // 1. Um produto COM foto, semeado agora — o estado da org é o que se mede.
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

  // 2. O HTML CRU do servidor — sem esperar o JavaScript rodar.
  const cru = await page.request.get("/app/products");
  const html = await cru.text();
  console.log("HTML do servidor:", (html.length / 1024).toFixed(0), "KB | status", cru.status());

  // 3. A foto deste produto tem que estar no HTML, com o src preenchido.
  const temALinha = html.includes(id);
  console.log("produto no HTML:", temALinha);
  expect(temALinha, "o produto semeado não está no HTML do catálogo").toBe(true);

  // O `src` do <img> apontando para a foto deste produto, já no servidor.
  const comFoto = /<img[^>]+src="([^"]*\/images\/[^"]+)"[^>]*>/.exec(html);
  console.log("img de produto no HTML:", comFoto?.[1]?.slice(0, 80) ?? "(nenhuma)");
  expect(
    comFoto,
    "nenhum <img> de produto no HTML inicial — a coluna vai aparecer vazia e preencher depois (o defeito reportado)",
  ).not.toBeNull();
  expect(comFoto![1]!).toContain(`/api/v1/products/${id}/images/`);
  // E sem o prefixo do redimensionador do Cloud, que dá 404 no self-host.
  expect(comFoto![1]!).not.toContain("/render/image/");

  // 4. Confirma que a URL do HTML realmente carrega — sem executor o asset.
  const r = await page.request.get(comFoto![1]!);
  console.log("status da foto do HTML:", r.status(), "| tipo:", r.headers()["content-type"]);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/image\//);

  await page.screenshot({ path: "evidence/fotos-no-html-inicial.png" });
  console.log("evidência: evidence/fotos-no-html-inicial.png");
});
