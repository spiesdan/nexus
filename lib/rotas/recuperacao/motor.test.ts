import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Geocodificacao from "@/lib/rotas/geocodificacao";
import type { ResultadoGeo } from "@/lib/rotas/geocodificacao";
import {
  buscarPhoton,
  buscarPhotonPorComponentes,
  photonDisponivel,
} from "./photon";
import { recuperarLote, recuperarDestino } from "./motor";
import type { PartesEnderecoInformado } from "./motor";

/**
 * ADDRESS RECOVERY ENGINE — provedores simulados, sem internet.
 *
 * O geocodificador (Nominatim) e o Photon são dublados na fronteira do
 * módulo. Nenhum teste toca a rede; cada um mede uma decisão do motor:
 * corrigir, sugerir ou não encontrar — e, principalmente, quando NÃO corrigir
 * (vetos duros).
 */

vi.mock("@/lib/rotas/geocodificacao", async (importOriginal) => {
  const atual = await importOriginal<typeof Geocodificacao>();
  return {
    ...atual,
    geocodificarComFallback: vi.fn(),
    geocodificarEndereco: vi.fn(),
  };
});

vi.mock("./photon", () => ({
  photonDisponivel: vi.fn(() => false),
  buscarPhoton: vi.fn(async () => []),
  buscarPhotonPorComponentes: vi.fn(async () => []),
}));

import {
  geocodificarComFallback,
  geocodificarEndereco,
} from "@/lib/rotas/geocodificacao";

const mockFallback = vi.mocked(geocodificarComFallback);
const mockEndereco = vi.mocked(geocodificarEndereco);
const mockPhotonDisponivel = vi.mocked(photonDisponivel);
const mockBuscarPhoton = vi.mocked(buscarPhoton);
const mockBuscarPhotonPorComponentes = vi.mocked(buscarPhotonPorComponentes);

interface Componentes {
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
}

function componentes(over: Partial<Componentes> = {}): Componentes {
  return {
    rua: "Rua A",
    numero: "100",
    bairro: "Centro",
    municipio: "Canoinhas",
    uf: "SC",
    cep: "89460-000",
    ...over,
  };
}

function ok(
  lat = -26.1748,
  lng = -50.3933,
  precisao: "numero" | "rua" | "bairro" | "cidade" = "numero",
  comp: Partial<Componentes> = {}
): ResultadoGeo {
  return {
    estado: "ok",
    latitude: lat,
    longitude: lng,
    precisao,
    componentes: componentes(comp),
  };
}

function naoEncontrado(): ResultadoGeo {
  return { estado: "nao_encontrado", latitude: null, longitude: null, precisao: null };
}

function erro(): ResultadoGeo {
  return { estado: "erro", latitude: null, longitude: null, precisao: null };
}

const PARTES: PartesEnderecoInformado = {
  rua: "Rua A",
  numero: "100",
  bairro: "Centro",
  cidade: "Canoinhas",
  uf: "SC",
  cep: "89460-000",
  linha: "Rua A, 100, Centro, Canoinhas/SC",
};

function depsSimulado() {
  const gravados: unknown[] = [];
  const atualizados: unknown[] = [];
  return {
    gravarHistorico: async (_linha: unknown): Promise<void> => {
      gravados.push(_linha);
    },
    atualizarDestino: async (_linha: unknown): Promise<void> => {
      atualizados.push(_linha);
    },
    criadoPor: "usuario-teste",
    gravados,
    atualizados,
  };
}

function ultimaAtualizacao(deps: ReturnType<typeof depsSimulado>): Record<string, unknown> {
  return deps.atualizados[deps.atualizados.length - 1] as Record<string, unknown>;
}

