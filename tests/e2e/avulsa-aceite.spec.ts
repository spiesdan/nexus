import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

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
/** CNPJ sintetico com digitos verificadores validos (o cadastro valida). */
function cnpjDeTeste(carimbo: number): string {
  const base = String(carimbo).slice(-12).padStart(12, "0");
  const digito = (numeros: number[]): number => {
    const pesos =
      numeros.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = numeros.reduce((s, n, i) => s + n * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const n = [...base].map(Number);
  const d1 = digito(n);
  const d2 = digito([...n, d1]);
  return `${base}${d1}${d2}`;
}
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

  // A senha do certificado precisa ser decifravel: o J13 deixa nula de
  // proposito e por isso a validacao devolve "falta: Senha do certificado".
  const senhaCifrada = await encryptWebhookSecret(admin, "senha-e2e-avulsa");
  if (!senhaCifrada) throw new Error("a chave de cifra do ambiente nao esta disponivel");

  const { error: erroOrg } = await admin
    .from("organizations")
    .update({ legal_name: "Empresa E2E Avulsa Ltda" })
    .eq("id", orgId);
  if (erroOrg) throw new Error(`nao consegui gravar legal_name: ${erroOrg.message}`);

  const { error } = await admin.from("fiscal_settings").upsert(
    {
      ...(fiscalAnterior ?? {}),
      organization_id: orgId,
      ambiente: "homologacao",
      provedor: "stub",
      serie: "1",
      natureza_operacao: "Venda",
      cfop_padrao: "5102",
      emitente_documento: CNPJ_EMITENTE,
      ie: "123456",
      uf: "SC",
      codigo_municipio: "4209102",
      certificado_path: "certificado.pfx",
      certificado_senha_encrypted: senhaCifrada,
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
  const cnpjCliente = cnpjDeTeste(carimbo);
  const contactId = await semearContatoComEndereco(page, cliente);
  const enderecoCompleto = await page.request.patch(`/api/v1/contacts/${contactId}`, {
    data: { cnpj: cnpjCliente, cep: "89300000" },
  });
  expect(enderecoCompleto.status(), "contato com CNPJ e CEP").toBe(200);

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
    await page.locator("#av-doc").fill(cnpjCliente);
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
