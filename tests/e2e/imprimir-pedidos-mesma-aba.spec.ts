import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { execNpx } from "./utils/npx";

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
 *
 * ─── A impressão só existe COM pedido ───────────────────────────────────────
 *
 * Sem ids o botão monta `?ids=` vazio, e aí a rota intermediária faz o que foi
 * desenhada para fazer nesse caso: renderiza a tela vazia em vez de
 * redirecionar (é o caminho que `responsividade-nas-rotas` mede). O sintoma é
 * `waitForResponse` do PDF estourando 60s com a aba parada em
 * `/app/pedidos/imprimir` — que lê como "o botão não navegou".
 *
 * Até 24/10/2026 esta spec passava porque `recompra-radar` roda antes dela na
 * suíte e deixa pedidos no banco: precondição por ORDEM de suíte. Rodando
 * sozinha — como no noturno, onde ela foi a primeira a falhar — o banco estava
 * limpo. O seed é idempotente e é o mesmo que a spec irmã usa.
 */
test.beforeAll(() => {
  execNpx(["tsx", "scripts/seed-e2e-recompra.ts"], { stdio: "inherit" });
});

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

  // O item vive DENTRO do menu "Imprimir": em 19/10/2026 (`c2abeb48f`) os dois
  // botões de mesmo peso viraram um só, com o "o quê" dentro. O Radix não monta
  // o conteúdo de um menu fechado, então sem abrir o menu o link não existe no
  // DOM — era por isso que esta spec esperava 60s por um elemento que nunca ia
  // aparecer, e o motivo de ela estar vermelha desde aquela data.
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  // `menuitem`, não `link`: o Radix dá `role="menuitem"` ao item do menu, mesmo
  // quando o `asChild` clona um `<a href>` para dentro dele. É o papel que o
  // leitor de tela anuncia — procurar por `link` aqui era procurar um elemento
  // que o menu nunca expõe.
  const botao = page.getByRole("menuitem", { name: "Imprimir pedidos" });
  await expect(botao).toBeVisible();
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
