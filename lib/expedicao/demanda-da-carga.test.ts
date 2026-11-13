/**
 * A CONTA ÚNICA da demanda da carga.
 *
 * O VRPTW e a confirmação da distribuição usam ESTA função. Duas fórmulas foi
 * como a capacidade passou a medir a coisa errada uma vez. O que não pode
 * voltar: produto sem peso/volume virar zero silencioso — a parada fica SEM o
 * dado e quem chama declara a restrição como não aplicada.
 */
import { describe, expect, it } from "vitest";

import { demandasPorParada } from "./demanda-da-carga";
import type { ItemDaCargaParaParada, ParadaDaRota } from "@/lib/rotas/paradas";

function parada(chave: string, shipmentOrders: string[]): ParadaDaRota {
  return {
    chave,
    contact_id: null,
    cliente: chave,
    fone: null,
    endereco: null,
    latitude: null,
    longitude: null,
    geo_status: "pendente",
    geo_fonte: null,
    pedidos: shipmentOrders.map((id) => ({
      shipment_order_id: id,
      order_id: `o-${id}`,
      numero: 1,
      total_cents: 0,
      status: "ativo",
    })),
    itens: [],
    total_cents: 0,
    janela_inicio: null,
    janela_fim: null,
    janela_conflito: false,
    veiculo_id: null,
    motorista_id: null,
    sequencia_veiculo: null,
  };
}

function item(
  shipmentOrderId: string,
  produtos: { quantidade: number; peso: number | null; volume: number | null }[],
): ItemDaCargaParaParada {
  return {
    shipment_order_id: shipmentOrderId,
    order_id: `o-${shipmentOrderId}`,
    sequencia: 1,
    status: "na_carga",
    numero: 1,
    cliente_nome: "Cliente",
    contact_id: null,
    contato_nome: null,
    fone: null,
    endereco_entrega: null,
    latitude: null,
    longitude: null,
    geo_status: "pendente",
    geo_fonte: null,
    total_cents: 0,
    itens: produtos.map((p, i) => ({
      codigo: `P${i}`,
      nome: `P${i}`,
      quantidade: p.quantidade,
      peso_unit_kg: p.peso,
      volume_unit_m3: p.volume,
    })),
  };
}

describe("demandasPorParada", () => {
  it("multiplica quantidade × peso/volume do cadastro", () => {
    const demanda = demandasPorParada(
      [item("so1", [{ quantidade: 3, peso: 2.5, volume: 0.4 }])],
      [parada("c1", ["so1"])],
    );
    expect(demanda.get("c1")).toEqual({
      peso_kg: 7.5,
      volume_m3: 1.2,
      semPeso: false,
      semVolume: false,
    });
  });

  it("soma os pedidos que caem no mesmo destino", () => {
    const demanda = demandasPorParada(
      [
        item("so1", [{ quantidade: 1, peso: 10, volume: 0.1 }]),
        item("so2", [{ quantidade: 2, peso: 5, volume: 0.2 }]),
      ],
      [parada("c1", ["so1", "so2"])],
    );
    expect(demanda.get("c1")?.peso_kg).toBe(20);
    expect(demanda.get("c1")?.volume_m3).toBe(0.5);
  });

  it("produto sem peso marca a parada e NÃO soma zero fingido", () => {
    const demanda = demandasPorParada(
      [item("so1", [
        { quantidade: 1, peso: 10, volume: 0.1 },
        { quantidade: 5, peso: null, volume: null },
      ])],
      [parada("c1", ["so1"])],
    );
    expect(demanda.get("c1")).toMatchObject({
      peso_kg: 10,
      volume_m3: 0.1,
      semPeso: true,
      semVolume: true,
    });
  });

  it("parada sem item conhecido existe com demanda zero e sem marca de erro", () => {
    const demanda = demandasPorParada([], [parada("c1", ["so1"])]);
    expect(demanda.get("c1")).toEqual({
      peso_kg: 0,
      volume_m3: 0,
      semPeso: false,
      semVolume: false,
    });
  });

  it("arredonda sem acumular erro de ponto flutuante", () => {
    const demanda = demandasPorParada(
      [item("so1", [{ quantidade: 3, peso: 0.1, volume: 0.1 }])],
      [parada("c1", ["so1"])],
    );
    expect(demanda.get("c1")?.peso_kg).toBe(0.3);
    expect(demanda.get("c1")?.volume_m3).toBe(0.3);
  });
});
