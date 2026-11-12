import { describe, expect, it } from "vitest";

import { formatarDistancia, formatarDuracao, haversineM, ordemCompleta, ordenarPorMenorTrajeto, vizinhoMaisProximo } from "./roteamento";

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

  it("menor trajeto começa na base e segue para a mais próxima da anterior", () => {
    const ordem = ordenarPorMenorTrajeto(
      [
        { lat: 0, lng: 0 },
        { lat: 10, lng: 0 },
        { lat: 1, lng: 0 },
        { lat: 5, lng: 0 },
      ],
      false,
    );
    expect(ordem[0]).toBe(0);
    expect(ordem).toEqual([0, 2, 3, 1]);
  });

  it("não manda atravessar a cidade no meio do trajeto (carga 039)", () => {
    // Coordenadas reais das 7 paradas da carga 039 em 12/11/2026. A ordem
    // radial antiga (do mais perto da base ao mais longe) produzia
    // PRIME → BRTECH = 3,0 km para o outro lado da cidade, no meio do
    // trajeto — o dono da loja viu isso no mapa.
    const base = { lat: -26.1820327, lng: -50.4083284 };
    const paradas: Record<string, { lat: number; lng: number }> = {
      vitins: { lat: -26.1694877, lng: -50.3960594 },
      brtech: { lat: -26.1626975, lng: -50.410193 },
      pape: { lat: -26.1789177, lng: -50.3738614 },
      camila: { lat: -26.1776013, lng: -50.3863881 },
      schiessl: { lat: -26.1830479, lng: -50.3883867 },
      lanchonete: { lat: -26.1665696, lng: -50.4031839 },
      prime: { lat: -26.1809897, lng: -50.388097 },
    };
    const nomes = Object.keys(paradas);
    const pontos = [base, ...nomes.map((n) => paradas[n]!)];
    const ordem = ordenarPorMenorTrajeto(pontos, false);

    expect(ordem[0]).toBe(0);
    expect(new Set(ordem).size).toBe(pontos.length);

    let total = 0;
    for (let i = 1; i < ordem.length; i++) {
      const trecho = haversineM(pontos[ordem[i - 1]!]!, pontos[ordem[i]!]!);
      // Nenhum trecho passa de 2,2 km — a perna mais longa é a saída da base
      // (base → BRTECH, 2,16 km). É o tamanho de meia cidade em Canoinhas; o
      // radial antigo dava 3,0 km PARA O OUTRO LADO no meio do trajeto (4→5).
      expect(trecho).toBeLessThan(2200);
      total += trecho;
    }
    // O radial antigo somava 11,65 km entre paradas; o 2-opt fecha em 7,25 km.
    expect(total).toBeLessThan(8000);
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
