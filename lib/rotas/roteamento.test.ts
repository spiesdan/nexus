import { describe, expect, it } from "vitest";

import { formatarDistancia, formatarDuracao, haversineM, ordemCompleta, ordenarPorDistanciaDaOrigem, vizinhoMaisProximo } from "./roteamento";

describe("roteamento", () => {
  it("haversine mede Canoinhas–Três Barras na ordem de grandeza certa", () => {
    const m = haversineM({ lat: -26.1775, lng: -50.3907 }, { lat: -26.1066, lng: -50.3216 });
    expect(m).toBeGreaterThan(8000);
    expect(m).toBeLessThan(15000);
  });

  it("vizinho-mais-próximo fixa a origem e visita todos uma vez", () => {
    const ordem = vizinhoMaisProximo(
      [
        { lat: 0, lng: 0 },
        { lat: 10, lng: 0 },
        { lat: 1, lng: 0 },
      ],
      false,
    );
    expect(ordem).toEqual([0, 2, 1]);
  });

  it("retornar fecha o ciclo na origem", () => {
    const ordem = vizinhoMaisProximo(
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 0 },
      ],
      true,
    );
    expect(ordem).toEqual([0, 1, 0]);
  });

  it("radial: do mais perto ao mais longe da base", () => {
    const ordem = ordenarPorDistanciaDaOrigem(
      [
        { lat: 0, lng: 0 },
        { lat: 10, lng: 0 },
        { lat: 1, lng: 0 },
        { lat: 5, lng: 0 },
      ],
      false,
    );
    expect(ordem).toEqual([0, 2, 3, 1]);
  });

  it("fala como gente: km e horas", () => {
    expect(formatarDistancia(42800)).toBe("42,8 km");
    expect(formatarDistancia(800)).toBe("800 m");
    expect(formatarDuracao(5520)).toBe("1h32");
    expect(formatarDuracao(480)).toBe("8 min");
  });

  it("a ordem proposta cobre TODAS as paradas — o PATCH recusa lista parcial", () => {
    // Medido na carga 22: 21 de 22 paradas com coordenada. Sem as que ficaram
    // sem mapa, a lista sumia com ela na tela e o "Salvar ordem" respondia
    // "a ordem precisa cobrir todas as paradas exatamente uma vez".
    const ordem = ordemCompleta(["a", "b"], ["c", "d"]);
    expect(ordem).toEqual(["a", "b", "c", "d"]);
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  it("chave repetida entre as duas listas não duplica a parada", () => {
    // O servidor promete não repetir, mas duplicar aqui significaria uma
    // parada contada duas vezes na sequência gravada.
    expect(ordemCompleta(["a", "b"], ["b"])).toEqual(["a", "b"]);
    expect(ordemCompleta([], ["a", "b"])).toEqual(["a", "b"]);
  });
});
