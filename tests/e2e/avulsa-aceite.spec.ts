import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

import { semearContatoComEndereco } from "./helpers/expedicao";
import { lerCreds, loginComoAdmin, semearCredenciais } from "./helpers/login-admin";
import { semearProduto } from "./helpers/pedidos";

/**
 * ACEITE DA VENDA AVULSA (V1) — o risco fiscal, medido contra a main publicada.
 *
 * A tela ja esta no ar (2.1.0). Esta spec prova o que o deploy nao mediu:
 * a nota nasce so de produto do catalogo (NCM do cadastro); sem NCM nao emite;
 * dois envios com a MESMA chave dao uma nota; a grade marca "Avulsa",
 * order_id null e zero recebivel. Os casos 9a/9b/9d de clique e queda de rede
 * ficam fora desta versao — este e o risco fiscal do aceite.
 *
 * Fixtures: fiscal_settings stub/homologacao com RESTORE do snapshot anterior
 * (padrao J13) e CNPJ sintetico de 14 digitos, sem dado de pessoa real.
 */
const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CNPJ_EMITENTE = "11222333000181";
/** Sintetico, so comprimento: o destinatario valida 11/14 digitos. */
const CNPJ_SINTETICO = "12345678000199";
const NCMS = [
  "84713012",
  "19059090",
  "22021000",
  "30049099",
  "48191000",
  "61091000",
  "94036000",
  "73269090",
  "39269090",
  "85171231",
];

let orgId = "";
let fiscalAnterior: Record<string, unknown> | null = null;

test.describe.configure({ mode: "serial", timeout: 300_000 });

