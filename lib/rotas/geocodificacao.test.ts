import { afterEach, describe, expect, it, vi } from "vitest";

import {
  aceitaResultado,
  classificarResultado,
  consultasDeEmergencia,
  geocodificarComFallback,
  pertenceAoMunicipio,
  type ResultadoGeo,
  expandirAbreviacoes,
  formatarCep,
  limparComplemento,
  montarConsultas,
  normalizarNumero,
  parseLinhaEndereco,
  ruaSemNumeroColado,
  semConectores,
  semHonorifico,
  semTipoVial,
  ritmoDoGeocoderMs,
  urlDoGeocoder,
  variantesDoNome,
} from "./geocodificacao";

/**
 * A STACK GEOGRÁFICA É AUTOHOSPEDÁVEL POR CONFIGURAÇÃO.
 *
 * Decisão registrada em `docs/adr/0002-stack-geografica-osm.md`: Leaflet +
 * OpenStreetMap + Nominatim + OSRM, sem licença paga. Estes testes travam o
 * que faz a troca valer: o endpoint e o ritmo vêm do ambiente, não do código.
 * Sem isso, "apontar para a instância própria" seria editar código-fonte — e
 * a primeira atualização apagaria a edição.
 */
describe("endpoint do geocodificador", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem configuração, usa o Nominatim público", () => {
    vi.stubEnv("GEOCODER_URL", "");
    expect(urlDoGeocoder()).toBe("https://nominatim.openstreetmap.org/search");
  });

  it("instância própria vence o default público", () => {
    vi.stubEnv("GEOCODER_URL", "http://nominatim:8080/search");
    expect(urlDoGeocoder()).toBe("http://nominatim:8080/search");
  });

  it("ritmo padrão respeita a instância pública (1100 ms)", () => {
    vi.stubEnv("GEOCODER_MIN_INTERVALO_MS", "");
    expect(ritmoDoGeocoderMs()).toBe(1100);
  });

  it("instância própria zera a espera artificial", () => {
    vi.stubEnv("GEOCODER_MIN_INTERVALO_MS", "0");
    expect(ritmoDoGeocoderMs()).toBe(0);
  });

  it("valor inválido não zera o ritmo por acidente", () => {
    vi.stubEnv("GEOCODER_MIN_INTERVALO_MS", "depressa");
    expect(ritmoDoGeocoderMs()).toBe(1100);
  });
});

