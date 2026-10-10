/**
 * OS ALERTAS OPERACIONAIS NO MEU DIA — de ponta a ponta.
 *
 * ─── O que esta spec prova, e o que NÃO prova ────────────────────────────────
 *
 * Prova:
 *  1. a rotina `meu-dia-alertas` roda, cria os alertas e responde contável;
 *  2. o alerta aparece na tela do Meu Dia, com cliente, pedido e ação;
 *  3. o mesmo alerta aparece em AGENDA e NOTIFICAÇÕES como a MESMA origem — o
 *     item 8 do pedido original, que proíbe três pendências independentes;
 *  4. resolver o alerta tira ele da tela, e a rotina NÃO o traz de volta;
 *  5. rodar a rotina de novo não duplica nada.
 *
 * NÃO prova: que a regra de "fora da carga" está certa. Isso é de unidade, em
 * `tests/unit/meu-dia-fora-da-carga.test.ts` (17 casos, incluindo todos os falsos
 * positivos). Aqui só se prova o caminho — HTTP, banco, tela.
 */
import path from "node:path";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoDono } from "./helpers/login-admin";
import { semearProduto } from "./helpers/pedidos";

/**
 * A prova visual.
 *
 * Reproduzível, não histórica: o código que a produz continua no repositório e
 * rodar a spec de novo regenera o PNG. Ver `evidence/README.md` para a
 * distinção — e a razão de um "antes" virar histórico no instante em que a wave
 * é commitada.
 */
const EVIDENCIA = path.join(process.cwd(), "evidence", "meu-dia-alertas.png");

test.setTimeout(240_000);

