import { afterEach, describe, expect, it, vi } from "vitest";

import { base, ERROS_VISIVEIS, OsmrmProvider, otimizarComFallback } from "./osrm";
import type { Coordenada } from "./roteamento";

const pontos: Coordenada[] = [
  { lat: -26.0, lng: -50.0 },
  { lat: -26.1, lng: -50.1 },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("OSRM sem serviço público como padrão", () => {
  it("sem OSRM_URL: erro nomeado e NENHUMA requisição a terceiro", async () => {
    vi.stubEnv("OSRM_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(base()).toBe("");
    await expect(new OsmrmProvider().rota(pontos)).rejects.toThrow("osrm_nao_configurado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o erro de configuração não é disfarçado pelo fallback local", async () => {
    vi.stubEnv("OSRM_URL", "");
    await expect(otimizarComFallback(new OsmrmProvider(), pontos, false))
      .rejects.toThrow("osrm_nao_configurado");
    expect(ERROS_VISIVEIS.has("osrm_nao_configurado")).toBe(true);
  });

  it("timeout de 5 s vira osrm_timeout visível", async () => {
    vi.stubEnv("OSRM_URL", "http://osrm.local:5000");
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("abort")), { once: true });
      }),
    ));
    const verificado = expect(new OsmrmProvider().rota(pontos)).rejects.toThrow("osrm_timeout");
    await vi.advanceTimersByTimeAsync(5000);
    await verificado;
  });
});
