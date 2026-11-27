import { describe, expect, it, vi } from "vitest";

import {
  lerRespostaDoScraper,
  mapearLinhaScraper,
  MapsBrowserProvider,
} from "./browser";

/**
 * O contrato do sidecar foi medido em 27/11/2026 (CONTRATO-CAMPOS.md):
 * - JSONL é um ARRAY por linha, não um negócio por linha;
 * - site é `web_site` no JSON e `website` no CSV;
 * - `complete_address` é OBJETO no JSON (state por extenso);
 * - `review_rating`/`review_count`/`open_hours`/`link`;
 * - `cid` é string de 19 dígitos (não converter para number);
 * - fast mode não traz e-mail nem texto de review.
 */

function resposta(status: number, corpo: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    text: async () => corpo,
    json: async () => JSON.parse(corpo) as unknown,
  } as unknown as Response;
}

const LINHA = {
  place_id: "ChIJ1234567890",
  cid: "1234567890123456789",
  title: "Oficina do Zé | Canoinhas",
  category: "Oficina mecânica",
  categories: ["Oficina mecânica", "Auto peças"],
  address: "Rua das Flores, 123 - Centro, Canoinhas - SC, 89460-000",
  complete_address: {
    street: "Rua das Flores, 123",
    borough: "Centro",
    city: "Canoinhas",
    state: "Santa Catarina",
    postal_code: "89460-000",
    country: "Brasil",
  },
  phone: "(47) 99999-9999",
  web_site: "https://oficinadoze.com.br",
  review_rating: 4.7,
  review_count: 123,
  latitude: -26.1772,
  longitude: -50.39,
  link: "https://www.google.com/maps/search/?api=1&query_place_id=ChIJ1234567890",
  open_hours: { segunda: ["08:00-18:00"] },
};

describe("mapearLinhaScraper", () => {
  it("extrai os 13 campos, achata categorias e lê complete_address objeto", () => {
    const n = mapearLinhaScraper(LINHA)!;
    expect(n.idExterno).toBe("maps:ChIJ1234567890");
    expect(n.placeId).toBe("ChIJ1234567890");
    expect(n.cid).toBe("1234567890123456789");
    expect(n.provider).toBe("maps_browser");
    expect(n.nome).toBe("Oficina do Zé | Canoinhas");
    expect(n.categoriaPrincipal).toBe("Oficina mecânica");
    expect(n.categoriasSecundarias).toEqual(["Auto peças"]);
    expect(n.telefone).toBe("(47) 99999-9999");
    expect(n.website).toBe("https://oficinadoze.com.br");
    expect(n.endereco).toContain("Rua das Flores");
    expect(n.logradouro).toBe("Rua das Flores, 123");
    expect(n.bairro).toBe("Centro");
    expect(n.cidade).toBe("Canoinhas");
    expect(n.estado).toBe("SC");
    expect(n.cep).toBe("89460-000");
    expect(n.latitude).toBeCloseTo(-26.1772);
    expect(n.longitude).toBeCloseTo(-50.39);
    expect(n.urlExterna).toContain("query_place_id=ChIJ1234567890");
    expect(n.nota).toBe(4.7);
    expect(n.totalAvaliacoes).toBe(123);
    expect(n.horarioFuncionamento).toEqual({ segunda: ["08:00-18:00"] });
    expect(n.email).toBeNull();
  });

  it("prospect sem site e sem telefone ainda é válido", () => {
    const n = mapearLinhaScraper({ ...LINHA, web_site: null, phone: "" })!;
    expect(n.nome).toBeTruthy();
    expect(n.website).toBeNull();
    expect(n.telefone).toBeNull();
  });

  it("aceita a grafia errada `longtitude` que o JSON do scraper traz", () => {
    const n = mapearLinhaScraper({ ...LINHA, longitude: undefined, longtitude: -50.4 })!;
    expect(n.longitude).toBeCloseTo(-50.4);
  });

  it("linha sem nome não vira negócio", () => {
    expect(mapearLinhaScraper({ place_id: "x" })).toBeNull();
  });
});

describe("lerRespostaDoScraper", () => {
  it("JSONL: UMA LINHA = UM ARRAY de negócios (o README diz o contrário)", () => {
    const corpo = [
      JSON.stringify([LINHA, { ...LINHA, place_id: "ChIJ2", cid: "2", title: "Outra" }]),
      JSON.stringify([{ ...LINHA, place_id: "ChIJ3", cid: "3", title: "Terceira" }]),
    ].join("\n");
    const negocios = lerRespostaDoScraper(corpo);
    expect(negocios.map((n) => n.nome)).toEqual([
      "Oficina do Zé | Canoinhas",
      "Outra",
      "Terceira",
    ]);
  });

  it("aceita também um JSON array de lote inteiro", () => {
    const negocios = lerRespostaDoScraper(JSON.stringify([LINHA]));
    expect(negocios).toHaveLength(1);
  });

  it("linha inválida derruba o lote inteiro (nada de parcial silencioso)", () => {
    const corpo = `${JSON.stringify([LINHA])}\nnao-e-json`;
    expect(() => lerRespostaDoScraper(corpo)).toThrow(/maps_browser_json_invalido/);
  });
});

function provider(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return new MapsBrowserProvider({
    habilitado: true,
    baseUrl: "http://sidecar:8080",
    fetchImpl,
    dormir: async () => undefined,
    ...extra,
  });
}

const PARAMS = {
  categoria: "Oficina mecânica",
  latitude: -26.1772,
  longitude: -50.39,
  raioMetros: 8000,
  limite: 20,
};

describe("MapsBrowserProvider (HTTP)", () => {
  it("manda fast_mode=true e devolve o JSONL achatado", async () => {
    const fetchImpl = vi.fn(async () => resposta(200, JSON.stringify([LINHA]))) as unknown as typeof fetch;
    const p = provider(fetchImpl);
    const r = await p.search(PARAMS);

    expect(r.negocios).toHaveLength(1);
    expect(r.requisicoes).toBe(1);
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const enviado = JSON.parse(String((init as RequestInit).body));
    expect(enviado).toMatchObject({
      keyword: "Oficina mecânica",
      limit: 20,
      fast_mode: true,
      radius_m: 8000,
    });
  });

  it("repete em 503 e aceita o sucesso seguinte", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(resposta(503, "indisponivel"))
      .mockResolvedValueOnce(resposta(200, JSON.stringify([LINHA]))) as unknown as typeof fetch;
    const r = await provider(fetchImpl).search(PARAMS);
    expect(r.negocios).toHaveLength(1);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("400 de entrada não repete", async () => {
    const fetchImpl = vi.fn(async () => resposta(400, "termo invalido")) as unknown as typeof fetch;
    await expect(provider(fetchImpl).search(PARAMS)).rejects.toThrow(/maps_browser_400/);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("sem URL configurada falha com motivo nomeado", async () => {
    const p = new MapsBrowserProvider({ habilitado: true, baseUrl: "" });
    await expect(p.search(PARAMS)).rejects.toThrow(/maps_browser_sem_url/);
  });

  it("desligado falha com motivo nomeado", async () => {
    const p = new MapsBrowserProvider({ habilitado: false, baseUrl: "http://sidecar:8080" });
    await expect(p.search(PARAMS)).rejects.toThrow(/maps_browser_desligado/);
  });

  it("getDetails devolve null (o payload de busca já tem os campos)", async () => {
    expect(await provider(vi.fn() as unknown as typeof fetch).getDetails("x")).toBeNull();
  });
});
