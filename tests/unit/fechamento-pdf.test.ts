// @vitest-environment node
// node de propósito: mesmo motivo do pedido-pdf.test.ts e do expedicao-contrato —
// streams Flate íntegros fora do jsdom para o @react-pdf/renderer.
import { describe, expect, it } from "vitest";

import { contaDoCaixa } from "@/lib/comercial/fechamento-carga";
import type { FechamentoPayload } from "@/lib/comercial/fechamento";
import { renderFechamentoPdf, type EmitenteDoFechamentoPdf } from "@/lib/comercial/fechamento-pdf";

const EMITENTE: EmitenteDoFechamentoPdf = { nome: "Bill Higiene e Limpeza" };

function fechamentoPayload(): FechamentoPayload {
  return {
    carga: {
      id: "33333333-3333-4333-8333-333333333333",
      numero: 7,
      placa: "ABC1D23",
      veiculo_tipo: "HR",
      motorista_nome: "Zé",
      status: "concluida",
    },
    resumo: {
      totalFaturado: 30000,
      pagoAntecipado: 3000,
      aCobrar: 27000,
      devolvido: 0,
      volumes: 2,
      concluidas: 2,
      pendentes: 0,
    },
    por_condicao: [{ condicao: "PIX", valor_cents: 20000 }],
    paradas: [
      {
        shipment_order_id: "44444444-4444-4444-8444-444444444444",
        order_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sequencia: 1,
        numero: 101,
        cliente_nome: "Cliente A",
        endereco_entrega: null,
        total_cents: 10000,
        condicao: "dinheiro",
        situacao: "entregue",
        motivo: null,
        entregue_em: "2026-10-12T14:00:00.000Z",
        volumes: 2,
        pago_cents: 3000,
        a_cobrar_cents: 7000,
        conferido: true,
      },
    ],
    fechamento: {
      linhas: [
        { chave: "dinheiro", valor_cents: 7000 },
        { chave: "pix", valor_cents: 0 },
        { chave: "cartao", valor_cents: 0 },
        { chave: "cheques", valor_cents: 0 },
        { chave: "boletos", valor_cents: 0 },
        { chave: "vale_motorista", valor_cents: 0 },
        { chave: "combustivel", valor_cents: 0 },
        { chave: "outras_despesas", valor_cents: 0 },
      ],
      conta: contaDoCaixa(
        [
          { chave: "dinheiro", valor_cents: 7000 },
          { chave: "pix", valor_cents: 0 },
          { chave: "cartao", valor_cents: 0 },
          { chave: "cheques", valor_cents: 0 },
          { chave: "boletos", valor_cents: 0 },
          { chave: "vale_motorista", valor_cents: 0 },
          { chave: "combustivel", valor_cents: 0 },
          { chave: "outras_despesas", valor_cents: 0 },
        ],
        27000,
      ),
      conferente_nome: "Ana",
      conferido_em: "2026-10-14T12:00:00.000Z",
      observacao: null,
    },
    avisos: [],
  };
}

describe("renderFechamentoPdf", () => {
  it("gera PDF válido com a conta fechada", async () => {
    const buf = await renderFechamentoPdf(EMITENTE, fechamentoPayload());
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 60000);

  it("sem fechamento gravado gera PDF válido — a tela ainda não fechou", async () => {
    const dados = fechamentoPayload();
    dados.fechamento = null;
    const buf = await renderFechamentoPdf(EMITENTE, dados);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 60000);
});
