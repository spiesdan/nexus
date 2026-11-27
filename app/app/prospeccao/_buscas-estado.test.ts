import { describe, expect, it } from "vitest";

import {
  blocoDeEstado,
  comoListaBuscas,
  deveMostrarDegradada,
  deveMostrarParcial,
  deveMostrarZero,
  entradaDeRepeticao,
  estaAtiva,
  estaParando,
  parouDeFato,
  parcialDaBusca,
  percentualDaBusca,
  placesDisponivel,
  raioAmpliado,
  rotuloDoProgresso,
  rotuloDoStatus,
  termosConcluidosDaBusca,
  type BuscaDaTela,
} from "./_buscas-estado";

/**
 * Os quatro estados do contrato (`docs/prospeccao-maps-contrato.md`), com o
 * JSON real de cada um. O que se prova aqui é a LEITURA da tela — em especial
 * que "parando" não vira "pausada" e que parcial/degradada não se confundem.
 */
function busca(parcial: Partial<BuscaDaTela>): BuscaDaTela {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    categorias: ["oficina mecânica", "auto peças"],
    cidade: "Canoinhas",
    estado: "SC",
    raio_km: 30,
    max_empresas: 20,
    provider: "maps_browser",
    status: "running",
    encontradas: 40,
    novas: 12,
    duplicadas: 28,
    ...parcial,
  };
}

const EM_ANDAMENTO = busca({
  progresso: {
    termos_total: 2,
    termos_concluidos: ["oficina mecânica"],
    termos_falhos: [],
    termo_atual: "auto peças",
    tentativas: 0,
    bloqueio: null,
    termos_encontradas: { "oficina mecânica": 40 },
  },
});

const PARANDO = busca({
  status: "running",
  estado_parada: "parando",
  parada_maxima_s: 125,
  parcial: true,
  parcial_motivo: "1 de 2 termos concluídos, 1 pendente(s).",
});

const PARCIAL = busca({
  status: "completed",
  progresso: {
    termos_total: 2,
    termos_concluidos: ["oficina mecânica"],
    termos_falhos: ["auto peças"],
    termo_atual: null,
    tentativas: 0,
    bloqueio: null,
    termos_encontradas: { "oficina mecânica": 40 },
  },
  parcial: true,
  parcial_motivo: "1 de 2 termos concluídos; 1 falharam após as tentativas.",
});

const ZERO = busca({
  status: "completed",
  categorias: ["oficina mecânica"],
  encontradas: 0,
  novas: 0,
  duplicadas: 0,
  motivo_zero: "sem_resultados",
  parcial: false,
  parcial_motivo: "1 de 1 termos concluídos.",
  progresso: {
    termos_total: 1,
    termos_concluidos: ["oficina mecânica"],
    termos_falhos: [],
    termo_atual: null,
    tentativas: 0,
    bloqueio: null,
    termos_encontradas: { "oficina mecânica": 0 },
  },
});

const DEGRADADA = busca({
  status: "paused",
  encontradas: 0,
  novas: 0,
  duplicadas: 0,
  parcial: true,
  parcial_motivo:
    "Descoberta degradada: sidecar_em_modo_navegador: o job não confirmou fast_mode=true.",
  degradada: true,
  degradacao_motivo:
    "sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar.",
  progresso: {
    termos_total: 2,
    termos_concluidos: [],
    termos_falhos: [],
    termo_atual: null,
    tentativas: 0,
    bloqueio: null,
    termos_encontradas: {},
  },
});

