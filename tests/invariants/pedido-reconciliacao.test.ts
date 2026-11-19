/**
 * MATRIZ E · 9 — RECONCILIAÇÃO NO BANCO: PEDIDO, ITENS E PARCELAS SOMAM CERTO.
 *
 * O criador calcula na tela, o servidor recalcula, e o banco guarda. Se as
 * três contas divergirem, o erro só aparece no fechamento do mês — e aí já
 * virou cobrança errada. Este arquivo prova a última perna contra Postgres
 * real (o mesmo `baseline.sql` que o self-hoster aplica):
 *
 *   1. `sum(itens.subtotal_cents) = pedido.subtotal_cents`;
 *   2. `subtotal − desconto + frete = total`;
 *   3. `sum(parcelas[].valor_cents) = total` — inclusive o resto do
 *      arredondamento, que fica na última parcela;
 *   4. cada `subtotal_cents` de item é o que `subtotalDoItem` produz para
 *      quantidade × preço × desconto (a função que o serviço chama, importada
 *      aqui — uma cópia da regra passaria verde depois de a regra mudar).
 *
 * Os números vêm das funções de domínio, não de literais escritos à mão: é o
 * que liga este teste ao código que cria pedido de verdade.
 */
import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { calcularParcelas, subtotalDoItem } from "@/lib/schemas/pedidos";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
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

const ORG = "0e9eaaaa-0000-4000-8000-000000000001";
const CONTATO = "0e9eaaaa-1111-4000-8000-000000000001";
const PEDIDO = "0e9eaaaa-2222-4000-8000-000000000001";

// Itens como o editor manda: quantidade inteira, preço unitário e desconto.
const ITENS = [
  { nome: "Água sanitária 5 L", codigo: "AGUA-5", quantidade: 2, preco: 5000, desconto: 0 },
  { nome: "Detergente 500 ml", codigo: "DET-500", quantidade: 3, preco: 1990, desconto: 10 },
  { nome: "Sabão em pó 1 kg", codigo: "SAB-1", quantidade: 1, preco: 12990, desconto: 0 },
];

const DESCONTO_RS = 1000;
const DESCONTO_PCT = 5;
const FRETE = 2500;
const CONDICAO = "30/60/90";

const subtotais = ITENS.map((i) => subtotalDoItem(i.quantidade, i.preco, i.desconto));
const SUBTOTAL = subtotais.reduce((s, v) => s + v, 0);
// A mesma conta de `criarPedidoComercial`: R$ e % SOMAM, e o % é aplicado
// sobre o subtotal dos itens.
const DESCONTO = DESCONTO_RS + Math.round((SUBTOTAL * DESCONTO_PCT) / 100);
const TOTAL = SUBTOTAL - DESCONTO + FRETE;
const PARCELAS = calcularParcelas(TOTAL, CONDICAO);

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'reconciliacao-e', 'Reconciliação E', 'Reconciliação E')
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name, display_name)
    values ('${CONTATO}', '${ORG}', 'Cliente da Reconciliação', 'Cliente da Reconciliação')
    on conflict (id) do nothing;

    delete from public.commercial_orders where id = '${PEDIDO}';

    insert into public.commercial_orders (
      id, organization_id, numero, contact_id, cliente_nome, status, origem,
      subtotal_cents, desconto_cents, desconto_pct, frete_cents, total_cents,
      condicao_pagamento, parcelas
    ) values (
      '${PEDIDO}', '${ORG}', 1, '${CONTATO}', 'Cliente da Reconciliação', 'aprovado', 'vendedor',
      ${SUBTOTAL}, ${DESCONTO}, ${DESCONTO_PCT}, ${FRETE}, ${TOTAL},
      '${CONDICAO}', '${JSON.stringify(PARCELAS)}'::jsonb
    );

    ${ITENS.map(
      (item, pos) => `
      insert into public.commercial_order_items (
        organization_id, order_id, posicao, produto_codigo, produto_nome,
        quantidade, preco_unit_cents, desconto_pct, subtotal_cents
      ) values (
        '${ORG}', '${PEDIDO}', ${pos}, '${item.codigo}', '${item.nome}',
        ${item.quantidade}, ${item.preco}, ${item.desconto}, ${subtotais[pos]}
      );`,
    ).join("")}
  `);
});

describe("pedido criado no banco: itens e parcelas reconciliam com o total", () => {
  it("a soma dos itens é o subtotal do pedido", () => {
    // 2×50,00 + 3×19,90−10% + 1×129,90 = 100,00 + 53,73 + 129,90 = 283,63
    expect(SUBTOTAL).toBe(28363);
    const soma = sql(`
      select sum(subtotal_cents)::bigint from public.commercial_order_items
       where organization_id = '${ORG}' and order_id = '${PEDIDO}';
    `);
    expect(Number(soma)).toBe(SUBTOTAL);
    const cabecalho = sql(`
      select subtotal_cents from public.commercial_orders
       where organization_id = '${ORG}' and id = '${PEDIDO}';
    `);
    expect(Number(cabecalho)).toBe(SUBTOTAL);
  });

  it("subtotal − desconto + frete é o total gravado (R$ e % somam)", () => {
    // 140,00 (R$ 10,00 + 5% de 283,63 = 14,18) e frete 25,00 → 284,45.
    expect(DESCONTO).toBe(2418);
    expect(TOTAL).toBe(28445);
    const [total, formula] = sql(`
      select total_cents,
             (subtotal_cents - desconto_cents + frete_cents)
        from public.commercial_orders
       where organization_id = '${ORG}' and id = '${PEDIDO}';
    `).split("|");
    expect(Number(total)).toBe(TOTAL);
    expect(Number(formula)).toBe(TOTAL);
  });

  it("as parcelas somam o total, com o resto na última", () => {
    // 284,45 / 3 = 94,81 + 94,81 + 94,83
    expect(PARCELAS.map((p) => p.valor_cents)).toEqual([9481, 9481, 9483]);
    const soma = sql(`
      select sum((parcela->>'valor_cents')::bigint)
        from public.commercial_orders o,
             jsonb_array_elements(o.parcelas) as parcela
       where o.organization_id = '${ORG}' and o.id = '${PEDIDO}';
    `);
    expect(Number(soma)).toBe(TOTAL);
    const quantas = sql(`
      select jsonb_array_length(parcelas) from public.commercial_orders
       where organization_id = '${ORG}' and id = '${PEDIDO}';
    `);
    expect(Number(quantas)).toBe(3);
  });

  it("cada item tem o subtotal que a função do serviço calcula", () => {
    const linhas = sql(`
      select posicao, subtotal_cents from public.commercial_order_items
       where organization_id = '${ORG}' and order_id = '${PEDIDO}'
       order by posicao;
    `)
      .split("\n")
      .map((l) => l.split("|").map(Number));

    expect(linhas).toEqual(subtotais.map((valor, pos) => [pos, valor]));
    // O item com 10% de desconto é onde o arredondamento aparece: 3×19,90×0,9.
    expect(linhas[1]?.[1]).toBe(5373);
  });

  it("a reconciliação é escopada por organização (nada de somar pedido alheio)", () => {
    const alheio = sql(`
      select count(*) from public.commercial_order_items
       where organization_id <> '${ORG}' and order_id = '${PEDIDO}';
    `);
    expect(Number(alheio)).toBe(0);
  });
});
