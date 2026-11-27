import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { preencherEquipeNaNovaCarga } from "./helpers/expedicao";
import { rotuloDoPedido, semearContato, semearPedido, semearProduto } from "./helpers/pedidos";

test.setTimeout(300_000);

/**
 * Endereço sem número (migration 0311): aviso honesto, entrada com referência,
 * memória do endereço e confirmação de quem entrega.
 *
 * ═══ O QUE ESTA SPEC PROVA, E POR QUE ASSIM ═════════════════════════════════
 *
 * O caso que ela cobre é o mais comum da operação real: **37% dos destinos não
 * têm número de casa** (medido em 15/11/2026: 12 `S/N` + 6 vazio de 49). Nesses
 * endereços o geocodificador nunca devolve a porta, e a tela antiga oferecia
 * "Tentar de novo" — um botão que não podia funcionar, porque não há número
 * para achar. O operador lia a falha do botão como falha do mapa.
 *
 * A marcação da entrada é feita pelo MESMO endpoint que a tela chama
 * (`/rota/manual`), e não clicando numa coordenada do mapa: o clique em pixel
 * de mapa é a parte frágil de qualquer teste de rota, e o que se quer provar
 * aqui é o ESTADO da parada (chip, aviso, referência, confirmação), não a
 * mecânica do canvas. A tela é lida de verdade em todos os passos.
 */

