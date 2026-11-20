/**
 * 0333 — PEDIDO + BAIXA NA MESMA TRANSAÇÃO (flag ORDER_STOCK_ATOMIC).
 *
 * Prova no Postgres efêmero do `test:db`:
 *  1. falha de estoque no meio NÃO deixa pedido nem item, e o saldo continua;
 *  2. sucesso grava pedido + item e baixa o saldo;
 *  3. rascunho não baixa;
 *  4. mesma `chave_sincronizacao` não duplica nem baixa duas vezes;
 *  5. override de gerente (`p_ignorar_estoque`) não estoura: baixa o que cobre.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`.");
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

function falha(script: string): string {
  try {
    sql(script);
    return "";
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? e);
  }
}

const ORG = randomUUID();
const PROD = randomUUID();
const CHAVE = randomUUID();

const PEDIDO = (status: string) =>
  JSON.stringify({
    cliente_nome: "Cliente Invariante Atomico",
    status,
    origem: "vendedor",
    moeda: "BRL",
    subtotal_cents: 3000,
    desconto_cents: 0,
    frete_cents: 0,
    total_cents: 3000,
    modalidade_frete: "retirada",
    parcelas: [],
  }).replace(/'/g, "''");

const ITENS = (qtd: number) =>
  JSON.stringify([
    {
      product_id: PROD,
      produto_codigo: "INV-ATOM",
      produto_nome: "Produto Atomico",
      quantidade: qtd,
      preco_unit_cents: 1500,
      desconto_pct: 0,
      subtotal_cents: 1500 * qtd,
    },
  ]).replace(/'/g, "''");

function chamar(qtd: number, opts: { status?: string; baixar?: boolean; ignorar?: boolean; chave?: string | null; numero?: number } = {}) {
  const {
    status = "aprovado",
    baixar = true,
    ignorar = false,
    chave = null,
    numero = 990001,
  } = opts;
  return `select public.fn_criar_pedido_com_estoque(
    '${ORG}'::uuid, ${numero}, '${PEDIDO(status)}'::jsonb, '${ITENS(qtd)}'::jsonb,
    ${chave ? `'${chave}'` : "null"}, ${baixar}, ${ignorar}, false
  );`;
}

function contarPedidos(): number {
  return Number(sql(`select count(*) from public.commercial_orders where organization_id='${ORG}';`));
}
function contarItens(): number {
  return Number(
    sql(`select count(*) from public.commercial_order_items i
           join public.commercial_orders o on o.id=i.order_id
          where o.organization_id='${ORG}';`),
  );
}
function saldo(): number {
  return Number(sql(`select quantidade from public.catalog_products where id='${PROD}';`));
}
function ajustarSaldo(q: number) {
  sql(`update public.catalog_products set quantidade=${q} where id='${PROD}';`);
}
function limpar() {
  sql(`
    delete from public.commercial_orders where organization_id='${ORG}';
    delete from public.catalog_products where id='${PROD}';
    delete from public.organizations where id='${ORG}';
  `);
}

beforeAll(() => {
  limpar();
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'inv-atom-${ORG.slice(0, 8)}', 'Org Inv Atomico', 'Org Inv Atomico');
    insert into public.catalog_products
      (id, organization_id, codigo, nome, preco_cents, controla_estoque, quantidade, ativo)
    values ('${PROD}', '${ORG}', 'INV-ATOM', 'Produto Atomico', 1500, true, 2, true);
  `);
});

afterAll(() => {
  limpar();
});

describe("fn_criar_pedido_com_estoque", () => {
  it("estoque insuficiente no meio: NÃO deixa pedido nem item, saldo intacto", () => {
    ajustarSaldo(2);
    const erro = falha(chamar(3));
    expect(erro).toContain("estoque_insuficiente:Produto Atomico");
    expect(contarPedidos()).toBe(0);
    expect(contarItens()).toBe(0);
    expect(saldo()).toBe(2);
  });

  it("sucesso: pedido + item + baixa, na mesma transação", () => {
    ajustarSaldo(2);
    sql(chamar(2, { numero: 990002, chave: CHAVE }));
    expect(contarPedidos()).toBe(1);
    expect(contarItens()).toBe(1);
    expect(saldo()).toBe(0);
  });

  it("rascunho não baixa estoque", () => {
    ajustarSaldo(5);
    sql(chamar(2, { status: "rascunho", baixar: false, numero: 990003 }));
    expect(contarPedidos()).toBe(2);
    expect(saldo()).toBe(5);
  });

  it("mesma chave não duplica nem baixa duas vezes", () => {
    ajustarSaldo(5);
    const chave = randomUUID();
    const r1 = sql(chamar(1, { chave, numero: 990004 }));
    expect(r1).toContain('"ja_existia": false');
    const r2 = sql(chamar(1, { chave, numero: 990005 }));
    expect(r2).toContain('"ja_existia": true');
    expect(saldo()).toBe(4);
    // O pedido da chave conta uma vez; o rascunho anterior e o sucesso anterior
    // seguem no banco (limpos no afterAll).
    expect(contarPedidos()).toBe(3);
  });

  it("override de gerente não estoura; a linha sem saldo não é baixada", () => {
    ajustarSaldo(1);
    sql(chamar(3, { ignorar: true, numero: 990006 }));
    expect(contarPedidos()).toBe(4);
    // O escape cria o pedido; o saldo que não cobre a linha fica intacto (é o
    // mesmo efeito do override atual, que só deixava de recusar).
    expect(saldo()).toBe(1);
  });
});