describe("normalização da consulta", () => {
  it("número com texto vira dígitos; SN/KM viram nada", () => {
    expect(normalizarNumero("268 sala03")).toBe("268");
    expect(normalizarNumero("65")).toBe("65");
    expect(normalizarNumero("SN")).toBeNull();
    expect(normalizarNumero("S/N")).toBeNull();
    expect(normalizarNumero("KM 258")).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
  });

  it("expande abreviatura sem comer palavra", () => {
    expect(expandirAbreviacoes("R CEL ALBUQUERQUE")).toBe("Rua Coronel ALBUQUERQUE");
    expect(expandirAbreviacoes("RUA DUQUE DE CAXIAS")).toBe("RUA DUQUE DE CAXIAS");
    expect(expandirAbreviacoes("AV. MIGUEL KOMARCHEWSKI")).toBe("Avenida MIGUEL KOMARCHEWSKI");
    expect(expandirAbreviacoes("AV.GOV.Jorge Lacerda")).toBe("Avenida Governador Jorge Lacerda");
    expect(expandirAbreviacoes("RUA MAL FLORIANO PEIXOTO")).toBe("RUA Marechal FLORIANO PEIXOTO");
  });

  it("complemento sai, endereço fica", () => {
    expect(limparComplemento("268 sala03")).toBe("268");
    expect(limparComplemento("LOJA")).toBe("");
    expect(limparComplemento("RUA X, 10 FUNDOS")).toBe("RUA X, 10");
    expect(limparComplemento("CENTRO")).toBe("CENTRO");
    expect(limparComplemento("CORONEL ALBUQUERQUE, 268 sala03, ATÉ 599/600")).toBe(
      "CORONEL ALBUQUERQUE, 268",
    );
    expect(limparComplemento("R VIDAL RAMOS, 1195, SALA PISO SUPERIOR")).toBe("Rua VIDAL RAMOS, 1195");
    expect(limparComplemento("Avenida dos expedicionários, 1259, antiga panif arco iris")).toBe(
      "Avenida dos expedicionários, 1259",
    );
    expect(limparComplemento("R CAETANO COSTA, 739, SALA 01")).toBe("Rua CAETANO COSTA, 739");
    expect(limparComplemento("AV DOS EXPEDICIONARIOS, 3075, CXPST 91")).toBe(
      "Avenida DOS EXPEDICIONARIOS, 3075",
    );
    expect(limparComplemento("ROD. ANTONIO HEIL, n.177, SALA 116")).toBe("Rodovia ANTONIO HEIL, 177");
    // O separador do Mercos nem sempre é espaço: "SALA: 03;" deixava o ":" do
    // lado do número e envenenava a consulta (PED-19566, Rodovia BR 476).
    expect(limparComplemento("Rodovia BR 476 Km 344, 344, SALA: 03;")).toBe(
      "Rodovia BR 476 Km 344, 344",
    );
    expect(limparComplemento("RUA X, 10, SALA-2")).toBe("RUA X, 10");
  });

  it("número colado no logradouro não duplica", () => {
    expect(ruaSemNumeroColado("RUA OROCIMBO CAETANO DA SILVA, 65", "65")).toBe(
      "RUA OROCIMBO CAETANO DA SILVA",
    );
    expect(ruaSemNumeroColado("RUA X", "10")).toBe("RUA X");
  });

  it("cadeia: exata → sem número (sem repetição)", () => {
    const q = montarConsultas({
      logradouro: "R CEL ALBUQUERQUE",
      numero_end: "268 sala03",
      bairro: "LOJA",
      cidade: "Canoinhas",
      uf: "SC",
    });
    // A rua já sai expandida (limparComplemento expande antes).
    expect(q[0]).toBe("Rua Coronel ALBUQUERQUE, 268, Canoinhas, SC, Brasil");
    expect(q).toContain("Rua Coronel ALBUQUERQUE, Canoinhas, SC, Brasil");
    // "LOJA" não entra em nenhuma fase.
    expect(q.every((x) => !x.includes("LOJA"))).toBe(true);
    expect(new Set(q).size).toBe(q.length);
  });

  it("últimas fases: primeiro trecho e sem UF", () => {
    const q = montarConsultas({
      logradouro: "br 280, 6372, systen som",
      numero_end: "6372",
      bairro: null,
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q).toContain("br 280, Canoinhas, SC, Brasil");
    expect(q[q.length - 1]).toBe("br 280, Canoinhas, Brasil");
  });

  it("letra solta sai, Rua fica", () => {
    expect(limparComplemento("CAMPOS S SALES")).toBe("CAMPOS SALES");
    expect(limparComplemento("R CEL ALBUQUERQUE")).toBe("Rua Coronel ALBUQUERQUE");
    expect(limparComplemento("RUBENS RIBEIRO DA SILVA, 329, LADO ÍMPAR")).toBe(
      "RUBENS RIBEIRO DA SILVA, 329",
    );
    expect(limparComplemento("JOAO CANDIDO FERREIRA 505 NULL")).toBe("JOAO CANDIDO FERREIRA 505");
    expect(limparComplemento("RUBENS RIBEIRO DA SILVA, 837, ***")).toBe("RUBENS RIBEIRO DA SILVA, 837");
  });

  it("tipo trocado no cadastro: tenta sem tipo (com número)", () => {
    expect(semTipoVial("Avenida Rubens Ribeiro da Silva")).toBe("Rubens Ribeiro da Silva");
    expect(semTipoVial("Rua Caetano Costa")).toBe("Caetano Costa");
    expect(semTipoVial("BR 280")).toBe("BR 280");
    const q = montarConsultas({
      logradouro: "AV RUBENS RIBEIRO DA SILVA, 85, SALA 03",
      numero_end: null,
      bairro: "Campo da Água Verde",
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q).toContain("RUBENS RIBEIRO DA SILVA, 85, Campo da Água Verde, Canoinhas, SC, Brasil");
  });

  it("título e conector do cadastro não impedem achar a rua", () => {
    // Medido na carga 039 (12/11/2026): as duas ruas abaixo não existem no OSM
    // com o nome do cadastro, e a cadeia caía no município — pino na Prefeitura.
    expect(semHonorifico("VEREADOR JOAO ALEXANDRINA")).toBe("JOAO ALEXANDRINA");
    expect(semHonorifico("Rua Coronel ALBUQUERQUE")).toBe("Rua Coronel ALBUQUERQUE");
    expect(semConectores("Rua Saulo de Carvalho")).toBe("Rua Saulo Carvalho");
    expect(semConectores("Rua da Paz")).toBe("Rua da Paz");
    expect(variantesDoNome("VEREADOR JOAO ALEXANDRINA")).toEqual([
      "JOAO ALEXANDRINA",
    ]);
    expect(variantesDoNome("Rua Saulo de Carvalho")).toEqual([
      "Rua Saulo Carvalho",
    ]);

    const q = montarConsultas({
      logradouro: "RUA VEREADOR JOAO ALEXANDRINA",
      numero_end: "548",
      bairro: "INDUSTRIAL 1",
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q).toContain("JOAO ALEXANDRINA, Canoinhas, SC, Brasil");

    const q2 = montarConsultas({
      logradouro: "R. Saulo de Carvalho",
      numero_end: "1065",
      bairro: "Sossego",
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q2).toContain("Saulo Carvalho, Canoinhas, SC, Brasil");
  });

  it("sem rua ou sem cidade não consulta", () => {
    expect(montarConsultas({ logradouro: null, cidade: "Canoinhas", uf: "SC" })).toEqual([]);
    expect(montarConsultas({ logradouro: "RUA X", cidade: null, uf: "SC" })).toEqual([]);
  });

  it("faixa DE..A sem lado também é resto de cadastro", () => {
    expect(limparComplemento("BARÃO DO RIO BRANCO, 771, DE 120/121 A 899/900")).toBe(
      "BARÃO DO RIO BRANCO, 771",
    );
    expect(limparComplemento("RUA DOS EXPEDICIONARIOS")).toBe("RUA DOS EXPEDICIONARIOS");
  });

  it("linha do pedido vira partes (avulso também tem cadeia)", () => {
    expect(parseLinhaEndereco("RUA X, 65 — BAIRRO, CIDADE/UF, 89520000")).toEqual({
      logradouro: "RUA X, 65",
      numero_end: null,
      bairro: "BAIRRO",
      cidade: "CIDADE",
      uf: "UF",
    });
    expect(parseLinhaEndereco("RUA X, 65")).toEqual({
      logradouro: "RUA X, 65",
      numero_end: null,
      bairro: null,
      cidade: null,
      uf: null,
    });
  });
});

describe("ponto de emergência (CEP/município)", () => {
  it("formata CEP de 8 dígitos e recusa o resto", () => {
    expect(formatarCep("89520000")).toBe("89520-000");
    expect(formatarCep("89520-000")).toBe("89520-000");
    expect(formatarCep(" 89380 000 ")).toBe("89380-000");
    expect(formatarCep("8952000")).toBeNull();
    expect(formatarCep("")).toBeNull();
    expect(formatarCep(null)).toBeNull();
  });

  it("bairro primeiro; CEP genérico não vira ponto; município por último", () => {
    // O caso do MATERPLAN (carga 027): a estrada rural não existe no OSM.
    // 89380-000 é CEP genérico do município — o centroide pode cair em
    // qualquer distrito, então a consulta de município é mais honesta.
    expect(consultasDeEmergencia({ cidade: "Monte Castelo", uf: "sc", cep: "89380000" })).toEqual([
      "Monte Castelo, SC, Brasil",
    ]);
    // Carga 039: o bairro existe no OSM e é mais preciso que o município.
    expect(
      consultasDeEmergencia({ bairro: "Sossego", cidade: "Canoinhas", uf: "SC", cep: "89460000" }),
    ).toEqual(["Sossego, Canoinhas, SC, Brasil", "Canoinhas, SC, Brasil"]);
    // CEP específico continua valendo como último recurso antes do município.
    expect(
      consultasDeEmergencia({ bairro: "Industrial 1", cidade: "Canoinhas", uf: "SC", cep: "89462514" }),
    ).toEqual([
      "Industrial 1, Canoinhas, SC, Brasil",
      "89462-514, Brasil",
      "Canoinhas, SC, Brasil",
    ]);
  });

  it("sem CEP sobra o município; sem nada não inventa consulta", () => {
    expect(consultasDeEmergencia({ cidade: "Curitibanos", uf: "SC" })).toEqual([
      "Curitibanos, SC, Brasil",
    ]);
    expect(consultasDeEmergencia({ cidade: null, uf: "SC", cep: "89520000" })).toEqual([
      "89520-000, Brasil",
    ]);
    expect(consultasDeEmergencia({})).toEqual([]);
  });
});

describe("classificarResultado", () => {
  it("imóvel com número é precisão de número", () => {
    expect(
      classificarResultado([
        { lat: "-27.1", lon: "-50.2", addresstype: "house", address: { house_number: "10", road: "Rua X" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "numero" });
  });

  it("a mesma rua em todos os candidatos é rua aproximada", () => {
    expect(
      classificarResultado([
        { lat: "-27.1", lon: "-50.2", address: { road: "Rua X", city: "Mafra" } },
        { lat: "-27.2", lon: "-50.3", address: { road: "Rua X", city: "Mafra" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "rua" });
  });

  it("CEP é lugar, não rua: precisão de cidade", () => {
    expect(
      classificarResultado([
        { lat: "-26.46", lon: "-50.22", addresstype: "postcode", address: { postcode: "89380-000" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "cidade" });
  });

  it("bairro é ponto aproximado de bairro, não de cidade", () => {
    expect(
      classificarResultado([
        { lat: "-27.3", lon: "-50.57", addresstype: "suburb", address: { suburb: "Água Santa" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "bairro" });
  });

  it("ruas diferentes na mesma consulta é ambíguo — não escolhe no chute", () => {
    expect(
      classificarResultado([
        { lat: "-27.1", lon: "-50.2", address: { road: "Rua X", city: "Mafra" } },
        { lat: "-27.2", lon: "-50.3", address: { road: "Rua Y", city: "Mafra" } },
      ]),
    ).toMatchObject({ estado: "ambiguo", latitude: null, longitude: null });
  });

  it("lista vazia é não encontrado", () => {
    expect(classificarResultado([])).toMatchObject({ estado: "nao_encontrado" });
    expect(classificarResultado(null)).toMatchObject({ estado: "nao_encontrado" });
  });

  it("coordenadas fora de faixa não viram ponto (lat -90..90, lng -180..180)", () => {
    // Prompt §3/§8 (teste 4): coordenada inválida não é "ok" por não ser null.
    // Antes só se checava finito — um valor fora de faixa entrava como ponto
    // válido e a rota desenhava/motorista ia para lugar nenhum.
    expect(
      classificarResultado([{ lat: "95", lon: "-50.2", addresstype: "house", address: { house_number: "10", road: "Rua X" } }]),
    ).toMatchObject({ estado: "erro", latitude: null, longitude: null });
    expect(
      classificarResultado([{ lat: "-26.4", lon: "200", addresstype: "house", address: { house_number: "10", road: "Rua X" } }]),
    ).toMatchObject({ estado: "erro", latitude: null, longitude: null });
    expect(
      classificarResultado([{ lat: "abc", lon: "-50.2" }]),
    ).toMatchObject({ estado: "erro", latitude: null, longitude: null });
  });
});

describe("aceitaResultado (precisão com número no cadastro)", () => {
  it("com número no cadastro, só imóvel (numero) fecha a fase de rua", () => {
    // Carga 40 (12/11/2026): 19506 e 19542 colapsaram na mesma avenida — com
    // número no cadastro a geometria de rua não é ponto de parada.
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "rua" }, true),
    ).toBe(false);
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "numero" }, true),
    ).toBe(true);
  });

  it("sem número no cadastro, rua aproximada continua aceita", () => {
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "rua" }, false),
    ).toBe(true);
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "bairro" }, false),
    ).toBe(false);
  });

  it("não aceita estados não-ok", () => {
    expect(aceitaResultado({ estado: "nao_encontrado", latitude: null, longitude: null, precisao: null }, false)).toBe(false);
    expect(aceitaResultado({ estado: "ambiguo", latitude: null, longitude: null, precisao: null }, false)).toBe(false);
    expect(aceitaResultado({ estado: "erro", latitude: null, longitude: null, precisao: null }, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// o pino tem que cair no município que o cadastro pediu
// ---------------------------------------------------------------------------

/**
 * O CASO QUE ORIGINOU ESTES TESTES (produção, 2026-11-13).
 *
 * Parada PED-19566: "Rodovia BR 476 Km 344 — centro, Paula Freitas/PR". A rua
 * não existe no OSM com número (o trecho é a "Rodovia do Xisto", geometria de
 * rodovia, que a cadeia recusa por ter número no cadastro). A consulta de
 * emergência do bairro foi `"centro, Paula Freitas, PR, Brasil"` e o Nominatim
 * respondeu **Avenida Brasil, Carapicuíba/SP** — 600 km fora, outro estado.
 * A cadeia aceitava qualquer `estado: "ok"` da emergência, gravou o pino em São
 * Paulo como "rua aproximada" e o mapa mostrou a parada no lugar errado com
 * cara de acerto.
 */
describe("pertenceAoMunicipio — veto duro de lugar", () => {
  const candidato = (over: Partial<ResultadoGeo> = {}): ResultadoGeo => ({
    estado: "ok",
    latitude: -23.531725,
    longitude: -46.8319435,
    precisao: "rua",
    componentes: { rua: "Avenida Brasil", numero: null, bairro: "Parque José Alexandre", municipio: "Carapicuíba", uf: "SP", cep: "06321-665" },
    ...over,
  });

  it("recusa candidato de outra UF — o defeito do PED-19566", () => {
    expect(
      pertenceAoMunicipio(candidato(), { cidade: "Paula Freitas", uf: "PR", cep: "84630000" }),
    ).toBe(false);
  });

  it("recusa município divergente sem CEP que confirme", () => {
    expect(
      pertenceAoMunicipio(
        candidato({ componentes: { rua: "Rua X", numero: null, bairro: null, municipio: "Mafra", uf: "SC", cep: "89300-000" } }),
        { cidade: "Canoinhas", uf: "SC" },
      ),
    ).toBe(false);
  });

  it("aceita distrito: município diverge, mas o CEP é o mesmo", () => {
    // "Marcílio Dias" é distrito de Canoinhas e o Nominatim devolve o distrito
    // como município. O CEP confirma que é o município certo.
    expect(
      pertenceAoMunicipio(
        candidato({ componentes: { rua: null, numero: null, bairro: null, municipio: "Marcílio Dias", uf: "SC", cep: "89460-000" } }),
        { cidade: "Canoinhas", uf: "SC", cep: "89460000" },
      ),
    ).toBe(true);
  });

  it("aceita o município certo e não veta o que não dá para verificar", () => {
    expect(
      pertenceAoMunicipio(
        candidato({ componentes: { rua: null, numero: null, bairro: null, municipio: "Paula Freitas", uf: "PR", cep: "84630-000" } }),
        { cidade: "Paula Freitas", uf: "PR", cep: "84630000" },
      ),
    ).toBe(true);
    // Provedor sem `addressdetails`: não há prova de divergência.
    expect(pertenceAoMunicipio({ estado: "ok", latitude: 1, longitude: 2, precisao: "rua" }, { cidade: "X", uf: "PR" })).toBe(true);
  });

  it("compara UF por sigla: \"Paraná\" e \"PR\" são a mesma", () => {
    const r = candidato({
      componentes: { rua: null, numero: null, bairro: null, municipio: "Paula Freitas", uf: "Paraná", cep: null },
    });
    expect(pertenceAoMunicipio(r, { cidade: "Paula Freitas", uf: "PR" })).toBe(true);
  });
});

describe("componentes do provedor — UF em sigla", () => {
  it("prefere o ISO3166-2 (BR-PR) ao nome do estado", () => {
    // O Nominatim devolve `state: "Paraná"` e `ISO3166-2-lvl4: "BR-PR"`.
    // Preferir o nome fazia o veto `uf_divergente` do motor disparar SEMPRE
    // (cadastro diz "PR"), e a recuperação automática de endereço nunca
    // acontecia — sem erro nenhum aparecer.
    const r = classificarResultado([
      { lat: "-26.2", lon: "-50.9", addresstype: "village", address: { state: "Paraná", "ISO3166-2-lvl4": "BR-PR" } },
    ]);
    expect(r.componentes?.uf).toBe("PR");
  });
});

describe("geocodificarComFallback — o pino do PED-19566 não vai para São Paulo", () => {
  it("descarta o candidato de Carapicuíba/SP e fica com o município certo", async () => {
    vi.stubEnv("GEOCODER_MIN_INTERVALO_MS", "0");
    const respostas: Record<string, unknown> = {
      "Rodovia BR 476 Km 344, 344, centro, Paula Freitas, PR, Brasil": [],
      "Rodovia BR 476 Km 344, Paula Freitas, PR, Brasil": [
        { lat: "-26.1267146", lon: "-50.8486705", addresstype: "trunk", address: { road: "Rodovia do Xisto", city: "Paula Freitas", state: "Paraná", "ISO3166-2-lvl4": "BR-PR" } },
      ],
      "BR 476 Km 344, 344, centro, Paula Freitas, PR, Brasil": [],
      "Rodovia BR 476 Km 344, Paula Freitas, Brasil": [
        { lat: "-26.1267146", lon: "-50.8486705", addresstype: "trunk", address: { road: "Rodovia do Xisto", city: "Paula Freitas", state: "Paraná", "ISO3166-2-lvl4": "BR-PR" } },
      ],
      "Rodovia BR 476 Km 344, 344, SALA: 03;, 344 — centro, Paula Freitas/PR, 84630000, Brasil": [],
      // A resposta venenosa: "centro" não é lugar, e o provedor devolve uma
      // avenida de Carapicuíba/SP. É o resultado real medido em 2026-11-13.
      "centro, Paula Freitas, PR, Brasil": [
        { lat: "-23.5317250", lon: "-46.8319435", addresstype: "secondary", address: { road: "Avenida Brasil", suburb: "Parque José Alexandre", city: "Carapicuíba", state: "São Paulo", "ISO3166-2-lvl4": "BR-SP", postcode: "06321-665" } },
      ],
      "Paula Freitas, PR, Brasil": [
        { lat: "-26.2092739", lon: "-50.9364620", addresstype: "village", address: { city: "Paula Freitas", state: "Paraná", "ISO3166-2-lvl4": "BR-PR" } },
      ],
    };
    const fetchFalso = vi.fn(async (url: string) => {
      const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      return {
        ok: true,
        json: async () => respostas[q] ?? [],
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFalso);

    const r = await geocodificarComFallback(
      {
        logradouro: "Rodovia BR 476 Km 344, 344, SALA: 03;",
        numero_end: "344",
        bairro: "centro",
        cidade: "Paula Freitas",
        uf: "PR",
        cep: "84630000",
      },
      "Rodovia BR 476 Km 344, 344, SALA: 03;, 344 — centro, Paula Freitas/PR, 84630000",
    );

    expect(r.estado).toBe("ok");
    expect(r.precisao).toBe("cidade");
    expect(r.latitude).toBe(-26.2092739);
    expect(r.longitude).toBe(-50.936462);
    // O pino de Carapicuíba nunca pode sair daqui.
    const consultouCarapicuiba = fetchFalso.mock.calls.some((c) =>
      decodeURIComponent(new URL(c[0] as string).searchParams.get("q") ?? "").startsWith("centro, Paula Freitas"),
    );
    expect(consultouCarapicuiba).toBe(true);
    expect(r.latitude).not.toBe(-23.531725);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