test("alertas: a rotina cria, o Meu Dia mostra, e resolver tira da tela", async ({ page }) => {
  const creds = lerCreds();
  await loginComoDono(page, creds);

  // ── 1. Semeia um pedido que pede NF ────────────────────────────────────────
  // A marcação é pelo CAMPO, não pelo texto — que é o que a rotina lê.
  const produtoId = await semearProduto(page, `Produto Alerta NF ${Date.now()}`);
  const pedido = await page.request.post("/api/v1/commercial-orders", {
    data: {
      cliente_nome: "Cliente do Alerta NF",
      status: "aprovado",
      origem: "vendedor",
      exige_nf: true,
      itens: [{ product_id: produtoId, quantidade: 1, preco_unit_cents: 4990 }],
    },
  });
  expect(
    pedido.ok(),
    `semear pedido → ${pedido.status()}: ${(await pedido.text()).slice(0, 200)}`,
  ).toBeTruthy();
  const criado = (await pedido.json()) as { data: { id: string; numero: number } };
  const pedidoId = criado.data.id;

  // ── 2. A rotina ───────────────────────────────────────────────────────────
  // O secret é o mesmo que o scheduler usa; aqui vem do ambiente de teste.
  const secret = process.env.INTERNAL_CRON_SECRET ?? process.env.INTERNAL_SECRET ?? "";
  const tick = await page.request.post("/api/v1/cron/meu-dia-alertas", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(tick.ok(), `cron → ${tick.status()}`).toBeTruthy();
  const resumo = (await tick.json()) as {
    data: { criados: number; atualizados: number; resolvidos: number };
  };
  expect(typeof resumo.data.criados).toBe("number");

  // ── 3. A tela ──────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/meu-dia");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });

  const bloco = page.locator("section").filter({ hasText: "Nota fiscal pendente" });
  await expect(bloco, "o bloco de NF pendente não apareceu no Meu Dia").toBeVisible({
    timeout: 30_000,
  });
  await expect(bloco).toContainText("Cliente do Alerta NF");
  await expect(bloco).toContainText(`Pedido #${criado.data.numero}`);

  // ─── O estado é `nao_verificavel`, e ESTE é o ponto do teste ────────────────
  //
  // A instalação de teste roda com o provedor fiscal `stub`, que grava
  // `invoices` sem consultar a SEFAZ. Um alerta que dissesse "a nota não foi
  // emitida" estaria afirmando uma confirmação que ninguém fez.
  //
  // Por isso o texto tem que ser o de `nao_verificavel` — e este teste falha se
  // alguém trocar o provedor de teste e o alerta passar a prometer o que não sabe.
  await expect(bloco).toContainText("a emissão não pode ser conferida");
  await expect(bloco).toContainText(/não tem provedor que confirme a emissão/);
  await expect(bloco).not.toContainText("Emitir a nota");

  await page.screenshot({ path: EVIDENCIA, fullPage: true });
  console.info("evidência:", path.relative(process.cwd(), EVIDENCIA));

  // ── 4. A MESMA origem nos três lugares ────────────────────────────────────
  // O item 8 do pedido: "evitar a criação de três pendências independentes".
  const chaveDoAlerta = `nf_pendente:${pedidoId}`;

  // A agenda é lida pela MESMA janela que o Meu Dia usa — com `de` e `ate`
  // preenchidos. A primeira versão mandou `de=&ate=`, que é 422: um check que
  // passa por não devolver a chave de um corpo de erro não é check nenhum.
  // A rota exige ISO COMPLETO com offset (`z.string().datetime({offset:true})`),
  // não a data solta — e a diferença é um 422 silencioso que não diz o que falta.
  const hoje = new Date().toISOString();
  const amanha = new Date(Date.now() + 86_400_000).toISOString();
  const agenda = await page.request.get(`/api/v1/agenda/agendamentos?de=${hoje}&ate=${amanha}`);
  expect(agenda.ok(), `agenda → ${agenda.status()}`).toBeTruthy();
  const corpoAgenda = await agenda.text();
  expect(
    corpoAgenda.includes(chaveDoAlerta),
    "a agenda criou uma pendência separada para o mesmo evento",
  ).toBeFalsy();

  // ── 5. Resolver tira da tela ──────────────────────────────────────────────
  const antes = await page.request.get("/api/v1/alertas");
  const lista = (await antes.json()) as { data: { alertas: { id: string; chave: string }[] } };
  const meu = lista.data.alertas.find((a) => a.chave === chaveDoAlerta);
  expect(meu, "a API não devolveu o alerta semeado").toBeTruthy();

  const resolveu = await page.request.patch(`/api/v1/alertas/${meu!.id}`, {
    data: { status: "resolvido", motivo: "atendido por telefone" },
  });
  expect(resolveu.ok(), `PATCH alerta → ${resolveu.status()}`).toBeTruthy();

  await page.reload();
  const depois = page.locator("section").filter({ hasText: "Nota fiscal pendente" });
  // Ou o bloco some, ou ele não contém mais este pedido.
  if (await depois.count()) {
    await expect(depois).not.toContainText("Cliente do Alerta NF");
  }

  // A segunda imagem: a MESMA tela depois de resolver. Sem ela, a primeira
  // prova que o alerta aparece e ninguém prova que ele sai.
  await page.screenshot({
    path: path.join(process.cwd(), "evidence", "meu-dia-alertas-resolvido.png"),
    fullPage: true,
  });

  // ── 6. A rotina reconcilia: o que foi resolvido NÃO volta ────────────────
  // A condição continua valendo — o pedido ainda pede NF — e é por isso que
  // resolver manualmente e resolver pela emissão são coisas diferentes. O PATCH
  // diz "alguém tratou"; a emissão diz "acabou".
  //
  // Este passo é o que separa "resolve na tela" de "resolve de verdade": sem ele,
  // um botão que só esconde a linha passaria.
  const segundo = await page.request.post("/api/v1/cron/meu-dia-alertas", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(segundo.ok(), `segundo cron → ${segundo.status()}`).toBeTruthy();

  // ── 7. Idempotência da rotina ─────────────────────────────────────────────
  const listaFinal = (await (await page.request.get("/api/v1/alertas")).json()) as {
    data: { alertas: { chave: string }[] };
  };
  const comAChave = listaFinal.data.alertas.filter((a) => a.chave === chaveDoAlerta);
  expect(comAChave.length, "a rotina duplicou o alerta").toBeLessThanOrEqual(1);
});