test.beforeAll(async () => {
  const creds = semearCredenciais();
  orgId = (creds as unknown as { org_id: string }).org_id;

  const { data } = await admin
    .from("fiscal_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  fiscalAnterior = (data as Record<string, unknown> | null) ?? null;

  const { error } = await admin.from("fiscal_settings").upsert(
    {
      organization_id: orgId,
      ambiente: "homologacao",
      provedor: "stub",
      emitente_documento: CNPJ_EMITENTE,
      uf: "SP",
      certificado_path: "certificado.pfx",
      certificado_senha_encrypted: null,
      entrada_ativa: false,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(`nao consegui preparar fiscal_settings: ${error.message}`);
});

test.afterAll(async () => {
  // Devolve a organizacao como estava — a suite compartilha o banco.
  if (fiscalAnterior) {
    await admin.from("fiscal_settings").upsert(fiscalAnterior, { onConflict: "organization_id" });
  } else {
    await admin.from("fiscal_settings").delete().eq("organization_id", orgId);
  }
});

test("avulsa: catalogo com NCM, uma nota por chave e grade sem recebivel", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  const carimbo = Date.now();
  const cliente = `Cliente Avulsa ${carimbo}`;
  await semearContatoComEndereco(page, cliente);

  const produtos: { nome: string; ncm: string }[] = [];
  for (let i = 0; i < NCMS.length; i += 1) {
    const nome = `Produto Avulsa ${i} ${carimbo}`;
    await semearProduto(page, nome, { ncm: NCMS[i] });
    produtos.push({ nome, ncm: NCMS[i]! });
  }
  const semNcm = `Produto Sem NCM ${carimbo}`;
  await semearProduto(page, semNcm);

  const buscaCliente = page.getByPlaceholder("Buscar cliente por nome, telefone ou e-mail…");
  const buscaProduto = page.getByPlaceholder("Buscar produto por nome ou código…");

  async function abrirAvulsa() {
    await page.goto("/app/notas?aba=emitir");
    await page.getByRole("button", { name: "NF-e de venda avulsa" }).click();
    await buscaCliente.fill(cliente);
    await page.getByRole("button", { name: new RegExp(cliente) }).first().click();
    await page.locator("#av-doc").fill(CNPJ_SINTETICO);
  }

  async function adicionarProduto(nome: string) {
    await buscaProduto.fill(nome);
    await page.getByRole("option", { name: new RegExp(nome) }).first().click();
  }

  async function preencherItens(lista: typeof produtos) {
    for (const p of lista) await adicionarProduto(p.nome);
    for (let i = 0; i < lista.length; i += 1) {
      await page.getByLabel("Preço (centavos)").nth(i).fill("10");
    }
    await expect(page.getByTestId("nfe-formulario-pronto")).toBeVisible();
    for (let i = 0; i < lista.length; i += 1) {
      await expect(page.getByTestId("nfe-item-ncm").nth(i)).toHaveText(lista[i]!.ncm);
    }
  }

  const posts: { key: string; body: string }[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (req.method() === "POST" && url.includes("/api/v1/invoices") && !url.includes("/validar")) {
      posts.push({ key: req.headers()["idempotency-key"] ?? "", body: req.postData() ?? "" });
    }
  });

  await abrirAvulsa();

  // (2) produto sem NCM: aviso visivel, botao bloqueado, nenhuma nota.
  await adicionarProduto(semNcm);
  await expect(page.getByTestId("nfe-item-sem-ncm")).toBeVisible();
  await expect(page.getByTestId("nfe-emitir")).toBeDisabled();
  await page.getByRole("button", { name: "Remover" }).first().click();
  await expect(page.getByTestId("nfe-itens-vazio")).toBeVisible();

  // (1 + 9a) 5 itens com NCM; duplo clique tem de gerar UMA nota.
  await preencherItens(produtos.slice(0, 5));
  const resposta1 = page.waitForResponse(
    (r) =>
      r.url().includes("/api/v1/invoices") &&
      r.request().method() === "POST" &&
      !r.url().includes("/validar"),
  );
  await page.getByTestId("nfe-emitir").dblclick();
  const r1 = await resposta1;
  expect(r1.status(), "primeira emissao e 201").toBe(201);
  const nota1 = (await r1.json()) as { data: { id: string } };
  expect(posts.length, "duplo clique = 1 POST").toBe(1);
  expect(posts[0]!.key, "a chave vai no header").not.toBe("");

  // (9c) replay: mesmo payload + mesma chave = a MESMA nota, nunca 201.
  const replay = await page.request.post("/api/v1/invoices", {
    headers: { "Idempotency-Key": posts[0]!.key },
    data: JSON.parse(posts[0]!.body),
  });
  expect(replay.status(), "replay nao cria nota nova").toBe(200);
  expect(replay.headers()["idempotency-replayed"]).toBe("true");
  const replayBody = (await replay.json()) as { data: { id: string } };
  expect(replayBody.data.id).toBe(nota1.data.id);

  // (9d) segunda emissao: chave nova e segunda nota.
  await abrirAvulsa();
  await preencherItens(produtos.slice(5));
  const resposta2 = page.waitForResponse(
    (r) =>
      r.url().includes("/api/v1/invoices") &&
      r.request().method() === "POST" &&
      !r.url().includes("/validar"),
  );
  await page.getByTestId("nfe-emitir").click();
  const r2 = await resposta2;
  expect(r2.status()).toBe(201);
  const nota2 = (await r2.json()) as { data: { id: string } };
  expect(posts.length, "duas emissoes, dois POSTs").toBe(2);
  expect(posts[1]!.key, "a chave muda depois do sucesso").not.toBe(posts[0]!.key);

  // (8) grade: avulsa identificada, order_id null e zero recebivel.
  await page.goto("/app/notas?aba=notas");
  const linha = page.locator("tr").filter({ hasText: cliente }).first();
  await expect(linha.getByTestId("nota-avulsa")).toHaveText("Avulsa");

  const ids = [nota1.data.id, nota2.data.id];
  const { data: notas } = await admin
    .from("invoices")
    .select("id, order_id, extras_fiscais")
    .in("id", ids);
  expect(notas, "as duas notas existem").toHaveLength(2);
  for (const n of notas ?? []) expect(n.order_id, "avulsa nao tem pedido").toBeNull();

  const { count } = await admin
    .from("financial_receivables")
    .select("id", { count: "exact", head: true })
    .in("invoice_id", ids);
  expect(count, "avulsa nao gera recebivel").toBe(0);

  // (1) NCM 10/10: o payload gravado leva o NCM do cadastro em cada item.
  const ncmsDaNota = (notas ?? []).flatMap((n) => {
    const extras = n.extras_fiscais as { avulsa?: { itens?: { ncm?: string }[] } } | null;
    return (extras?.avulsa?.itens ?? []).map((i) => i.ncm ?? "");
  });
  expect(ncmsDaNota.sort()).toEqual([...NCMS].sort());
});