describe("busca no mapa — leitura dos quatro estados", () => {
  it("em andamento: 1 de 2 termos, atual e tentativas", () => {
    expect(percentualDaBusca(EM_ANDAMENTO)).toBe(50);
    expect(termosConcluidosDaBusca(EM_ANDAMENTO)).toEqual({
      concluidos: 1,
      falhos: 0,
      total: 2,
    });
    expect(EM_ANDAMENTO.progresso?.termo_atual).toBe("auto peças");
    expect(EM_ANDAMENTO.progresso?.tentativas).toBe(0);
    expect(estaAtiva(EM_ANDAMENTO)).toBe(true);
    expect(deveMostrarZero(EM_ANDAMENTO)).toBe(false);
    expect(deveMostrarDegradada(EM_ANDAMENTO)).toBe(false);
  });

  it("em andamento não vira 'Parcial': 1 de 2 é o progresso normal", () => {
    // O selo "Parcial" é de desfecho (pausada/terminada/parando), não de busca
    // que ainda corre — senão todo progresso 50% pareceria problema.
    expect(deveMostrarParcial(EM_ANDAMENTO)).toBe(false);
    expect(parcialDaBusca(EM_ANDAMENTO)).toBe(true);
  });

  it("parando não aparece como pausada: status segue Procurando e há prazo", () => {
    expect(rotuloDoStatus(PARANDO.status)).toBe("Procurando");
    expect(estaParando(PARANDO)).toBe(true);
    expect(parouDeFato(PARANDO)).toBe(false);
    expect(PARANDO.parada_maxima_s).toBe(125);
    // Enquanto ainda corre, o bloco é "Parando…", não "Parcial" (design W1).
    expect(blocoDeEstado(PARANDO)).toBe("parando");
    expect(deveMostrarParcial(PARANDO)).toBe(false);
  });

  it("parado é o fim declarado do pedido de parada", () => {
    const parado = busca({ status: "paused", estado_parada: "parado" });
    expect(estaParando(parado)).toBe(false);
    expect(parouDeFato(parado)).toBe(true);
    expect(rotuloDoStatus(parado.status)).toBe("Pausada");
  });

  it("parcial: motivo legível e achados preservados (termo falho)", () => {
    expect(deveMostrarParcial(PARCIAL)).toBe(true);
    expect(blocoDeEstado(PARCIAL)).toBe("parcial");
    expect(PARCIAL.parcial_motivo).toContain("1 de 2");
    expect(PARCIAL.encontradas).toBe(40);
    expect(percentualDaBusca(PARCIAL)).toBe(100);
    expect(deveMostrarZero(PARCIAL)).toBe(false);
  });

  it("zero: motivo_zero com 0 encontrados exige as três saídas", () => {
    expect(deveMostrarZero(ZERO)).toBe(true);
    expect(blocoDeEstado(ZERO)).toBe("zero");
    expect(ZERO.motivo_zero).toBe("sem_resultados");
    expect(ZERO.encontradas).toBe(0);
    // Com resultado, o mesmo motivo não vira bloco de zero.
    expect(deveMostrarZero({ ...ZERO, encontradas: 3 })).toBe(false);
    // Não é parcial: o termo concluiu, só não achou nada.
    expect(deveMostrarParcial(ZERO)).toBe(false);
  });

  it("degradada: motivo próprio e sem bloco de parcial duplicado", () => {
    expect(deveMostrarDegradada(DEGRADADA)).toBe(true);
    expect(blocoDeEstado(DEGRADADA)).toBe("degradada");
    expect(DEGRADADA.degradacao_motivo).toContain("fast_mode");
    expect(deveMostrarParcial(DEGRADADA)).toBe(false);
    expect(deveMostrarZero(DEGRADADA)).toBe(false);
  });

  it("um bloco só: a ordem parando → degradada → parcial → zero decide", () => {
    expect(blocoDeEstado({ ...DEGRADADA, estado_parada: "parando", status: "running" })).toBe(
      "parando",
    );
    expect(blocoDeEstado({ ...ZERO, degradada: true, degradacao_motivo: "sidecar fora" })).toBe(
      "degradada",
    );
    expect(blocoDeEstado(EM_ANDAMENTO)).toBe(null);
  });

  it("progresso por termo: Maps nunca mostra 'células'", () => {
    expect(rotuloDoProgresso(EM_ANDAMENTO)).toEqual({
      concluidos: 1,
      total: 2,
      unidade: "termos",
    });
    const semCheckpoint = busca({ progresso: {}, total_celulas: 0, celulas_processadas: 0 });
    expect(rotuloDoProgresso(semCheckpoint)).toEqual({
      concluidos: 0,
      total: 2,
      unidade: "termos",
    });
    expect(percentualDaBusca(semCheckpoint)).toBe(0);
  });

  it("busca antiga sem checkpoint cai nas células, não inventa termos", () => {
    const legado = busca({
      provider: "osm_overpass",
      progresso: {},
      total_celulas: 40,
      celulas_processadas: 10,
    });
    expect(percentualDaBusca(legado)).toBe(25);
    expect(termosConcluidosDaBusca(legado).total).toBe(0);
    expect(deveMostrarParcial(legado)).toBe(false);
  });

  it("ampliar o raio dobra, com o teto do contrato", () => {
    expect(raioAmpliado(30)).toBe(60);
    expect(raioAmpliado(300)).toBe(500);
    expect(raioAmpliado(0)).toBe(60);
  });

  it("normaliza os envelopes que a API às vezes devolve", () => {
    expect(comoListaBuscas([ZERO])).toEqual([ZERO]);
    expect(comoListaBuscas({ data: [ZERO] })).toEqual([ZERO]);
    expect(comoListaBuscas(null)).toEqual([]);
    expect(comoListaBuscas({ data: "x" })).toEqual([]);
  });
});

/**
 * A repetição usa o que a listagem devolve desde o PR #969: `latitude` e
 * `longitude` da busca original, para que "2× raio" cubra a mesma área.
 * Cidade só entra como fallback quando a listagem não trouxe coordenada.
 */
describe("repetir busca — corpo enviado ao POST", () => {
  it("busca por cidade, sem coordenada na listagem: manda cidade/UF", () => {
    const corpo = entradaDeRepeticao(EM_ANDAMENTO, { provider: "osm_overpass" });
    expect(corpo).toEqual({
      categorias: EM_ANDAMENTO.categorias,
      cidade: "Canoinhas",
      estado: "SC",
      raio_km: 30,
      max_empresas: 20,
      forcar: true,
      provider: "osm_overpass",
    });
    expect(corpo).not.toHaveProperty("latitude");
  });

  it("com cidade E coordenada, a coordenada vence — mesma área da busca", () => {
    const comCoordenada = busca({ latitude: -26.12, longitude: -50.34 });
    const corpo = entradaDeRepeticao(comCoordenada, {});
    expect(corpo).toMatchObject({
      latitude: -26.12,
      longitude: -50.34,
      forcar: true,
    });
    expect(corpo).not.toHaveProperty("cidade");
  });

  it("busca por área manda lat/lng e não cidade", () => {
    const area = busca({
      cidade: null,
      estado: null,
      latitude: -26.12,
      longitude: -50.34,
      raio_km: 15,
      max_empresas: 100,
    });
    expect(entradaDeRepeticao(area, { raioKm: 30 })).toEqual({
      categorias: area.categorias,
      latitude: -26.12,
      longitude: -50.34,
      raio_km: 30,
      max_empresas: 100,
      forcar: true,
    });
  });

  it("sem cidade e sem coordenada não há corpo — a tela não desenha a ação", () => {
    expect(entradaDeRepeticao(busca({ cidade: null }), {})).toBeNull();
  });

  it("Places só aparece habilitado com flag e chave", () => {
    expect(placesDisponivel(true, true)).toBe(true);
    expect(placesDisponivel(false, true)).toBe(false);
    expect(placesDisponivel(true, false)).toBe(false);
    expect(placesDisponivel(false, false)).toBe(false);
  });
});
