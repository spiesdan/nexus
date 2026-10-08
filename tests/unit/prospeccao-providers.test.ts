import { afterEach, describe, expect, it, vi } from "vitest";

import { MapsBrowserProvider } from "@/lib/prospeccao/providers/browser";
import { GooglePlacesProvider } from "@/lib/prospeccao/providers/google-places";
import {
  ESPELHOS_RESERVA,
  OSMOverpassProvider,
  seletoresPara,
} from "@/lib/prospeccao/providers/osm";
import { criarProvider, METADADOS_PROVIDERS } from "@/lib/prospeccao/providers/registro";

/**
 * OS PROVIDERS — cerca do plano §§1–3.
 * Rede sempre mockada: teste que chama o Google de verdade é incidente de
 * faturamento, não teste.
 */
function mockFetchOnce(corpo: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(corpo),
      text: () => Promise.resolve(JSON.stringify(corpo)),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GooglePlacesProvider", () => {
  it("recusa nascer sem chave (falha nomeando a config)", () => {
    expect(() => new GooglePlacesProvider("")).toThrowError("sem_chave");
  });

  it("search mapeia places e conta requisições", async () => {
    mockFetchOnce({
      places: [
        {
          id: "place-1",
          displayName: { text: "Oficina São José" },
          formattedAddress: "Rua A, 100, Canoinhas - SC",
          internationalPhoneNumber: "+55 47 99999-9999",
          websiteUri: "https://www.oficina.com.br/",
          rating: 4.5,
          userRatingCount: 120,
          types: ["car_repair", "store"],
          location: { latitude: -26.17, longitude: -50.32 },
        },
      ],
    });
    const p = new GooglePlacesProvider("chave");
    const r = await p.search({
      categoria: "Oficina mecânica",
      latitude: -26.17,
      longitude: -50.32,
      raioMetros: 5000,
      limite: 20,
    });
    expect(r.negocios).toHaveLength(1);
    expect(r.negocios[0]).toMatchObject({
      idExterno: "place-1",
      telefone: "+55 47 99999-9999",
      totalAvaliacoes: 120,
    });
    expect(r.requisicoes).toBe(1);
    expect(r.detalhes).toBe(0);
  });

  it("429 tenta de novo (backoff), depois desiste nomeando", async () => {
    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        chamadas++;
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("quota"),
        });
      }),
    );
    const p = new GooglePlacesProvider("chave", { tentativas: 2 });
    await expect(
      p.search({ categoria: "X", latitude: 0, longitude: 0, raioMetros: 1000, limite: 5 }),
    ).rejects.toThrowError("google_429");
    expect(chamadas).toBe(2);
  });

  it("getDetails devolve null quando o lugar sumiu", async () => {
    mockFetchOnce({});
    const p = new GooglePlacesProvider("chave");
    expect(await p.getDetails("fantasma")).toBeNull();
  });
});

describe("MapsBrowserProvider", () => {
  it("desligado por padrão, e recusar é erro nomeado", async () => {
    const p = new MapsBrowserProvider();
    await expect(
      p.search({ categoria: "x", latitude: 0, longitude: 0, raioMetros: 1, limite: 1 }),
    ).rejects.toThrowError("nao_implementado");
  });
});

describe("criarProvider", () => {
  it("resolve pelos nomes conhecidos e recusa o resto", () => {
    expect(criarProvider("google_places", { chaveGoogle: "k" }).nome).toBe("google_places");
    expect(criarProvider("osm_overpass").nome).toBe("osm_overpass");
    expect(criarProvider("maps_browser").nome).toBe("maps_browser");
    expect(() => criarProvider("bing")).toThrowError("provider_desconhecido");
  });

  it("metadados sem CAMPO de segredo para a tela", () => {
    // A forma, não a prosa: "requer chave" no texto é instrução; campo
    // `apiKey`/`secret` seria vazamento. Só nome/rotulo/descricao viajam.
    for (const m of METADADOS_PROVIDERS) {
      expect(Object.keys(m).sort()).toEqual(["descricao", "nome", "rotulo"]);
    }
    expect(METADADOS_PROVIDERS.map((m) => m.nome).sort()).toEqual([
      "google_places",
      "osm_overpass",
    ]);
  });
});

