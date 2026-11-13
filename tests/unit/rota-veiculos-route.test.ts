/**
 * POST /api/v1/shipments/[id]/rota/otimizar/veiculos — F5.
 *
 * Defeitos que este teste impede de voltar (todos existiram nesta branch):
 * 1. rota sem `origem`: o solver usava a PRIMEIRA entrega como depósito e a
 *    excluía — uma parada desaparecia do roteiro;
 * 2. `peso_kg: 0` fixo: a restrição de capacidade nunca podia valer;
 * 3. `sem_solucao` devolvido como 502 de infraestrutura, sem motivo;
 * 4. parada sem coordenada sumindo em silêncio.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { otimizarVRPTW } from "@/lib/expedicao/roteador-vrptw";
import { createClient } from "@/lib/supabase/server";
import { carregarCargaComParadas } from "@/app/api/v1/shipments/[id]/rota/_carga";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/expedicao/roteador-vrptw", () => ({ otimizarVRPTW: vi.fn() }));
vi.mock("@/app/api/v1/shipments/[id]/rota/_carga", () => ({ carregarCargaComParadas: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";

const carga = {
  id: CARGA,
  numero: 40,
  status: "montando",
  placa: "ABC1D23",
  veiculo_tipo: "truck",
  motorista_nome: "João",
  origem_endereco: "Rua da Sede, 10",
  origem_lat: -26.4,
  origem_lng: -51.3,
  retornar_origem: false,
  tempo_parada_min: 15,
  distancia_m: null,
  duracao_s: null,
  rota_geojson: null,
  rota_em: null,
  rota_versao: 1,
  started_at: null,
  finished_at: null,
};

function parada(chave: string, latitude: number | null, longitude: number | null) {
  return {
    chave,
    contact_id: null,
    cliente: `Cliente ${chave}`,
    fone: null,
    endereco: "Rua X, 1",
    latitude,
    longitude,
    geo_status: latitude == null ? "pendente" : "ok",
    geo_fonte: null,
    pedidos: [{ shipment_order_id: `so-${chave}`, order_id: `o-${chave}`, numero: 1, total_cents: 0, status: "ativo" }],
    itens: [],
    total_cents: 0,
  };
}

function mockCarga() {
  vi.mocked(carregarCargaComParadas).mockResolvedValue({
    carga: carga as never,
    itens: [
      {
        shipment_order_id: "so-p1",
        order_id: "o-p1",
        sequencia: 1,
        status: "ativo",
        numero: 1,
        cliente_nome: "Cliente p1",
        contact_id: null,
        contato_nome: null,
        fone: null,
        endereco_entrega: "Rua X, 1",
        latitude: -26.41,
        longitude: -51.31,
        geo_status: "ok",
        geo_fonte: null,
        total_cents: 0,
        itens: [{ codigo: "P1", nome: "Produto 1", quantidade: 2, peso_unit_kg: 5, volume_unit_m3: 0.1 }],
      },
      {
        shipment_order_id: "so-p2",
        order_id: "o-p2",
        sequencia: 2,
        status: "ativo",
        numero: 2,
        cliente_nome: "Cliente p2",
        contact_id: null,
        contato_nome: null,
        fone: null,
        endereco_entrega: "Rua Y, 2",
        latitude: -26.42,
        longitude: -51.32,
        geo_status: "ok",
        geo_fonte: null,
        total_cents: 0,
        itens: [{ codigo: "P2", nome: "Produto 2", quantidade: 1, peso_unit_kg: null, volume_unit_m3: null }],
      },
    ],
    paradas: [parada("p1", -26.41, -51.31), parada("p2", -26.42, -51.32), parada("p3", null, null)],
  });
}

function banco() {
  const proto: Record<string, unknown> = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    then(ok: (v: unknown) => void) {
      return Promise.resolve({ data: [], error: null }).then(ok);
    },
  };
  return {
    from: () => proto,
  };
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

function post(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/rota/otimizar/veiculos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const respostaOtimizada = {
  org_id: ORG,
  status: "otimizado" as const,
  veiculos: [
    {
      veiculo_id: "ABC1D23",
      paradas: ["p1", "p2"],
      distancia_m: 1000,
      duracao_s: 600,
      duracao_com_paradas_s: 1800,
      carga_kg: 10,
      carga_m3: 0.2,
      geometria: [
        [-51.3, -26.4],
        [-51.31, -26.41],
        [-51.32, -26.42],
      ],
    },
  ],
  total_paradas: 2,
  entregas_nao_alocadas: [],
  restricoes_nao_aplicadas: ["janelas_de_entrega_sem_dados"],
  tempo_total_s: 1800,
  tempo_execucao_ms: 30,
  versao_algoritmo: "ortools-vrptw-1",
  matriz_provedor: "osrm",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
  vi.mocked(createClient).mockReturnValue(banco() as never);
  mockCarga();
});

describe("POST /api/v1/shipments/[id]/rota/otimizar/veiculos", () => {
  it("manda a origem da carga e TODAS as paradas (a primeira não vira depósito)", async () => {
    vi.mocked(otimizarVRPTW).mockResolvedValue(respostaOtimizada);

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/otimizar/veiculos/route");
    const res = await POST(
      post({ veiculos: [{ veiculo_id: "ABC1D23", capacidade_kg: 1000 }] }),
      { params: Promise.resolve({ id: CARGA }) },
    );

    expect(res.status).toBe(200);
    const chamada = vi.mocked(otimizarVRPTW).mock.calls[0]?.[0];
    expect(chamada?.origem).toEqual({ node_id: "__base__", latitude: -26.4, longitude: -51.3 });
    expect(chamada?.pontos.map((p) => p.node_id)).toEqual(["p1", "p2"]);
    expect(chamada?.retornarOrigem).toBe(false);
  });

  it("leva peso e volume reais de cada parada e declara o que falta de dado", async () => {
    vi.mocked(otimizarVRPTW).mockResolvedValue(respostaOtimizada);

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/otimizar/veiculos/route");
    const res = await POST(
      post({ veiculos: [{ veiculo_id: "ABC1D23", capacidade_kg: 1000 }] }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    const corpo = (await res.json()) as {
      data: { restricoes_nao_aplicadas: string[]; nao_roteirizaveis: { chave: string }[]; total_kg: number };
    };

    const chamada = vi.mocked(otimizarVRPTW).mock.calls[0]?.[0];
    expect(chamada?.pontos.find((p) => p.node_id === "p1")?.peso_kg).toBe(10);
    expect(chamada?.pontos.find((p) => p.node_id === "p1")?.volume_m3).toBe(0.2);
    // p2 tem produto sem peso no cadastro: zero fingido não pode aparecer.
    expect(chamada?.pontos.find((p) => p.node_id === "p2")?.peso_kg).toBe(0);
    expect(corpo.data.restricoes_nao_aplicadas).toContain("peso_de_produto_incompleto");
    expect(corpo.data.total_kg).toBe(10);
    // Parada sem coordenada não desaparece: volta identificada.
    expect(corpo.data.nao_roteirizaveis.map((p) => p.chave)).toEqual(["p3"]);
  });

  it("sem origem na carga e sem body: 422 e o solver nem é chamado", async () => {
    vi.mocked(carregarCargaComParadas).mockResolvedValue({
      carga: { ...carga, origem_lat: null, origem_lng: null, origem_endereco: null } as never,
      itens: [],
      paradas: [parada("p1", -26.41, -51.31)],
    });

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/otimizar/veiculos/route");
    const res = await POST(post({}), { params: Promise.resolve({ id: CARGA }) });

    expect(res.status).toBe(422);
    expect(otimizarVRPTW).not.toHaveBeenCalled();
  });

  it("sem solução devolve 422 com motivo e não alocadas (não é 502)", async () => {
    vi.mocked(otimizarVRPTW).mockResolvedValue({
      ...respostaOtimizada,
      status: "sem_solucao",
      veiculos: [],
      total_paradas: 0,
      entregas_nao_alocadas: ["p1", "p2"],
      motivo: "capacidade_peso",
    });

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/otimizar/veiculos/route");
    const res = await POST(
      post({ veiculos: [{ veiculo_id: "ABC1D23", capacidade_kg: 1 }] }),
      { params: Promise.resolve({ id: CARGA }) },
    );

    expect(res.status).toBe(422);
    const corpo = (await res.json()) as {
      error: { code: string; details: { motivo: string; entregas_nao_alocadas: string[] } };
    };
    expect(corpo.error.code).toBe("unprocessable_entity");
    expect(corpo.error.details.motivo).toBe("capacidade_peso");
    expect(corpo.error.details.entregas_nao_alocadas).toEqual(["p1", "p2"]);
  });

  it("serviço fora do ar devolve 503 upstream_unavailable", async () => {
    const erro = new Error("sem servico");
    erro.name = "SolverIndisponivelError";
    vi.mocked(otimizarVRPTW).mockRejectedValue(erro);

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/otimizar/veiculos/route");
    const res = await POST(
      post({ veiculos: [{ veiculo_id: "ABC1D23", capacidade_kg: 1000 }] }),
      { params: Promise.resolve({ id: CARGA }) },
    );

    expect(res.status).toBe(503);
    const corpo = (await res.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("upstream_unavailable");
  });
});
