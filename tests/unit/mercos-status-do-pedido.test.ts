/**
 * A TRADUÇÃO DO STATUS DO MERCOS — cobrada porque já custou 11.278 pedidos
 * invisíveis na Expedição.
 *
 * O importador mandava "Concluído" (venda fechada, nota emitida) para
 * `entregue`. A Expedição lista `aprovado`/`faturado`, e `entregue` é o FIM do
 * caminho de carga — então todo pedido que chegava do ERP nascia fora da fila
 * e nunca podia ser carregado. O pedido só vira `entregue` quando o fechamento
 * da carga confirma a entrega; o ERP não decide isso.
 */
import { describe, expect, it } from "vitest";

import { STATUS } from "@/workers/mercos/status.mjs";

describe("status do pedido do Mercos", () => {
  it("Concluído é faturado — nota emitida, mercadoria ainda no depósito", () => {
    expect(STATUS.Concluído).toBe("faturado");
  });

  it("a entrega é do NOSSO caminho de carga, nunca do ERP", () => {
    // Se algum rótulo do Mercos voltar a mapear para `entregue`, o pedido some
    // da Expedição no dia em que entra — o defeito que este teste vigia.
    const paraEntregue = Object.entries(STATUS).filter(([, status]) => status === "entregue");
    expect(paraEntregue).toEqual([]);
  });

  it("os passos que a Expedição lê continuam alcançáveis pelo importador", () => {
    // A fila da carga é `aprovado`/`faturado` (ver app/app/expedicao/page.tsx).
    expect(Object.values(STATUS)).toContain("aprovado");
    expect(Object.values(STATUS)).toContain("faturado");
    expect(STATUS.Faturado).toBe("faturado");
    expect(STATUS["Aguardando Faturamento"]).toBe("aprovado");
  });

  it("só devolve status que o CHECK de commercial_orders aceita", () => {
    const aceitos = new Set([
      "rascunho",
      "em_analise",
      "aprovado",
      "faturado",
      "expedido",
      "entregue",
      "cancelado",
    ]);
    for (const [origem, status] of Object.entries(STATUS)) {
      expect(aceitos.has(status), `${origem} → ${status}`).toBe(true);
    }
  });
});