describe("OSMOverpassProvider", () => {
  it("mapeia categoria comercial para tags OSM", () => {
    expect(seletoresPara("Oficina mecânica").seletores).toContain('["shop"="car_repair"]');
    expect(seletoresPara("Farmácia").seletores).toContain('["amenity"="pharmacy"]');
    expect(seletoresPara("coisa que não existe").aproximado).toBe(true);
  });

  it("mapeia elementos em negócios e conta 1 requisição", async () => {
    mockFetchOnce({
      elements: [
        {
          type: "node",
          id: 1,
          lat: -26.17,
          lon: -50.32,
          tags: {
            name: "Oficina Teste",
            "contact:phone": "(47) 99999-9999",
            "contact:website": "oficina.com.br",
            "addr:city": "Canoinhas",
            "addr:state": "SC",
          },
        },
        { type: "node", id: 2, lat: 0, lon: 0, tags: {} },
      ],
    });
    const p = new OSMOverpassProvider();
    const r = await p.search({
      categoria: "Oficina mecânica",
      latitude: -26.17,
      longitude: -50.32,
      raioMetros: 5000,
      limite: 20,
    });
    // Sem nome não entra (não há o que deduplicar nem mostrar).
    expect(r.negocios).toHaveLength(1);
    expect(r.negocios[0]).toMatchObject({
      idExterno: "osm:node/1",
      telefone: "(47) 99999-9999",
      cidade: "Canoinhas",
    });
    expect(r.requisicoes).toBe(1);
    expect(r.detalhes).toBe(0);
  });

  it("getDetails não existe aqui (tudo vem na busca)", async () => {
    const p = new OSMOverpassProvider();
    expect(await p.getDetails("osm:node/1")).toBeNull();
  });

  /**
   * Cota do espelho público é a falha real de produção: o 429 chega com
   * `Retry-After` e a célula só não queima se a espera for longa o bastante.
   * Relógio fake porque a espera certa é de segundos — dormir de verdade
   * aqui deixaria a suíte lenta e ainda provaria pouco.
   */
  it("429 espera o Retry-After do espelho e insiste até dar certo", async () => {
    vi.useFakeTimers();
    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        chamadas++;
        if (chamadas === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: new Headers({ "Retry-After": "2" }),
            json: () => Promise.resolve({}),
            text: () => Promise.resolve("<html>rate limit</html>"),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () =>
            Promise.resolve({
              elements: [
                { type: "node", id: 7, lat: -26.17, lon: -50.32, tags: { name: "Oficina Vale" } },
              ],
            }),
          text: () => Promise.resolve("{}"),
        });
      }),
    );
    try {
      const p = new OSMOverpassProvider();
      const pendente = p.search({
        categoria: "Oficina mecânica",
        latitude: -26.17,
        longitude: -50.32,
        raioMetros: 5000,
        limite: 20,
      });
      await vi.advanceTimersByTimeAsync(60000);
      const r = await pendente;
      expect(chamadas).toBe(2);
      expect(r.negocios).toHaveLength(1);
      expect(r.requisicoes).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("429 persistente desiste com erro nomeado, sem despejar o HTML do espelho", async () => {
    vi.useFakeTimers();
    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        chamadas++;
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "1" }),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("<html>".repeat(80)),
        });
      }),
    );
    try {
      const p = new OSMOverpassProvider({ tentativas: 2 });
      const pendente = p.search({
        categoria: "X",
        latitude: 0,
        longitude: 0,
        raioMetros: 1000,
        limite: 5,
      });
      const rejeitada = expect(pendente).rejects.toThrowError(/^overpass_429:/);
      await vi.advanceTimersByTimeAsync(60000);
      await rejeitada;
      expect(chamadas).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resposta de recusa sem headers não quebra a leitura do Retry-After", async () => {
    vi.useFakeTimers();
    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        chamadas++;
        // Mock sem `headers` nenhum: o backoff tem que cair no default sem
        // estourar TypeError em cima do erro original.
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("busy"),
        });
      }),
    );
    try {
      const p = new OSMOverpassProvider({ tentativas: 2 });
      const pendente = p.search({
        categoria: "X",
        latitude: 0,
        longitude: 0,
        raioMetros: 1000,
        limite: 5,
      });
      const rejeitada = expect(pendente).rejects.toThrowError("overpass_503");
      await vi.advanceTimersByTimeAsync(60000);
      await rejeitada;
      // QUATRO chamadas, e não duas — a mudança é o ponto deste teste.
      //
      // Antes, um 503 repetia no MESMO espelho até as tentativas acabarem. Medido
      // em 08/10/2026, daqui da VPS: o oficial devolvia 406, o reserva kumi
      // devolvia 500, e um terceiro espelho respondia 200 com dados válidos —
      // e nunca era alcançado, porque a repetição acontecia antes da troca.
      // A prospecção morria em "Progresso 0% · Encontradas 0" sem erro visível.
      //
      // Agora 5xx percorre os espelhos: 2 tentativas no oficial, depois 2 no
      // reserva. São 3 espelhos na lista, o terceiro não é alcançado porque
      // `tentativas` já acabou — e o `fetch` de todo mock devolve 503, então o
      // último também falha e a promise rejeita.
      expect(chamadas).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A lista de espelhos do Overpass é uma MEDIÇÃO, e ela envelhece.
 *
 * Em 08/10/2026 a prospecção parou nesta instalação: o oficial devolvia 406 para
 * o egress da VPS, o reserva devolvia 500, e a busca ficava presa em
 * "Progresso 0% · Encontradas 0" — sem erro na tela, porque o painel só conta
 * erro de busca, não de infraestrutura.
 *
 * Este teste não valida a rede (unitário não sai da máquina). Ele trava a
 * PROPRIEDADE que faltava: havendo um espelho que responde, a busca tem de
 * alcançá-lo. É a propriedade que o comportamento antigo quebrava — repetia no
 * mesmo espelho até desistir, sem nunca tentar o próximo.
 */
it("um 5xx em um espelho leva ao espelho seguinte, em vez de insistir no mesmo", async () => {
  const vistas: string[] = [];
  const statusPorUrl: Record<string, number> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      vistas.push(String(url));
      // O oficial está com 5xx, o reserva responde bem — a situação real
      // medida, que o comportamento antigo não resolvia.
      const status = statusPorUrl[String(url)] ?? 500;
      return Promise.resolve({
        ok: status === 200,
        status,
        headers: new Headers(),
        json: () => Promise.resolve({ elements: [] }),
        text: () => Promise.resolve(""),
      });
    }),
  );
  // O espelho oficial é o que o provider usa por padrão; os reservas saem da
  // lista real. Todos os reservas respondem bem, para o teste não depender de
  // qual espelho ocupa a segunda vaga.
  const oficial = "https://overpass-api.de/api/interpreter";
  statusPorUrl[oficial] = 500;
  for (const u of ESPELHOS_RESERVA) statusPorUrl[u] = 200;

  try {
    const p = new OSMOverpassProvider({ tentativas: 2 });
    const r = await p.search({
      categoria: "X",
      latitude: 0,
      longitude: 0,
      raioMetros: 1000,
      limite: 5,
    });
    expect(r).toBeTruthy();
    expect(
      vistas.length,
      `a busca não saiu do espelho quebrado (foi a ${vistas.length}x)`,
    ).toBeGreaterThan(1);
    expect(new Set(vistas).size, "só um espelho foi tentado").toBeGreaterThan(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