test("endereço sem número — aviso, entrada marcada, memória e confirmação", async ({ page }) => {
  const carimbo = Date.now();
  const cliente = `Padaria Sem Numero ${carimbo}`;

  await loginComoAdmin(page, lerCreds());
  const produtoId = await semearProduto(page, `Produto Sem Numero ${carimbo}`);
  const contactId = await semearContato(page, cliente);

  // O CADASTRO SEM NÚMERO — a precondição inteira. `S/N` é o que o vendedor
  // digita quando o cliente não sabe o número: o campo existe, o número não.
  //
  // O COMPLEMENTO leva o carimbo, e isso não é enfeite: a memória da entrada é
  // chaveada pelo ENDEREÇO normalizado, não pelo contato — é justamente o que
  // faz "marcar uma vez" valer para as cargas seguintes. Sem um imóvel único
  // por execução, a segunda rodada da suíte nasceria com a entrada da primeira
  // já aplicada, o aviso sumiria (correto!) e a spec falharia por não estar
  // isolada. Medido em 15/11/2026: foi exatamente o que aconteceu na 2ª
  // execução, com o pino já em "Entrada marcada · portão azul".
  const complemento = `Lote ${carimbo}`;
  const endereco = {
    logradouro: "Rua Marechal Deodoro",
    numero_end: "S/N",
    complemento,
    bairro: "Centro",
    cidade: "Mafra",
    uf: "SC",
  };
  const patch = await page.request.patch(`/api/v1/contacts/${contactId}`, {
    data: endereco,
  });
  expect(patch.status(), "não deu para gravar o endereço sem número").toBe(200);

  const pedido = await semearPedido(page, cliente, { produtoId, contactId });
  // SEGUNDO pedido no MESMO endereço. Em 0308 o destino é um por ENDEREÇO, então
  // esta carga tem UMA parada e DUAS linhas em `shipment_orders`. É o caso comum
  // da operação (o cliente compra duas vezes e o caminhão leva tudo junto) e o
  // que expunha o `maybeSingle()` do pertencimento: o motorista tocava "é aqui"
  // e recebia "Destino não pertence a esta carga" — estando parado na porta.
  const pedidoIrmao = await semearPedido(page, cliente, { produtoId, contactId });

  // Carga pela tela — o caminho real, sem atalho de API.
  await page.goto("/app/expedicao");
  await page.getByRole("link", { name: "Nova carga" }).click();
  await page.waitForURL(/\/app\/expedicao\/nova$/, { timeout: 20_000 });
  await expect(page.getByTestId(`carga-pedido-${pedido.numero}`)).toBeVisible({
    timeout: 20_000,
  });
  // Os dois pedidos marcados no passo 1; equipe no passo 2; confirmação na
  // revisão. A placa deixou de existir na fila quando a montagem virou três
  // passos — preenchê-la aqui era o timeout de 300 s do critical (run
  // 45919018146), não um defeito do produto.
  await page
    .locator("label")
    .filter({ hasText: rotuloDoPedido(pedido.numero) })
    .getByRole("checkbox")
    .check();
  await expect(page.getByTestId(`carga-pedido-${pedidoIrmao.numero}`)).toBeVisible({
    timeout: 20_000,
  });
  await page
    .locator("label")
    .filter({ hasText: rotuloDoPedido(pedidoIrmao.numero) })
    .getByRole("checkbox")
    .check();
  await preencherEquipeNaNovaCarga(page, {
    placa: "XYZ9K88",
    motorista: `Motorista ${carimbo}`,
  });
  await page.getByRole("button", { name: /^Confirmar carga/ }).click();
  await page.locator("[data-sonner-toast]").filter({ hasText: "Carga criada" }).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForURL(/\/app\/expedicao\/[0-9a-f-]+/, { timeout: 20_000 });
  const cargaId = page.url().split("/").filter(Boolean).pop() as string;

  await page.goto(`/app/expedicao/${cargaId}/rota`);

  // 1. O aviso é do CADASTRO, não do mapa: a parada diz que não há número.
  await expect(page.getByText("sem número no cadastro")).toBeVisible({ timeout: 30_000 });

  // 2. E por isso "Tentar de novo" NÃO é oferecido — o botão só aparece para
  //    endereço com número que ficou na rua. Oferecê-lo aqui era a promessa
  //    que o código não podia cumprir.
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0);

  // 3. A saída que existe é marcar a entrada — e ela está na tela.
  const marcar = page.getByRole("button", { name: "Marcar no mapa" });
  await expect(marcar).toBeVisible();

  // 4. O resumo antes de despachar conta a parada que ainda não tem entrada.
  await expect(page.getByText(/1 parada sem entrada marcada/)).toBeVisible();

  // 5. Marca a entrada — mesmo endpoint da tela, com a referência que o
  //    motorista vai ler.
  const respostaRota = await page.request.get(`/api/v1/shipments/${cargaId}/rota`);
  expect(respostaRota.status()).toBe(200);
  const paradas = (await respostaRota.json()) as {
    data: {
      paradas: {
        destination_id: string | null;
        numero?: string | null;
        pedidos: { order_id: string }[];
      }[];
    };
  };
  // UMA parada, DOIS pedidos: é o agrupamento por endereço (0308) e a razão de o
  // pertencimento ser pergunta de existência.
  expect(paradas.data.paradas).toHaveLength(1);
  expect(paradas.data.paradas[0]?.pedidos.map((p) => p.order_id).sort()).toEqual(
    [pedido.id, pedidoIrmao.id].sort(),
  );
  const destino = paradas.data.paradas[0]?.destination_id;
  expect(destino, "a parada precisa ter destino persistido (0308)").toBeTruthy();
  expect(paradas.data.paradas[0]?.numero).toBe("S/N");

  const marcou = await page.request.post(`/api/v1/shipments/${cargaId}/rota/manual`, {
    data: {
      destination_id: destino,
      latitude: -26.1112,
      longitude: -49.8053,
      referencia: "portão azul, entrar pelos fundos",
    },
  });
  expect(marcou.status()).toBe(200);
  const corpoMarcou = (await marcou.json()) as { data: { entrada_id: string | null } };
  // Memória gravada: sem `entrada_id` a marcação valeria só para esta carga.
  expect(corpoMarcou.data.entrada_id).toBeTruthy();

  // 6. A tela reflete o novo estado: o pino é a porta, com a referência.
  await page.reload();
  await expect(page.getByText("Entrada marcada")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/portão azul, entrar pelos fundos/)).toBeVisible();
  // E o aviso some — o endereço continua sem número, mas agora tem entrada.
  await expect(page.getByText("sem número no cadastro")).toHaveCount(0);
  await expect(page.getByText(/sem entrada marcada/)).toHaveCount(0);

  // 7. A CABINE — é aqui que a marcação do escritório deixa de ser palpite. O
  //    motorista lê a referência antes de descer do caminhão e confirma, na
  //    porta, que é ali; isso dá procedência ao ponto e vale para as próximas
  //    cargas do mesmo endereço.
  await page.goto(`/app/expedicao/${cargaId}/motorista`);
  await page.getByRole("button", { name: `Abrir detalhes de ${cliente}` }).click();
  // A referência aparece DUAS vezes na cabine — na lista da parada e dentro do
  // detalhe. A asserção é do detalhe: é lá que o motorista lê antes de descer,
  // e um `getByText` solto acusaria violação de modo estrito (2 elementos).
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Entrada marcada pela expedição")).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.getByText(/portão azul, entrar pelos fundos/)).toBeVisible();
  await dialogo.getByRole("button", { name: "É aqui — estamos na entrada" }).click();
  await expect(dialogo.getByText("Confirmada nesta entrega.")).toBeVisible({ timeout: 20_000 });
  // O botão some depois da confirmação: pedir a mesma informação duas vezes é
  // ruído no meio de uma entrega.
  await expect(dialogo.getByRole("button", { name: "É aqui — estamos na entrada" })).toHaveCount(0);

  // 8. A parada passa a dizer que esta entrega conferiu o ponto, e a memória
  //    do endereço registra a confirmação.
  const depois = await page.request.get(`/api/v1/shipments/${cargaId}/rota`);
  const paradaDepois = ((await depois.json()) as {
    data: {
      paradas: {
        entrada: { confirmacoes: number; confirmada_em: string | null; referencia: string | null } | null;
      }[];
    };
  }).data.paradas[0];
  expect(paradaDepois?.entrada?.confirmacoes).toBe(1);
  expect(paradaDepois?.entrada?.confirmada_em).toBeTruthy();
  expect(paradaDepois?.entrada?.referencia).toContain("portão azul");

  // 9. A PROMESSA DA MEMÓRIA — e é aqui que ela pode mentir em silêncio. Um
  //    CONTATO novo, no MESMO endereço, numa carga nova: o destino tem de
  //    nascer já apontando para a entrada (a marcação do escritório + a
  //    confirmação do motorista), sem ninguém marcar de novo e sem o aviso de
  //    "sem número" reaparecer — porque o número continua não existindo, mas a
  //    pergunta já foi respondida para este endereço.
  const contato2 = await semearContato(page, `Padaria Sem Numero 2 ${carimbo}`);
  const patch2 = await page.request.patch(`/api/v1/contacts/${contato2}`, { data: endereco });
  expect(patch2.status(), "não deu para gravar o mesmo endereço no 2º contato").toBe(200);
  const pedido2 = await semearPedido(page, `Padaria Sem Numero 2 ${carimbo}`, {
    produtoId,
    contactId: contato2,
  });

  const criouCarga2 = await page.request.post("/api/v1/shipments", {
    data: {
      placa: "XYZ9K88",
      veiculo_tipo: "HR",
      motorista_nome: `Motorista ${carimbo}`,
      order_ids: [pedido2.id],
    },
  });
  expect(criouCarga2.status(), "não deu para abrir a 2ª carga").toBe(201);
  const carga2 = ((await criouCarga2.json()) as { data: { id: string } }).data.id;

  const rota2 = await page.request.get(`/api/v1/shipments/${carga2}/rota`);
  const parada2 = ((await rota2.json()) as {
    data: {
      paradas: {
        latitude: number | null;
        longitude: number | null;
        geo_fonte: string | null;
        entrada: {
          referencia: string | null;
          confirmacoes: number;
          confirmada_em: string | null;
        } | null;
      }[];
    };
  }).data.paradas[0];
  expect(parada2?.entrada, "a 2ª carga nasceu sem a entrada memorizada").toBeTruthy();
  expect(parada2?.entrada?.referencia).toContain("portão azul");
  // A confirmação do motorista é memória do ENDEREÇO; o "confirmada nesta
  // entrega" é desta parada — e esta ainda não foi confirmada.
  expect(parada2?.entrada?.confirmacoes).toBe(1);
  expect(parada2?.entrada?.confirmada_em).toBeNull();
  expect(parada2?.latitude).toBe(-26.1112);
  expect(parada2?.longitude).toBe(-49.8053);
  expect(parada2?.geo_fonte).toBe("entrada");

  // E na tela da 2ª carga o aviso também não aparece — sem clique nenhum.
  await page.goto(`/app/expedicao/${carga2}/rota`);
  await expect(page.getByText("Entrada marcada")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("sem número no cadastro")).toHaveCount(0);
});
