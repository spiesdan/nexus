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

describe("OSRM: default público de volta, erros continuam visíveis", () => {
  it("sem OSRM_URL, a URL montada é a do serviço público", async () => {
    vi.stubEnv("OSRM_URL", "");
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{ distance: 1000, duration: 100, geometry: { coordinates: [[0, 0], [1, 1]] } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(base()).toBe("https://router.project-osrm.org");
    const r = await new OsmrmProvider().rota(pontos);
    expect(r.ruas).toBe(true);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url.startsWith("https://router.project-osrm.org/route/v1/driving/")).toBe(true);
  });

  it("timeout de 5 s vira osrm_timeout e não é disfarçado pelo fallback", async () => {
    vi.stubEnv("OSRM_URL", "http://osrm.local:5000");
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("abort")), { once: true });
      }),
    ));
    const verificado = expect(otimizarComFallback(new OsmrmProvider(), pontos, false))
      .rejects.toThrow("osrm_timeout");
    await vi.advanceTimersByTimeAsync(5000);
    await verificado;
  });

  it("falha de rede vira erro nomeado visível", async () => {
    vi.stubEnv("OSRM_URL", "http://osrm.local:5000");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(new OsmrmProvider().rota(pontos)).rejects.toThrow("osrm_indisponivel");
    expect(ERROS_VISIVEIS.has("osrm_indisponivel")).toBe(true);
  });
});
