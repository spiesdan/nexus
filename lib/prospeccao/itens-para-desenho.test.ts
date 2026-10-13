/**
 * `itensParaDesenho` — qual clusterização o mapa usa em cada modo.
 *
 * ─── A mutação que este arquivo existe para reprovar ──────────────────────
 *
 * O defeito era as DUAS clusterizações rodando juntas no modo "marcadores":
 *
 *   lista (4.734 pontos)
 *     → `clusterizar` (grade por zoom)        ~300 "marcadores" falsos
 *       → `markerClusterGroup` do Leaflet     agregado de ~300 unidades
 *
 * Cada "marcador falso" entrava no cluster do Leaflet como se fosse UMA
 * empresa. O agregado contava células, não empresas — a tela mentia sem
 * quebrar build nem tipo. Por isso o teste abaixo não é sobre o desenho: é
 * sobre **qual lista chega ao desenho**.
 *
 * Para provar que o teste tem dente: troque a linha
 *
 *   return modo === "densidade" ? clusterizar(pontos, zoom) : pontos;
 *
 * por `return clusterizar(pontos, zoom);` e `itensParaDesenho nao agrupa no
 * modo marcadores` falha. Verificado.
 */
import { describe, expect, it } from "vitest";

import {
  clusterizar,
  ehCluster,
  itensParaDesenho,
  type PontoGeo,
} from "@/lib/prospeccao/geo";

/** `n` pontos colados numa mesma célula de grade — é o que o scraper entrega
 *  de verdade: várias empresas na mesma rua, coordenadas quase iguais. */
function colados(n: number, prefixo = "p"): PontoGeo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefixo}${i}`,
    latitude: -26.17 + i * 1e-6,
    longitude: -50.39 + i * 1e-6,
  }));
}

describe("itensParaDesenho", () => {
  it("nao agrupa no modo marcadores — quem agrupa e o Leaflet", () => {
    const lista = colados(500);

    const itens = itensParaDesenho(lista, "marcadores", 12);

    // Nenhum agregado: os 500 pontos chegam crus para o `markerClusterGroup`.
    expect(itens.every((i) => !ehCluster(i))).toBe(true);
    expect(itens).toHaveLength(500);
  });

  it("nao agrupa no modo marcadores MESMO com zoom que faria a grade agrupar", () => {
    const lista = colados(500);
    // Prova de que o modo decide, e não o zoom: no zoom 12 a `clusterizar`
    // sozinho reduziria 500 pontos a 1 célula.
    expect(clusterizar(lista, 12)).toHaveLength(1);

    expect(itensParaDesenho(lista, "marcadores", 12)).toHaveLength(500);
  });

  it("agrupa no modo densidade — o circulo precisa do agregado por grade", () => {
    const itens = itensParaDesenho(colados(500), "densidade", 12);

    expect(itens).toHaveLength(1);
    expect(itens.length).toBeGreaterThan(0);
    const c = itens[0];
    expect(c !== undefined && ehCluster(c) && c.pontos).toHaveLength(500);
  });

  it("devolve a mesma lista no modo marcadores, sem clonar", () => {
    const lista = colados(3);
    // `===` e o que garante que o desenho recebe exatamente os pontos da tela
    // — um `.map()` defensivo aqui custaria 4.734 objetos a cada busca.
    expect(itensParaDesenho(lista, "marcadores", 12)).toBe(lista);
  });

  it("lista vazia nao quebra nenhum dos dois modos", () => {
    expect(itensParaDesenho([], "marcadores", 12)).toEqual([]);
    expect(itensParaDesenho([], "densidade", 12)).toEqual([]);
  });
});
