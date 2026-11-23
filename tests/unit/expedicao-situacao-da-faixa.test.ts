/**
 * A FAIXA DE SITUAÇÃO NÃO PODE SOMAR DUAS VEZES.
 *
 * Auditoria 71/72: `Concluídas · 1 parada na rua` (paradas de carga em rota
 * postas no cartão de concluídas) e `Aguardando embarque 141` contando pedidos
 * que JÁ estavam em uma carga. O dono lê essa faixa para decidir o dia — número
 * duplicado é erro de dado na cara do usuário.
 *
 * O fixture abaixo é propositalmente ambíguo: um pedido elegível (`aprovado`)
 * que já está em uma carga `montando`. Ele só pode aparecer em UMA célula.
 */
import { describe, expect, it } from "vitest";

import { calcularSituacaoDaExpedicao } from "@/lib/expedicao/situacao-da-expedicao";

const cargas = [
  { id: "carga-rota", status: "em_rota" },
  { id: "carga-montando", status: "montando" },
  { id: "carga-concluida", status: "concluida" },
  { id: "carga-cancelada", status: "cancelada" },
];

const itens = [
  { shipment_id: "carga-rota", order_id: "p3" },
  { shipment_id: "carga-montando", order_id: "p2" }, // ← ambíguo: aprovado E embarcado
  { shipment_id: "carga-concluida", order_id: "p4" },
  { shipment_id: "carga-cancelada", order_id: "p5" }, // ← volta para a fila
];

const pedidosElegiveis = [
  { id: "p1", total_cents: 1000 }, // só na fila
  { id: "p2", total_cents: 2000 }, // ALSO em carga montando — não pode contar aqui
  { id: "p3", total_cents: 3000 }, // ALSO em carga em rota
  { id: "p5", total_cents: 5000 }, // carga cancelada → elegível de novo
];

const situacao = calcularSituacaoDaExpedicao({ cargas, itens, pedidosElegiveis });

describe("faixa de situação da expedição", () => {
  it("soma das quatro células = total de pedidos elegíveis", () => {
    const soma =
      situacao.pedidos.naRua +
      situacao.pedidos.montando +
      situacao.pedidos.concluidas +
      situacao.pedidos.aguardando;
    expect(soma).toBe(situacao.totalDePedidos);
    expect(soma).toBe(5);
  });

  it("um pedido em estado ambíguo aparece em UMA célula, não em duas", () => {
    expect(situacao.situacaoPorPedido["p2"]).toBe("montando");
    expect(situacao.pedidos.montando).toBe(1);
    expect(situacao.pedidos.aguardando).toBe(2); // p1 e p5, não p2/p3
    // Chaves únicas: contar por Map, nunca somar listas que se sobrepõem.
    expect(Object.keys(situacao.situacaoPorPedido)).toHaveLength(5);
  });

  it("a célula de concluídas não usa paradas de carga em rota", () => {
    expect(situacao.situacaoPorPedido["p4"]).toBe("concluidas");
    expect(situacao.situacaoPorPedido["p3"]).toBe("na_rua");
    expect(situacao.pedidos.concluidas).toBe(1);
    expect(situacao.pedidos.naRua).toBe(1);
  });

  it("o valor da faixa vem só de quem espera embarque", () => {
    expect(situacao.valorAguardandoCents).toBe(1000 + 5000);
  });

  it("carga cancelada devolve o pedido para a fila em vez de perdê-lo", () => {
    expect(situacao.situacaoPorPedido["p5"]).toBe("aguardando");
    expect(situacao.cargas.concluidas).toBe(1);
  });

  it("lista vazia não inventa número", () => {
    const vazia = calcularSituacaoDaExpedicao({ cargas: [], itens: [], pedidosElegiveis: [] });
    expect(vazia.totalDePedidos).toBe(0);
    expect(vazia.valorAguardandoCents).toBe(0);
  });
});
