import * as path from "node:path";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "../e2e/helpers/login-admin";

/**
 * A BUSCA DE "NOVA CARGA" PRECISA ACHAR O PEDIDO.
 *
 * Semear pedidos e digitar na busca, na tela, e medir o que aparece. O teste
 * unitário de `filtrarEmbarcaveis` já cobre a comparação de texto com dado
 * real; este cobre o que o unitário não alcança — que o campo está na tela, que
 * a lista responde, e que **marcar um pedido continua visível depois de filtrar**.
 *
 * ─── A última parte é o ponto ────────────────────────────────────────────────
 *
 * Marcar, digitar o número do próximo e ver os marcados sumirem é o defeito
 * mais provável desta funcionalidade, e é o que a carga sai errada: a pessoa
 * acredita que marcou, clica em criar, e o servidor leva o que estava marcado —
 * ou o que a tela mostrava. Aqui os marcados ficam num bloco à parte, e o teste
 * exige que continuem lá depois do filtro.
 */
const EVIDENCIA = path.join(process.cwd(), "evidence", "expedicao-busca-carga.png");

test.setTimeout(300_000);

test("na nova carga, a busca acha o pedido por número, cliente e cidade", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  // 1. Semeia três pedidos em cidades e clientes bem distintos.
  //    `status: "aprovado"` é o que a Expedição mostra — a fila é só
  //    aprovado/faturado, então semear como `rascunho` (o padrão) mediria uma
  //    tela vazia e o teste passaria sem ter provado a busca.
  const semeados = await page.evaluate(async () => {
    const criar = async (nome: string, endereco: string) => {
      const r = await fetch("/api/v1/commercial-orders", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cliente_nome: nome,
          status: "aprovado",
          condicao_pagamento: "à vista",
          endereco_entrega: endereco,
          itens: [{ product_id: null, quantidade: 1, preco_unit_cents: 1000 }],
        }),
      });
      return {
        status: r.status,
        corpo: (await r.json().catch(() => ({}))) as Record<string, unknown>,
      };
    };
    return {
      saopaulo: await criar("Sonda São Paulo Ltda", "Rua Alfa, 10 — São Paulo/SP"),
      curitiba: await criar("Sonda Curitiba Ltda", "Av Beta, 20 — Curitiba/PR"),
      joinville: await criar("Sonda Joinville Ltda", "Rua Gama, 30 — Joinville/SC"),
    };
  });

  const numeros = (s: { corpo: Record<string, unknown> }): number => {
    const d = s.corpo.data as { numero?: number } | null;
    return d?.numero ?? 0;
  };
  const nSP = numeros(semeados.saopaulo);
  const nCur = numeros(semeados.curitiba);
  const nJoin = numeros(semeados.joinville);
  console.log("semeados:", nSP, nCur, nJoin, "| http:", semeados.saopaulo.status);
  expect(
    nSP && nCur && nJoin,
    `não consegui semear os pedidos: ${JSON.stringify(semeados.saopaulo)}`,
  ).toBeTruthy();

  // 2. A tela. O painel "Nova carga" já vem aberto quando o papel pode criar —
  //    não é botão que abre.
  await page.goto("/app/expedicao");

  const busca = page.getByTestId("carga-busca");
  await expect(busca, "o campo de busca não apareceu na nova carga").toBeVisible({
    timeout: 20_000,
  });

  // 3. A fila semeada precisa estar na tela. Se não estiver, o teste mediu o
  //    filtro errado — e o motivo fica escrito, em vez de um "não achou" sem
  //    explicação.
  const alvo = page.getByTestId(`carga-pedido-${nSP}`);
  if ((await alvo.count()) === 0) {
    await busca.fill("Sonda");
    await page.waitForTimeout(500);
  }
  console.log(
    "a fila traz o pedido semeado:",
    (await page.getByTestId(`carga-pedido-${nSP}`).count()) > 0,
  );
  await expect(
    page.getByTestId(`carga-pedido-${nSP}`),
    "o pedido semeado não está na fila da expedição — o teste não mediria a busca",
  ).toBeVisible();

  // 4. Por número cru — o que a pessoa digita ouvindo no telefone.
  await busca.fill(String(nSP));
  await expect(
    page.getByTestId(`carga-pedido-${nSP}`),
    "não achou pelo número do pedido",
  ).toBeVisible();
  const porNumero = await page.locator('[data-testid^="carga-pedido-"]').count();
  console.log("linhas ao buscar o número:", porNumero);
  expect(porNumero, "o número do pedido achou mais de um pedido").toBe(1);

  // 5. Por cidade SEM acento — o dado tem, a digitação não.
  await busca.fill("sao paulo");
  await expect(
    page.getByTestId(`carga-pedido-${nSP}`),
    "não achou por cidade digitada sem acento",
  ).toBeVisible();

  await busca.fill("joinville");
  await expect(page.getByTestId(`carga-pedido-${nJoin}`)).toBeVisible();
  const porCidade = await page.locator('[data-testid^="carga-pedido-"]').count();
  console.log("linhas ao buscar 'joinville':", porCidade);

  // 6. Pelo nome do cliente.
  await busca.fill("curitiba ltda");
  await expect(
    page.getByTestId(`carga-pedido-${nCur}`),
    "não achou pelo nome do cliente",
  ).toBeVisible();

  // 7. Termo que não existe: diz "não encontrado", e não devolve a lista toda.
  await busca.fill("cidade-que-nao-existe-xyz");
  await expect(page.getByTestId("carga-busca-vazia")).toBeVisible();
  const restantes = await page.locator('[data-testid^="carga-pedido-"]').count();
  console.log("linhas com termo inexistente:", restantes);
  expect(restantes, "busca sem resultado mostrou pedidos").toBe(0);

  // 8. O PONTO: marcar, filtrar, e o marcado continua visível.
  //
  // `click()`, e não `check()`: ao marcar, o pedido SAI da lista de baixo e
  // entra no bloco "Na carga" — por desenho, para não aparecer duas vezes. O
  // `check()` verifica que a caixa ficou marcada e fica esperando um elemento
  // que já saiu do DOM, travando até o fim do teste. A primeira versão deste
  // spec falhou aqui, e a falha parecia defeito do produto quando era o teste
  // esperando a coisa errada.
  await busca.fill("");
  await page.getByTestId(`carga-pedido-${nSP}`).waitFor({ state: "visible" });
  await page.getByTestId(`carga-pedido-${nSP}`).click();
  expect(
    await page.getByTestId(`carga-pedido-${nSP}`).count(),
    "o marcado continua na lista de baixo, duplicado",
  ).toBe(0);
  await expect(
    page.getByTestId("carga-selecionados"),
    "o bloco de selecionados não apareceu",
  ).toBeVisible();
  await expect(
    page.getByTestId(`carga-selecionado-${nSP}`),
    "o marcado não apareceu no bloco de selecionados",
  ).toBeVisible();

  // Agora aperta a busca para OUTRO pedido: o marcado tem de continuar na tela.
  await busca.fill("joinville");
  await expect(page.getByTestId(`carga-pedido-${nJoin}`)).toBeVisible();
  await expect(
    page.getByTestId(`carga-selecionado-${nSP}`),
    "o pedido marcado SUMIU quando a busca mudou — é a carga saindo no escuro",
  ).toBeVisible();

  // E o marcado não pode reaparecer na lista de baixo, duplicado e desmarcado.
  const duplicado = await page.getByTestId(`carga-pedido-${nSP}`).count();
  console.log("o marcado reapareceu na lista de baixo:", duplicado);
  expect(duplicado, "o marcado reapareceu na lista, fora do bloco de selecionados").toBe(0);

  await page.screenshot({ path: EVIDENCIA });
  console.log("evidência:", path.relative(process.cwd(), EVIDENCIA));

  // 9. Limpa o que semeou. Sem isto cada rodada deixa três pedidos `aprovado`
  //    na fila da expedição da instalação real, e a próxima rodada passa a
  //    medir uma lista que já estava suja — foi o que fez "joinville" devolver
  //    3 linhas em vez de 1, vira do teste e não da busca.
  const limpeza = await page.evaluate(
    async (numeros: number[]) => {
      const apagados: number[] = [];
      for (const n of numeros) {
        const lista = await (
          await fetch("/api/v1/commercial-orders?busca=Sonda", { credentials: "include" })
        ).json();
        const itens = (lista.data?.items ?? lista.data ?? []) as { id: string; numero: number }[];
        const alvo = itens.find((p) => p.numero === n);
        if (!alvo) continue;
        const r = await fetch(`/api/v1/commercial-orders/${alvo.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (r.ok || r.status === 404) apagados.push(n);
      }
      return apagados;
    },
    [nSP, nCur, nJoin],
  );
  console.log("limpos:", limpeza.join(", ") || "(nenhum)");
});