describe("recuperarDestino — motor de recuperação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFallback.mockResolvedValue(naoEncontrado());
    mockEndereco.mockResolvedValue(naoEncontrado());
    mockPhotonDisponivel.mockReturnValue(false);
    mockBuscarPhoton.mockResolvedValue([]);
    mockBuscarPhotonPorComponentes.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Caso 1 — endereço correto na 1ª tentativa: confirma sem corrigir", async () => {
    mockEndereco.mockResolvedValue(ok());

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-1", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    expect(r.estado).toBe("encontrado");
    expect(r.candidato).not.toBeNull();
    expect(r.candidato!.latitude).toBe(-26.1748);
    expect(r.candidato!.metodo).toBe("original");
    expect(r.tentativas[0]!.provedor).toBe("nominatim");
    // O original não é tocado no update.
    expect(ultimaAtualizacao(deps)).not.toHaveProperty("endereco_original");
    expect(ultimaAtualizacao(deps).enderecoRecuperado).toBe(
      "Rua A, 100, Centro, Canoinhas, SC, 89460-000"
    );
  });

  it("Caso 2 — erro de uma letra na cidade: corrige e vira `recuperado`", async () => {
    mockEndereco
      .mockResolvedValueOnce(naoEncontrado())
      .mockResolvedValueOnce(naoEncontrado())
      .mockResolvedValueOnce(naoEncontrado());
    mockFallback.mockResolvedValue(ok(-26.1748, -50.3933, "numero"));
    mockPhotonDisponivel.mockReturnValue(false);

    const deps = depsSimulado();
    const r = await recuperarDestino(
      "dest-2",
      "Rua A, 100, Canoinahs/SC",
      { ...PARTES, cidade: "Canoinahs", linha: "Rua A, 100, Canoinahs/SC" },
      "nao_tentada",
      null,
      deps
    );

    // "Canoinahs" × "Canoinhas" é erro de uma letra e o CEP/UF confirmam:
    // confiança alta o bastante para corrigir, com histórico.
    expect(r.estado).toBe("recuperado");
    expect(r.candidato).not.toBeNull();
    expect(r.candidato!.metodo).toBe("normalizado");
    expect(deps.gravados.length).toBeGreaterThan(0);
  });

  it("Caso 3 — erro no nome da rua (uma letra) também é recuperável", async () => {
    mockEndereco.mockResolvedValue(naoEncontrado());
    mockFallback.mockResolvedValue(
      ok(-26.1748, -50.3933, "numero", { rua: "Rua Albuquerque" })
    );

    const deps = depsSimulado();
    const r = await recuperarDestino(
      "dest-3",
      "Rua Albuquerke, 100, Canoinhas/SC",
      { ...PARTES, rua: "Rua Albuquerke", linha: "Rua Albuquerke, 100, Canoinhas/SC" },
      "nao_tentada",
      null,
      deps
    );

    expect(["recuperado", "encontrado"]).toContain(r.estado);
    expect(r.candidato).not.toBeNull();
  });

  it("Caso 4 — CEP correto com município divergente: o CEP manda e corrige", async () => {
    mockEndereco.mockResolvedValue(ok(-26.17, -50.39, "numero", { municipio: "Joinville" }));

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-4", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    // CEP igual confirma o ponto mesmo com município grafado diferente.
    expect(r.estado).toBe("recuperado");
  });

  it("Caso 5 — sem número: aceita precisão de rua", async () => {
    mockEndereco.mockResolvedValue(ok(-26.1748, -50.3933, "rua", { numero: null }));

    const deps = depsSimulado();
    const r = await recuperarDestino(
      "dest-5",
      "Rua A, Canoinhas/SC",
      { ...PARTES, numero: null, linha: "Rua A, Canoinhas/SC" },
      "nao_tentada",
      null,
      deps
    );

    expect(["encontrado", "recuperado"]).toContain(r.estado);
    expect(r.candidato!.precisao).toBe("rua");
  });

  it("Caso 6 — município divergente sem CEP: veta e pede confirmação", async () => {
    mockEndereco.mockResolvedValue(
      ok(-26.5, -50.9, "numero", { municipio: "Joinville", cep: null })
    );

    const deps = depsSimulado();
    const r = await recuperarDestino(
      "dest-6",
      "Rua A, 100, Canoinhas/SC",
      { ...PARTES, cep: null },
      "nao_tentada",
      null,
      deps
    );

    expect(r.estado).toBe("ambiguo");
    expect(r.candidato).toBeNull();
    expect(r.sugestoes).toHaveLength(1);
    expect(r.sugestoes[0]!.motivo).toContain("Veto");
  });

  it("Caso 6b — veto de UF divergente nunca corrige automático", async () => {
    mockEndereco.mockResolvedValue(ok(-26.17, -50.39, "numero", { uf: "PR" }));

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-6b", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    expect(r.estado).toBe("ambiguo");
    expect(r.candidato).toBeNull();
  });

  it("Caso 6c — centroide de cidade nunca é correção automática", async () => {
    mockEndereco.mockResolvedValue(ok(-26.17, -50.39, "cidade", { rua: null, numero: null }));

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-6c", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    expect(r.estado).toBe("ambiguo");
    expect(r.candidato).toBeNull();
    expect(r.sugestoes).toHaveLength(1);
  });

  it("Caso 7 — não encontrado em nenhum provedor", async () => {
    const deps = depsSimulado();
    const r = await recuperarDestino(
      "dest-7",
      "Rua Inexistente, 999, Cidade Fantasma/XX",
      { rua: "Rua Inexistente", cidade: "Cidade Fantasma", uf: "XX" },
      "nao_tentada",
      null,
      deps
    );

    expect(r.estado).toBe("nao_encontrado");
    expect(r.candidato).toBeNull();
    expect(r.sugestoes).toHaveLength(0);
  });

  it("Caso 8 — Nominatim fora do ar: estado `erro`, sem exceção", async () => {
    mockEndereco.mockResolvedValue(erro());
    mockFallback.mockResolvedValue(erro());

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-8", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    expect(r.estado).toBe("erro");
    expect(r.candidato).toBeNull();
  });

  it("Caso 9 — Photon fora do ar não derruba a carga", async () => {
    mockPhotonDisponivel.mockReturnValue(true);
    mockBuscarPhoton.mockRejectedValue(new TypeError("Photon fora do ar"));

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-9", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    expect(r.candidato).toBeNull();
    // O erro do Photon é registrado, não propagado.
    expect(r.tentativas.some((t) => t.provedor === "photon" && t.estado === "erro")).toBe(true);
  });

  it("Caso 10 — exceção no geocodificador vira erro, não quebra o lote", async () => {
    mockEndereco.mockRejectedValue(new Error("timeout"));
    mockFallback.mockRejectedValue(new Error("timeout"));

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-10", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    expect(r.estado).toBe("erro");
    expect(r.candidato).toBeNull();
  });

  it("Caso 11 — destino já resolvido não é reconsultado", async () => {
    const deps = depsSimulado();
    const r = await recuperarDestino("dest-11", PARTES.linha!, PARTES, "recuperado", null, deps);

    expect(r.jaEstavaResolvido).toBe(true);
    expect(mockEndereco).not.toHaveBeenCalled();
    expect(mockFallback).not.toHaveBeenCalled();
  });

  it("Caso 12 — endereço original preservado: update só grava normalizado/recuperado", async () => {
    // O vendedor digitou "Rua A"; o provedor devolve "Rua B". Há correção, e
    // ela vai para `endereco_recuperado` — `endereco_original` é intocável.
    mockEndereco.mockResolvedValue(ok(-26.1748, -50.3933, "numero", { rua: "Rua B" }));

    const deps = depsSimulado();
    const r = await recuperarDestino(
      "dest-12",
      "Rua A, 100, Canoinhas/SC",
      { ...PARTES, rua: "Rua A", linha: "Rua A, 100, Canoinhas/SC" },
      "nao_tentada",
      null,
      deps
    );

    const atualizacao = ultimaAtualizacao(deps);
    expect(atualizacao).not.toHaveProperty("endereco_original");
    expect(String(atualizacao.enderecoRecuperado)).toContain("Rua B");
    expect(r.estado).toBe("recuperado");
  });

  it("Caso 14 — pino existente é preservado quando nada melhor aparece", async () => {
    const deps = depsSimulado();
    const r = await recuperarDestino(
      "dest-14",
      PARTES.linha!,
      PARTES,
      "nao_tentada",
      { latitude: -26.1748, longitude: -50.3933 },
      deps
    );

    expect(r.estado).toBe("encontrado");
    expect(r.candidato).toBeNull();
  });

  it("Caso 5b — Photon só sugere, nunca corrige automático", async () => {
    mockPhotonDisponivel.mockReturnValue(true);
    mockBuscarPhoton.mockResolvedValue([
      {
        nome: "Rua A",
        rua: "Rua A",
        numero: "100",
        bairro: "Centro",
        cidade: "Canoinhas",
        uf: "SC",
        cep: "89460-000",
        lat: -26.1748,
        lng: -50.3933,
        tipo: "house",
        fonte: "photon",
        bruto: {},
      },
    ]);

    const deps = depsSimulado();
    const r = await recuperarDestino("dest-p1", PARTES.linha!, PARTES, "nao_tentada", null, deps);

    expect(r.candidato).toBeNull();
    expect(r.estado).toBe("ambiguo");
    expect(r.sugestoes[0]!.provedor).toBe("photon");
  });

  it("recuperarLote — resumo consolidado e falha isolada", async () => {
    mockEndereco.mockResolvedValue(naoEncontrado());

    const deps = depsSimulado();
    const r = await recuperarLote(
      [
        {
          destinationId: "d1",
          enderecoOriginal: "Rua A, 100",
          partes: PARTES,
          estadoAtual: "nao_tentada",
          coordenada: null,
        },
        {
          destinationId: "d2",
          enderecoOriginal: "Rua B, 200",
          partes: { ...PARTES, rua: "Rua B", numero: "200" },
          estadoAtual: "nao_tentada",
          coordenada: null,
        },
      ],
      deps
    );

    expect(r.resumo.analisados).toBe(2);
    expect(r.resumo.naoEncontrados).toBe(2);
    expect(r.resultados).toHaveLength(2);
  });
});
