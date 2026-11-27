/**
 * POST /api/v1/prospecting/searches — provider explícito entre os habilitados.
 *
 * O zero e a degradada precisam oferecer OSM/Places em um clique. Sem provider
 * no corpo, vale `provider_ativo` (comportamento intacto). Com provider:
 * OSM sempre; Google só com flag + chave; maps_browser fora até 12/12;
 * desconhecido devolve 4xx nomeando o provider.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  googlePlacesHabilitado,
  mapsBrowserHabilitado,
  resolverChaveGoogle,
} from "@/lib/prospeccao/chave";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/env", () => ({ env: { DISCOVERY_CACHE_TTL: "30" } }));
vi.mock("@/lib/prospeccao/chave", () => ({
  googlePlacesHabilitado: vi.fn(),
  mapsBrowserHabilitado: vi.fn(),
  resolverChaveGoogle: vi.fn(),
}));
vi.mock("@/lib/prospeccao/custos", () => ({
  custoEfetivo: () => ({ busca: 0, detalhe: 0 }),
}));
vi.mock("@/lib/prospeccao/grade", () => ({
  gerarGrade: () => [{ indice: 0, latitude: -26.1, longitude: -50.3, raioMetros: 8000 }],
}));
vi.mock("@/lib/prospeccao/motor", () => ({ hashDaBusca: () => "hash-de-teste" }));
vi.mock("@/lib/prospeccao/providers/registro", () => ({
  criarProvider: () => ({ geocodificar: async () => ({ latitude: -26.1, longitude: -50.3 }) }),
}));
vi.mock("@/lib/prospeccao/uso", () => ({
  MENSAGEM_ORCAMENTO_ATINGIDO: "orcamento",
  orcamentoDoMes: vi.fn(),
  registrarCacheHit: vi.fn(async () => undefined),
}));

const ORG = "22222222-2222-4222-8222-222222222222";

type Settings = { provider_ativo: string };

let inseridas: Record<string, unknown>[] = [];

function adminFalso(settings: Settings) {
  return {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.gte = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.maybeSingle = () =>
        Promise.resolve(
          tabela === "prospecting_settings"
            ? {
                data: {
                  cache_ttl_dias: 30,
                  limite_por_busca: 500,
                  provider_ativo: settings.provider_ativo,
                  grid_size_km: 5,
                  grid_overlap_pct: 10,
                  orcamento_mensal_cents: null,
                  preco_busca_cents: null,
                  preco_detalhe_cents: null,
                },
                error: null,
              }
            : { data: null, error: null },
        );
      return q;
    },
  };
}

function sessaoFalsa() {
  return {
    from: () => {
      const q: Record<string, unknown> = {};
      q.insert = (v: Record<string, unknown>) => {
        inseridas.push(v);
        return q;
      };
      q.select = () => q;
      q.single = () =>
        Promise.resolve({
          data: {
            id: "s1",
            provider: inseridas[0]?.provider,
            progresso: {},
            motivo_zero: null,
            degradada: false,
            degradacao_motivo: null,
            parada_solicitada_em: null,
          },
          error: null,
        });
      return q;
    },
  };
}

function listaFalsa(rows: Record<string, unknown>[]) {
  return {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.then = (ok: (v: unknown) => void) => Promise.resolve({ data: rows, error: null }).then(ok);
      return q;
    },
  };
}

function get(): Promise<Response> {
  return import("./route").then(({ GET }) =>
    GET(new NextRequest("http://x/api/v1/prospecting/searches")),
  );
}

function post(corpo: Record<string, unknown>): Promise<Response> {
  return import("./route").then(({ POST }) =>
    POST(
      new NextRequest("http://x/api/v1/prospecting/searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      }),
    ),
  );
}

const BASE = {
  categorias: ["oficina mecânica"],
  cidade: "Canoinhas",
  estado: "SC",
  latitude: -26.1,
  longitude: -50.3,
};

beforeEach(() => {
  vi.clearAllMocks();
  inseridas = [];
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1" },
    org: { orgId: ORG, role: "agent" },
  } as never);
  vi.mocked(googlePlacesHabilitado).mockReturnValue(true);
  vi.mocked(mapsBrowserHabilitado).mockReturnValue(false);
  vi.mocked(resolverChaveGoogle).mockResolvedValue({ chave: "chave-do-tenant", origem: "tenant" });
});

describe("POST — provider explícito", () => {
  it("OSM é sempre opção, mesmo com provider_ativo google", async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminFalso({ provider_ativo: "google_places" }) as never);
    vi.mocked(createClient).mockResolvedValue(sessaoFalsa() as never);

    const res = await post({ ...BASE, provider: "osm_overpass" });
    expect(res.status).toBe(201);
    expect(inseridas[0]?.provider).toBe("osm_overpass");
    expect(vi.mocked(audit).mock.calls[0]?.[0].metadata).toEqual({
      provider: "osm_overpass",
      provider_origem: "explicito",
    });
  });

  it("Google entra quando a flag está ligada e o tenant tem chave", async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminFalso({ provider_ativo: "osm_overpass" }) as never);
    vi.mocked(createClient).mockResolvedValue(sessaoFalsa() as never);

    const res = await post({ ...BASE, provider: "google_places" });
    expect(res.status).toBe(201);
    expect(inseridas[0]?.provider).toBe("google_places");
    expect(vi.mocked(audit).mock.calls[0]?.[0].metadata).toEqual({
      provider: "google_places",
      provider_origem: "explicito",
    });
  });

  it("Google sem chave devolve 4xx claro e não insere", async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminFalso({ provider_ativo: "osm_overpass" }) as never);
    vi.mocked(resolverChaveGoogle).mockResolvedValue({ chave: null, origem: "nenhuma" });

    const res = await post({ ...BASE, provider: "google_places" });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("Sem chave do Google");
    expect(inseridas).toHaveLength(0);
  });

  it("provider desconhecido devolve 4xx nomeando o valor", async () => {
    const res = await post({ ...BASE, provider: "bing" });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain('Provider "bing" desconhecido');
    expect(inseridas).toHaveLength(0);
  });

  it("maps_browser não entra como opção antes de 12/12", async () => {
    const res = await post({ ...BASE, provider: "maps_browser" });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("ainda não é uma opção");
  });

  it("GET devolve latitude/longitude da busca criada por coordenada", async () => {
    vi.mocked(createClient).mockResolvedValue(
      listaFalsa([
        {
          id: "s1",
          provider: "osm_overpass",
          status: "queued",
          categorias: ["oficina mecânica"],
          cidade: null,
          estado: null,
          latitude: -26.1,
          longitude: -50.3,
          progresso: {},
          motivo_zero: null,
          degradada: false,
          degradacao_motivo: null,
          parada_solicitada_em: null,
        },
      ]) as never,
    );

    const res = await get();
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Record<string, unknown>[] };
    expect(corpo.data[0]).toMatchObject({ latitude: -26.1, longitude: -50.3 });
    // O par permite repetir "nesta área" sem cidade no POST.
  });

  it("sem provider vale a configuração, com origem registrada", async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminFalso({ provider_ativo: "osm_overpass" }) as never);
    vi.mocked(createClient).mockResolvedValue(sessaoFalsa() as never);

    const res = await post(BASE);
    expect(res.status).toBe(201);
    expect(inseridas[0]?.provider).toBe("osm_overpass");
    expect(vi.mocked(audit).mock.calls[0]?.[0].metadata).toEqual({
      provider: "osm_overpass",
      provider_origem: "configuracao",
    });
  });
});
