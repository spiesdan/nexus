/**
 * F5 — contrato cliente↔serviço de otimização VRPTW.
 *
 * O backend (`lib/expedicao/roteador-vrptw.ts`) é a fronteira tipada com o
 * servico Python (`services/rota`). Este teste cobre a fachada: montagem do
 * corpo (origem + veículos + rota aberta/fechada), parse da resposta e
 * fail-closed. `sem_solucao` NÃO é erro de infraestrutura: volta tipado para a
 * rota explicar capacidade/jornada ao operador.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SolverIndisponivelError, otimizarVRPTW } from "@/lib/expedicao/roteador-vrptw";

const URL_BASE = "http://127.0.0.1:8000";

function respostaValida(extra: Record<string, unknown> = {}) {
  return {
    org_id: "org-1",
    status: "otimizado",
    veiculos: [
      {
        veiculo_id: "v1",
        motorista_id: "m1",
        paradas: ["p1", "p2"],
        distancia_m: 1234,
        duracao_s: 600,
        duracao_com_paradas_s: 1200,
        carga_kg: 22,
        carga_m3: 0,
        geometria: [
          [-43.17, -22.9],
          [-43.18, -22.91],
        ],
      },
    ],
    total_paradas: 2,
    entregas_nao_alocadas: [],
    restricoes_nao_aplicadas: ["janelas_de_entrega_sem_dados"],
    tempo_total_s: 900,
    tempo_execucao_ms: 42,
    versao_algoritmo: "ortools-vrptw-1",
    matriz_provedor: "osrm",
    motivo: null,
    erro: null,
    ...extra,
  };
}

describe("otimizarVRPTW — contrato com o servico Python (F5)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("manda origem, veículos e rota aberta no corpo validado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => respostaValida(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await otimizarVRPTW({
      orgId: "org-1",
      origem: { node_id: "__base__", latitude: -22.9, longitude: -43.17 },
      pontos: [
        { node_id: "p1", latitude: -22.9068, longitude: -43.1729, peso_kg: 10 },
        { node_id: "p2", latitude: -22.9168, longitude: -43.1829, peso_kg: 12 },
      ],
      veiculos: [{ veiculo_id: "v1", motorista_id: "m1", capacidade_kg: 100 }],
      retornarOrigem: false,
      tempoParadaMin: 30,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(`${URL_BASE}/rota/otimizar`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      org_id: "org-1",
      origem: { node_id: "__base__", latitude: -22.9, longitude: -43.17 },
      pontos: [
        { node_id: "p1", latitude: -22.9068, longitude: -43.1729, peso_kg: 10 },
        { node_id: "p2", latitude: -22.9168, longitude: -43.1829, peso_kg: 12 },
      ],
      veiculos: [{ veiculo_id: "v1", motorista_id: "m1", capacidade_kg: 100 }],
      retornar_origem: false,
      tempo_parada_min: 30,
    });

    expect(resposta.status).toBe("otimizado");
    expect(resposta.total_paradas).toBe(2);
    expect(resposta.veiculos[0]?.veiculo_id).toBe("v1");
    expect(resposta.veiculos[0]?.paradas).toEqual(["p1", "p2"]);
    expect(resposta.restricoes_nao_aplicadas).toEqual(["janelas_de_entrega_sem_dados"]);
  });

  it("devolve sem_solucao tipado, com motivo e não alocadas (não é 503)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () =>
          respostaValida({
            status: "sem_solucao",
            veiculos: [],
            total_paradas: 0,
            entregas_nao_alocadas: ["p1", "p2"],
            motivo: "capacidade_peso",
            erro: "solver_nao_encontrou_solucao",
          }),
      }),
    );

    const resposta = await otimizarVRPTW({
      orgId: "org-1",
      origem: { node_id: "__base__", latitude: -22.9, longitude: -43.17 },
      pontos: [{ node_id: "p1", latitude: -22.9068, longitude: -43.1729 }],
      veiculos: [{ veiculo_id: "v1", capacidade_kg: 1 }],
    });

    expect(resposta.status).toBe("sem_solucao");
    expect(resposta.motivo).toBe("capacidade_peso");
    expect(resposta.entregas_nao_alocadas).toEqual(["p1", "p2"]);
  });

  it("falha fechado quando o serviço responde HTTP de erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ detail: "osrm caiu" }) }),
    );

    await expect(
      otimizarVRPTW({
        orgId: "org-1",
        origem: { node_id: "__base__", latitude: -22.9, longitude: -43.17 },
        pontos: [{ node_id: "p1", latitude: -22.9068, longitude: -43.1729 }],
        veiculos: [{ veiculo_id: "v1" }],
      }),
    ).rejects.toBeInstanceOf(SolverIndisponivelError);
  });

  it("falha fechado quando a resposta não bate o contrato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ nada: "aqui" }) }),
    );

    await expect(
      otimizarVRPTW({
        orgId: "org-1",
        origem: { node_id: "__base__", latitude: -22.9, longitude: -43.17 },
        pontos: [{ node_id: "p1", latitude: -22.9068, longitude: -43.1729 }],
        veiculos: [{ veiculo_id: "v1" }],
      }),
    ).rejects.toThrow(SolverIndisponivelError);
  });

  it("falha fechado quando a rede falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network_down")));
    await expect(
      otimizarVRPTW({
        orgId: "org-1",
        origem: { node_id: "__base__", latitude: -22.9, longitude: -43.17 },
        pontos: [{ node_id: "p1", latitude: -22.9068, longitude: -43.1729 }],
        veiculos: [{ veiculo_id: "v1" }],
      }),
    ).rejects.toBeInstanceOf(SolverIndisponivelError);
  });
});
