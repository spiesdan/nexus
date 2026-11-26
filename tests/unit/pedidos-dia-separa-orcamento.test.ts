/**
 * ORÇAMENTO NÃO É PEDIDO — no cabeçalho do dia.
 *
 * O número que abre o dia somava tudo: "8 pedidos · R$ 10.345,80" incluía três
 * "Em orçamento" e um cancelado (reclamação do dono em 26/11/2026). Quem lê
 * aquele total como venda do dia lê errado.
 *
 * A regra é por status, e as parcelas precisam FECHAR com o total.
 */
import { describe, expect, it } from "vitest";

import { partirDoDia } from "@/lib/pedidos/partir-do-dia";

const dia = [
  { status: "concluido", total_cents: 24000 },
  { status: "rascunho", total_cents: 196600 },
  { status: "rascunho", total_cents: 214000 },
  { status: "cancelado", total_cents: 132000 },
  { status: "rascunho", total_cents: 290000 },
  { status: "concluido", total_cents: 133180 },
];

describe("cabeçalho do dia", () => {
  it("orçamento e cancelado saem da contagem de pedidos", () => {
    const r = partirDoDia(dia);
    expect(r.vendas.n).toBe(2);
    expect(r.vendas.total).toBe(157180);
    expect(r.orcamentos).toEqual({ n: 3, total: 700600 });
    expect(r.cancelados).toEqual({ n: 1, total: 132000 });
  });

  it("as três parcelas fecham com o total do dia", () => {
    const r = partirDoDia(dia);
    expect(r.vendas.total + r.orcamentos.total + r.cancelados.total).toBe(r.fecha);
  });

  it("dia só de venda não mostra linha de orçamento nem de cancelado", () => {
    const r = partirDoDia([{ status: "concluido", total_cents: 100 }]);
    expect(r.orcamentos.n).toBe(0);
    expect(r.cancelados.n).toBe(0);
  });
});
