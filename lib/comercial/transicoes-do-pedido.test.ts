/**
 * A máquina de estados do pedido — o vocabulário Mercos, com a porta do
 * "Marcar como concluído".
 *
 * O que este teste prende: as transições que o produto permite e as que ele
 * passou a recusar. Antes, PATCH de `agent` levava `entregue` de volta para
 * `rascunho` e `cancelado` para `aprovado`; o pedido reabria sem regra.
 */
import { describe, expect, it } from "vitest";

import {
  TRANSICOES_DO_PEDIDO,
  cancelamentoDevolveEstoque,
  podeTransicionar,
} from "@/lib/comercial/transicoes-do-pedido";
import { STATUS_DO_PEDIDO } from "@/lib/schemas/pedidos";

describe("podeTransicionar", () => {
  it("o caminho do Mercos: orçamento → aprovado → concluído", () => {
    expect(podeTransicionar("rascunho", "aprovado")).toBe(true);
    expect(podeTransicionar("aprovado", "concluido")).toBe(true);
  });

  it("o botão 'Marcar como concluído' fecha direto do orçamento e da análise", () => {
    expect(podeTransicionar("rascunho", "concluido")).toBe(true);
    expect(podeTransicionar("em_analise", "concluido")).toBe(true);
  });

  it("não se reabre o que acabou", () => {
    expect(podeTransicionar("entregue", "rascunho")).toBe(false);
    expect(podeTransicionar("cancelado", "aprovado")).toBe(false);
    expect(podeTransicionar("entregue", "cancelado")).toBe(false);
  });

  it("não se pula de faturado para orçamento nem de expedido para aprovado", () => {
    expect(podeTransicionar("faturado", "rascunho")).toBe(false);
    expect(podeTransicionar("expedido", "aprovado")).toBe(false);
  });

  it("cancelar é permitido de qualquer estado em aberto", () => {
    for (const de of ["rascunho", "em_analise", "aprovado", "concluido", "faturado", "expedido"]) {
      expect(podeTransicionar(de, "cancelado"), de).toBe(true);
    }
  });

  it("o mesmo status é sempre aceito (PATCH de campos sem mudar de estado)", () => {
    for (const s of STATUS_DO_PEDIDO) {
      expect(podeTransicionar(s, s), s).toBe(true);
    }
  });

  it("todo status tem uma entrada na máquina — nenhum cai no vazio por engano", () => {
    for (const s of STATUS_DO_PEDIDO) {
      expect(TRANSICOES_DO_PEDIDO[s], s).toBeDefined();
    }
  });
});

describe("cancelamentoDevolveEstoque", () => {
  it("devolve quando a venda já baixou (fora de rascunho)", () => {
    for (const de of ["em_analise", "aprovado", "concluido", "faturado", "expedido"]) {
      expect(cancelamentoDevolveEstoque(de), de).toBe(true);
    }
  });

  it("rascunho nunca baixou; cancelado já devolveu — não devolve duas vezes", () => {
    expect(cancelamentoDevolveEstoque("rascunho")).toBe(false);
    expect(cancelamentoDevolveEstoque("cancelado")).toBe(false);
  });
});
