/**
 * PATCH /api/v1/shipments/[id]/rota/ordem — salvar a sequência.
 *
 * O que se mede aqui é o contrato do prompt §5: a geometria salva tem de
 * corresponder à sequência gravada.
 *
 * 1. Salvar com PROPOSTA (otimizar → salvar): a geometria vem no body e é a
 *    válida — não invalida.
 * 2. Salvar SEM proposta depois de reordenar manualmente: a geometria antiga
 *    morre (null) — a linha que não corresponde à ordem não pode ficar no
 *    mapa como se fosse definitiva. A versão sobe, invalidando o cache do
 *    app do motorista.
 * 3. Salvar SEM mudança de sequência (só ajustes/tempo): não invalida.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { carregarCargaComParadas } from "@/app/api/v1/shipments/[id]/rota/_carga";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/app/api/v1/shipments/[id]/rota/_carga", () => ({ carregarCargaComParadas: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";
const PARADA_A = "parada-a";
const PARADA_B = "parada-b";

type Gravado = { tabela: string; operacao: string; carga: unknown };

function banco(linhas: Record<string, Record<string, unknown>[]>) {
  const gravados: Gravado[] = [];
  const proto: Record<string, unknown> = {
    __tabela: "",
    select(this: Record<string, unknown>) {
      return this;
    },
    eq(this: Record<string, unknown>) {
      return this;
    },
    in(this: Record<string, unknown>) {
      return this;
    },
    order(this: Record<string, unknown>) {
      return this;
    },
    maybeSingle(this: Record<string, unknown>) {
      return Promise.resolve({ data: (linhas[this.__tabela as string] ?? [])[0] ?? null, error: null });
    },
    then(this: Record<string, unknown>, ok: (v: unknown) => void) {
      return Promise.resolve({ data: linhas[this.__tabela as string] ?? [], error: null }).then(ok);
    },
    insert(this: Record<string, unknown>, carga: unknown) {
      gravados.push({ tabela: this.__tabela as string, operacao: "insert", carga });
      return Promise.resolve({ data: null, error: null });
    },
    update(this: Record<string, unknown>, carga: unknown) {
      gravados.push({ tabela: this.__tabela as string, operacao: "update", carga });
      return this;
    },
  };
  const cliente = {
    from: (tabela: string) => {
      const cadeia = Object.create(proto);
      cadeia.__tabela = tabela;
      return cadeia;
    },
  };
  return { cliente, gravados };
}

function sessao() {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: "manager" as const }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK["manager"] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: "manager" as const } }
      : { ok: false, response: fail("forbidden_role", "no.", 403, {}) },
  );
}

const carga = {
  id: CARGA,
  numero: 22,
  status: "montando",
  placa: null,
  veiculo_tipo: null,
  motorista_nome: null,
  origem_endereco: null,
  origem_lat: null,
  origem_lng: null,
  retornar_origem: false,
  tempo_parada_min: 10,
  distancia_m: 120000,
  duracao_s: 3600,
  rota_geojson: { geometria: [[0, 0], [1, 1]], provedor: "osrm", ruas: true, modo: "tsp" },
  rota_em: "2026-11-12T10:00:00Z",
  rota_versao: 3,
  started_at: null,
  finished_at: null,
};

function mockCarregar(ordemPersistida: string[]) {
  vi.mocked(carregarCargaComParadas).mockResolvedValue({
    carga: carga as never,
    itens: [],
    paradas: ordemPersistida.map((chave, i) => ({
      chave,
      contact_id: null,
      cliente: `Cliente ${i}`,
      fone: null,
      endereco: null,
      latitude: -26.4,
      longitude: -50.2,
      geo_status: "ok",
      geo_fonte: "nominatim:numero",
      pedidos: [],
      itens: [],
      total_cents: 0,
      janela_inicio: null,
      janela_fim: null,
      janela_conflito: false,
      veiculo_id: null,
      motorista_id: null,
      sequencia_veiculo: null,
    })),
  });
}

function put(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/rota/ordem`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("PATCH /api/v1/shipments/[id]/rota/ordem", () => {
  it("com proposta no body grava a geometria enviada (não invalida)", async () => {
    const { cliente, gravados } = banco({ shipments: [carga as never] });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    mockCarregar([PARADA_A, PARADA_B]);

    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/ordem/route");
    const res = await PATCH(
      put({
        ordem: [PARADA_A, PARADA_B],
        geometria: [
          [0, 0],
          [1, 1],
        ],
        provedor: "osrm",
        ruas: true,
        modo: "tsp",
        distancia_m: 120000,
        duracao_s: 3600,
      }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(200);
    const gravado = gravados.find((g) => g.tabela === "shipments");
    expect(gravado).toBeDefined();
    expect((gravado?.carga as { rota_geojson: unknown }).rota_geojson).toEqual({
      geometria: [
        [0, 0],
        [1, 1],
      ],
      provedor: "osrm",
      ruas: true,
      modo: "tsp",
    });
  });

  it("reordena manualmente sem proposta: invalida a geometria antiga", async () => {
    const { cliente, gravados } = banco({ shipments: [carga as never] });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    mockCarregar([PARADA_A, PARADA_B]);

    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/ordem/route");
    const res = await PATCH(
      put({ ordem: [PARADA_B, PARADA_A], retornar_origem: false, tempo_parada_min: 10 }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(200);
    const gravado = gravados.find((g) => g.tabela === "shipments");
    const payload = gravado?.carga as { rota_geojson: unknown; distancia_m: number | null; duracao_s: number | null };
    expect(payload.rota_geojson).toBeNull();
    expect(payload.distancia_m).toBeNull();
    expect(payload.duracao_s).toBeNull();
  });

  it("ordem igual (só ajuste de config) sem proposta não invalida", async () => {
    const { cliente, gravados } = banco({ shipments: [carga as never] });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    mockCarregar([PARADA_A, PARADA_B]);

    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/ordem/route");
    const res = await PATCH(
      put({ ordem: [PARADA_A, PARADA_B], retornar_origem: true, tempo_parada_min: 12 }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(200);
    const gravado = gravados.find((g) => g.tabela === "shipments");
    const payload = gravado?.carga as { rota_geojson?: unknown; distancia_m?: number | null; duracao_s?: number | null };
    // Sem proposta e sem mudança de sequência: nada invalida — a rota salva
    // continua valendo (só mudou o que o body trouxe).
    expect(payload.rota_geojson).toBeUndefined();
    expect(payload.distancia_m).toBeUndefined();
  });
});
