/**
 * A TRADUÇÃO DO STATUS DO MERCOS — cobrada porque já custou 11.278 pedidos
 * invisíveis na Expedição.
 *
 * Duas correções moram neste arquivo, e as duas são de vocabulário:
 *
 *   1. O importador mandava "Concluído" para `entregue`. A Expedição lista o
 *      que ainda não embarcou, então todo pedido que chegava do ERP nascia fora
 *      da fila e nunca podia ser carregado. Entrega é do NOSSO caminho de
 *      carga: só o fechamento da carga (ou o "pago e entregue" declarado no
 *      ERP) escreve `entregue`.
 *
 *   2. "Concluído" ia para `faturado` — funcionava por acidente, porque a fila
 *      lia `faturado`, mas chamava de "Faturado" pedido sem NF-e nenhuma.
 *      `faturado` agora é exclusivo de quem tem nota emitida: no ERP, apenas
 *      "Faturado" e "Parcialmente Faturado" chegam lá.
 */
import { describe, expect, it } from "vitest";

import { STATUS_EMBARCAVEIS } from "@/lib/schemas/expedicao";
import { STATUS_DO_PEDIDO } from "@/lib/schemas/pedidos";
import { STATUS } from "@/workers/mercos/status.mjs";

describe("status do pedido do Mercos", () => {
  it("Concluído é concluido — venda fechada, sem nota, ainda no depósito", () => {
    expect(STATUS.Concluído).toBe("concluido");
  });

  it("só nota emitida no ERP vira faturado", () => {
    const paraFaturado = Object.entries(STATUS)
      .filter(([, status]) => status === "faturado")
      .map(([origem]) => origem)
      .sort();
    expect(paraFaturado).toEqual(["Faturado", "Parcialmente Faturado"]);
  });

  it("a entrega é do NOSSO caminho de carga, nunca do ERP", () => {
    // Se algum rótulo do Mercos voltar a mapear para `entregue`, o pedido some
    // da Expedição no dia em que entra — o defeito que este teste vigia.
    const paraEntregue = Object.entries(STATUS).filter(([, status]) => status === "entregue");
    expect(paraEntregue).toEqual([]);
  });

  it("Concluído e Faturado embarcam — os dois entram na fila da carga", () => {
    expect(STATUS_EMBARCAVEIS).toContain(STATUS.Concluído);
    expect(STATUS_EMBARCAVEIS).toContain(STATUS.Faturado);
    expect(STATUS_EMBARCAVEIS).toContain(STATUS.Aprovado);
  });

  it("os passos que a Expedição lê continuam alcançáveis pelo importador", () => {
    expect(STATUS.Faturado).toBe("faturado");
    expect(STATUS["Aguardando Faturamento"]).toBe("aprovado");
  });

  it("só devolve status que o CHECK de commercial_orders aceita", () => {
    // A lista é a mesma do schema (`STATUS_DO_PEDIDO`) e do CHECK do banco
    // (`commercial_orders_status_valido`, migration 0302).
    const aceitos = new Set<string>(STATUS_DO_PEDIDO);
    for (const [origem, status] of Object.entries(STATUS)) {
      expect(aceitos.has(status), `${origem} → ${status}`).toBe(true);
    }
  });
});
