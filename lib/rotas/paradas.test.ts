import { describe, expect, it } from "vitest";

import { agruparParadas, type ItemDaCargaParaParada } from "./paradas";

function item(parcial: Partial<ItemDaCargaParaParada> & { order_id: string }): ItemDaCargaParaParada {
  return {
    shipment_order_id: `so-${parcial.order_id}`,
    sequencia: 1,
    status: "na_carga",
    numero: 1000,
    cliente_nome: "Cliente",
    contact_id: null,
    contato_nome: null,
    fone: null,
    endereco_entrega: null,
    latitude: null,
    longitude: null,
    geo_status: "pendente",
    geo_fonte: null,
    total_cents: 100,
    ...parcial,
  };
}

describe("agruparParadas", () => {
  it("dois pedidos do mesmo cliente no mesmo endereço viram uma parada só", () => {
    const paradas = agruparParadas([
      item({ order_id: "a", contact_id: "c1", cliente_nome: "Mercado A", numero: 1021, sequencia: 2, endereco_entrega: "Rua X, 10" }),
      item({ order_id: "b", contact_id: "c1", cliente_nome: "Mercado A", numero: 1028, sequencia: 1, endereco_entrega: "Rua X, 10" }),
    ]);
    expect(paradas).toHaveLength(1);
    expect(paradas[0]?.pedidos.map((p) => p.numero).sort()).toEqual([1021, 1028]);
    expect(paradas[0]?.total_cents).toBe(200);
    expect(paradas[0]?.endereco).toBe("Rua X, 10");
  });

  it("mesmo cliente com endereços diferentes vira destinos diferentes (prompt §8, teste 1)", () => {
    const paradas = agruparParadas([
      item({ order_id: "a", contact_id: "c1", cliente_nome: "Mercado A", numero: 1021, sequencia: 1, endereco_entrega: "Rua X, 100" }),
      item({ order_id: "b", contact_id: "c1", cliente_nome: "Mercado A", numero: 1028, sequencia: 2, endereco_entrega: "Rua X, 500" }),
    ]);
    expect(paradas).toHaveLength(2);
  });

  it("clientes diferentes não se misturam e a ordem inicial é a menor sequência", () => {
    const paradas = agruparParadas([
      item({ order_id: "a", contact_id: "c1", cliente_nome: "A", sequencia: 3 }),
      item({ order_id: "b", contact_id: "c2", cliente_nome: "B", sequencia: 1 }),
    ]);
    expect(paradas.map((p) => p.cliente)).toEqual(["B", "A"]);
  });

  it("avulso agrupa pelo nome normalizado", () => {
    const paradas = agruparParadas([
      item({ order_id: "a", cliente_nome: "João  Silva" }),
      item({ order_id: "b", cliente_nome: "joão silva" }),
    ]);
    expect(paradas).toHaveLength(1);
  });

  it("janela do destino é a INTERSEÇÃO das janelas dos pedidos", () => {
    const paradas = agruparParadas([
      item({
        order_id: "a",
        contact_id: "c1",
        endereco_entrega: "Rua X, 10",
        janela_inicio: "08:00:00",
        janela_fim: "12:00:00",
      }),
      item({
        order_id: "b",
        contact_id: "c1",
        endereco_entrega: "Rua X, 10",
        janela_inicio: "10:00:00",
        janela_fim: "18:00:00",
      }),
    ]);
    expect(paradas).toHaveLength(1);
    expect(paradas[0]?.janela_inicio).toBe("10:00:00");
    expect(paradas[0]?.janela_fim).toBe("12:00:00");
    expect(paradas[0]?.janela_conflito).toBe(false);
  });

  it("janelas que não se cruzam viram conflito declarado e nenhuma janela aplicada", () => {
    const paradas = agruparParadas([
      item({
        order_id: "a",
        contact_id: "c1",
        endereco_entrega: "Rua X, 10",
        janela_inicio: "08:00:00",
        janela_fim: "09:00:00",
      }),
      item({
        order_id: "b",
        contact_id: "c1",
        endereco_entrega: "Rua X, 10",
        janela_inicio: "15:00:00",
        janela_fim: "16:00:00",
      }),
    ]);
    expect(paradas[0]?.janela_conflito).toBe(true);
    expect(paradas[0]?.janela_inicio).toBeNull();
    expect(paradas[0]?.janela_fim).toBeNull();
  });

  it("pedido sem janela não restringe a janela do destino", () => {
    const paradas = agruparParadas([
      item({
        order_id: "a",
        contact_id: "c1",
        endereco_entrega: "Rua X, 10",
        janela_inicio: "08:00:00",
        janela_fim: "12:00:00",
      }),
      item({ order_id: "b", contact_id: "c1", endereco_entrega: "Rua X, 10" }),
    ]);
    expect(paradas[0]?.janela_inicio).toBe("08:00:00");
    expect(paradas[0]?.janela_fim).toBe("12:00:00");
  });

  it("a atribuição da distribuição chega à parada (mesmo destino, mesmo veículo)", () => {
    const paradas = agruparParadas([
      item({
        order_id: "a",
        contact_id: "c1",
        endereco_entrega: "Rua X, 10",
        veiculo_id: "v1",
        motorista_id: "m1",
        sequencia_veiculo: 3,
      }),
      item({ order_id: "b", contact_id: "c1", endereco_entrega: "Rua X, 10" }),
    ]);
    expect(paradas[0]?.veiculo_id).toBe("v1");
    expect(paradas[0]?.motorista_id).toBe("m1");
    expect(paradas[0]?.sequencia_veiculo).toBe(3);
  });

  it("endereço não informado não colapsa com endereço conhecido de destino diferente", () => {
    const paradas = agruparParadas([
      item({ order_id: "a", contact_id: "c1", endereco_entrega: null }),
      item({ order_id: "b", contact_id: "c1", endereco_entrega: "Rua X, 10" }),
    ]);
    expect(paradas).toHaveLength(2);
  });
});
