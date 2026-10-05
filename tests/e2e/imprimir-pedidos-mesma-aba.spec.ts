import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

test.setTimeout(120_000);

/**
 * O contrato da impressão de pedidos: clicar em "Imprimir pedidos" tem de
 * entregar o PDF direto, **na mesma aba**.
 *
 * Duas coisas são medidas aqui, e as duas são defeitos que já existiram:
 *
 * 1. **Nenhuma aba nova.** O visor do navegador é o destino; abrir o PDF em
 *    `target="_blank"` deixava a aba de origem órfã e o papel com o endereço
 *    da tela de impressão no cabeçalho.
 * 2. **A página intermediária nunca é pintada.** `/app/pedidos/imprimir?ids=…`
 *    continua no fluxo (é a porta que a barra de massa já usa e a catraca de
 *    navegação cobra), mas responde 307 no servidor para
 *    `/api/v1/commercial-orders/pdf` — o HTML daquela rota, com o breadcrumb
 *    "Pedidos > Imprimir", não chega ao papel nem ao histórico da aba.
 */
test("Imprimir pedidos entrega o PDF na MESMA aba, sem página intermediária", async ({
  page,
  context,
}) => {
  await loginComoAdmin(page, lerCreds());
  await page.goto("/app/pedidos");

  const rotas: { url: string; status: number; navegacao: boolean }[] = [];
  page.on("response", (r) =>
    rotas.push({
      url: r.url(),
      status: r.status(),
      // Prefetch do `<Link>` do App Router pede a MESMA URL e responde 200 com
      // o payload RSC sem nunca pintar a página. Só a navegação de documento
      // é que decide o que o usuário vê.
      navegacao: r.request().isNavigationRequest() && r.frame() === page.mainFrame(),
    }),
  );

  const pdfPronto = page.waitForResponse(
    (r) => r.url().includes("/api/v1/commercial-orders/pdf"),
    { timeout: 60_000 },
  );
  // No Chromium headless o PDF vira download; num navegador com visor vira
  // navegação. As duas formas são a mesma promessa cumprida, por isso o
  // download é opcional — o que é obrigatório é que não apareça uma 2ª aba.
  const downloadPronto = page
    .waitForEvent("download", { timeout: 60_000 })
    .catch(() => null);

  const botao = page.getByRole("link", { name: "Imprimir pedidos" });
  expect(await botao.getAttribute("target"), "sem target=_blank").toBeNull();
  await botao.click();

  const pdf = await pdfPronto;
  expect(pdf.status(), "o endpoint do PDF tem de responder").toBe(200);
  expect(pdf.headers()["content-type"] ?? "").toContain("application/pdf");

  const download = await downloadPronto;
  expect(context.pages().length, "o PDF abre na aba que já estava aberta").toBe(1);
  if (download) {
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  } else {
    expect(page.url()).toContain("/api/v1/commercial-orders/pdf");
  }

  const impressao = rotas.filter((r) => r.url.includes("/app/pedidos/imprimir"));
  // O prefetch do `<Link>` pede a MESMA URL com `_rsc` e responde 200 sem
  // pintar nada — é ruído, não é a página. O que prova que a tela
  // intermediária nunca apareceu é que NENHUMA resposta 2xx de DOCUMENTO
  // chegou por ali: uma navegação de documento com 200 seria a tela pintada.
  const telaPintada = impressao
    .filter((r) => r.navegacao && r.status >= 200 && r.status < 300)
    .map((r) => `${r.status} ${r.url}`);
  expect(impressao.length, "a rota intermediária é a porta do botão").toBeGreaterThan(0);
  expect(telaPintada, "o HTML da tela de impressão nunca é pintado").toEqual([]);
});
