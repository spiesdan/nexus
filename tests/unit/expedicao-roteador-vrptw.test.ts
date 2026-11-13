/**
 * F5 — contrato cliente↔serviço de otimização VRPTW.
 *
 * O backend (`lib/expedicao/roteador-vrptw.ts`) é a fronteira tipada com o
 * servico Python (`services/rota`). Este teste cobre a fachada: montagem do
 * corpo, parse da resposta e fail-closed. A heurística antiga (NN + 2-opt) não
 * pode mais responder por aqui — se o fetch falhar OU o contrato vier errado,
 * o erro chega como `SolverIndisponivelError`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SolverIndisponivelError, otimizarVRPTW } from "@/lib/expedicao/roteador-vrptw";

const URL_BASE = "http://127.0.0.1:8000";

describe("otimizarVRPTW — contrato com o servico Python (F5)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("chama POST /rota/otimizar com o corpo validado (org, pontos, veiculos, tempo_parada)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        org_id: "org-1",
        status: "otimizado",
        veiculos: [
          { veiculo_id: "v1", motorista_id: "m1", paradas: ["p1", "p2"], distancia_m: 1234 },
        ],
        total_paradas: 2,
        tempo_total_s: 900,
        erro: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await otimizarVRPTW({
      orgId: "org-1",
      pontos: [
        { node_id: "p1", latitude: -22.9068, longitude: -43.1729, peso_kg: 10 },
        { node_id: "p2", latitude: -22.9168, longitude: -43.1829, peso_kg: 12 },
      ],
      veiculos: [{ veiculo_id: "v1", motorista_id: "m1", capacidade_kg: 100 }],
      tempoParadaMin: 30,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(`${URL_BASE}/rota/otimizar`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      org_id: "org-1",
      pontos: [
        { node_id: "p1", latitude: -22.9068, longitude: -43.1729, peso_kg: 10 },
        { node_id: "p2", latitude: -22.9168, longitude: -43.1829, peso_kg: 12 },
      ],
      veiculos: [{ veiculo_id: "v1", motorista_id: "m1", capacidade_kg: 100 }],
      tempo_parada_min: 30,
    });

    expect(resposta.total_paradas).toBe(2);
    expect(resposta.veiculos).toHaveLength(1);
    expect(resposta.veiculos[0]?.veiculo_id).toBe("v1");
    expect(resposta.veiculos[0]?.paradas).toEqual(["p1", "p2"]);
  });

  it("falha fechado (SolverIndisponivelError) quando a resposta do servico traz erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ org_id: "org-1", status: "sem_solucao", veiculos: [], total_paradas: 0, tempo_total_s: 0, erro: "solver_nao_encontrou_solucao" }),
      }),
    );

    await expect(
      otimizarVRPTW({ orgId: "org-1", pontos: [], veiculos: [{ veiculo_id: "v1" }] }),
    ).rejects.toBeInstanceOf(SolverIndisponivelError);
  });

  it("falha fechado (SolverIndisponivelError) quando a resposta nao bate o contrato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ nada: "aqui" }) }),
    );

    await expect(
      otimizarVRPTW({ orgId: "org-1", pontos: [], veiculos: [{ veiculo_id: "v1" }] }),
    ).rejects.toThrow(SolverIndisponivelError);
  });

  it("falha fechado (SolverIndisponivelError) quando a rede falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network_down")));
    await expect(
      otimizarVRPTW({ orgId: "org-1", pontos: [], veiculos: [{ veiculo_id: "v1" }] }),
    ).rejects.toBeInstanceOf(SolverIndisponivelError);
  });
});
