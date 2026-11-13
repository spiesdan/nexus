/**
 * PATCH /api/v1/shipments/[id]/rota/distribuicao — confirmação da distribuição.
 *
 * É a rota que fecha o laço do F5: sem ela o VRPTW devolvia a distribuição e ela
 * morria na resposta HTTP. O que este teste impede de voltar:
 * 1. confirmação que não cobre todas as paradas (parada some da rota);
 * 2. capacidade/jornada "respeitadas" pelo body em vez do banco;
 * 3. veículo/motorista de outra organização aceito por confiança;
 * 4. duas telas sobrescrevendo a rota uma da outra (sem lock otimista);
 * 5. versão gravada sem a atribuição dos pedidos (romaneio mentindo).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { carregarCargaComParadas } from "@/app/api/v1/shipments/[id]/rota/_carga";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/app/api/v1/shipments/[id]/rota/_carga", () => ({ carregarCargaComParadas: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";
const V1 = "44444444-4444-4444-8444-444444444444";
const M1 = "55555555-5555-4555-8555-555555555555";

type Pedido = {
  shipment_order_id: string;
  order_id: string;
  numero: number;
  total_cents: number;
  status: string;
};

function parada(chave: string, pedidos: Pedido[]) {
  return {
    chave,
    contact_id: null,
    cliente: `Cliente ${chave}`,
    fone: null,
    endereco: "Rua X, 1",
    latitude: -26.4,
    longitude: -51.3,
    geo_status: "ok",
    geo_fonte: null,
    pedidos,
    itens: [],
    total_cents: 0,
    janela_inicio: null,
    janela_fim: null,
    janela_conflito: false,
    veiculo_id: null,
    motorista_id: null,
    sequencia_veiculo: null,
  };
}

function carga(over: Record<string, unknown> = {}) {
  return {
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
    saida_prevista: null,
    started_at: null,
    finished_at: null,
    ...over,
  };
}

/** 2 × 10 kg e 2 × 0,5 m³ na parada c1; 1 × 5 kg em c2. */
function dadosDaCarga(over: { carga?: Record<string, unknown> } = {}) {
  return {
    carga: carga(over.carga),
    itens: [
      {
        shipment_order_id: "so1",
        order_id: "o1",
        numero: 1,
        total_cents: 0,
        itens: [{ codigo: "P1", nome: "P1", quantidade: 2, peso_unit_kg: 10, volume_unit_m3: 0.5 }],
      },
      {
        shipment_order_id: "so2",
        order_id: "o2",
        numero: 2,
        total_cents: 0,
        itens: [{ codigo: "P2", nome: "P2", quantidade: 1, peso_unit_kg: 5, volume_unit_m3: 0.1 }],
      },
    ],
    paradas: [
      parada("c1", [
        { shipment_order_id: "so1", order_id: "o1", numero: 1, total_cents: 0, status: "ativo" },
      ]),
      parada("c2", [
        { shipment_order_id: "so2", order_id: "o2", numero: 2, total_cents: 0, status: "ativo" },
      ]),
    ],
  };
}

type OpcoesDoBanco = {
  veiculos?: Record<string, unknown>[];
  motoristas?: Record<string, unknown>[];
  /** false simula outra sessão confirmando entre o SELECT e o UPDATE. */
  atualizou?: boolean;
  erroVersao?: { code: string } | null;
  erroAtribuicao?: boolean;
};

function banco(opts: OpcoesDoBanco = {}) {
  const registros: { tabela: string; op: string; payload?: unknown }[] = [];
  const veiculoPadrao = {
    id: V1,
    placa: "ABC1D23",
    capacidade_kg: 1000,
    capacidade_m3: 10,
    ativo: true,
  };
  const motoristaPadrao = {
    id: M1,
    nome: "João",
    capacidade_jornada_min: 480,
    ativo: true,
  };
  const construtor = (tabela: string) => {
    let op = "";
    let payload: unknown;
    const b = {
      select() {
        if (!op) op = "select";
        return b;
      },
      insert(p: unknown) {
        op = "insert";
        payload = p;
        return b;
      },
      update(p: unknown) {
        op = "update";
        payload = p;
        return b;
      },
      eq() {
        return b;
      },
      neq() {
        return b;
      },
      in(_coluna: string, valores: unknown) {
        registros.push({ tabela, op: "in", payload: valores });
        const lista =
          tabela === "fleet_vehicles"
            ? (opts.veiculos ?? [veiculoPadrao])
            : tabela === "fleet_drivers"
              ? (opts.motoristas ?? [motoristaPadrao])
              : [];
        const ids = valores as string[];
        return Promise.resolve({
          data: lista.filter((x) => ids.includes(x.id as string)),
          error: null,
        });
      },
      order() {
        return b;
      },
      maybeSingle() {
        registros.push({ tabela, op, payload });
        if (tabela === "shipments") {
          return Promise.resolve({ data: opts.atualizou === false ? null : { id: CARGA }, error: null });
        }
        if (tabela === "shipment_orders") {
          return Promise.resolve({
            data: opts.erroAtribuicao ? null : { id: "so1" },
            error: opts.erroAtribuicao ? { code: "23503" } : null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        registros.push({ tabela, op, payload });
        if (tabela === "shipment_route_versions") {
          return Promise.resolve({
            data: opts.erroVersao ? null : { id: "versao-1", versao: 2, criado_em: "2026-11-12T10:00:00Z" },
            error: opts.erroVersao ?? null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(ok: (v: unknown) => void) {
        registros.push({ tabela, op, payload });
        return Promise.resolve({
          data: null,
          error: opts.erroAtribuicao ? { code: "23503" } : null,
        }).then(ok);
      },
    };
    return b;
  };
  return { client: { from: construtor }, registros };
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

function patch(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/rota/distribuicao`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const corpoValido = {
  versao_base: 1,
  veiculos: [
    {
      veiculo_id: V1,
      motorista_id: M1,
      paradas: ["c1", "c2"],
      chegadas_s: [600, 1800],
      distancia_m: 1200,
      duracao_s: 1800,
      geometria: [
        [-51.3, -26.4],
        [-51.31, -26.41],
      ],
    },
  ],
  saida_prevista: "08:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
  vi.mocked(createClient).mockReturnValue(banco().client as never);
  vi.mocked(carregarCargaComParadas).mockResolvedValue(dadosDaCarga() as never);
});

describe("PATCH /api/v1/shipments/[id]/rota/distribuicao", () => {
  it("grava a versão, a atribuição e a saída prevista", async () => {
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { versao: number; rota_versao: number; veiculos: { carga_kg: number }[] };
    };
    expect(corpo.data.rota_versao).toBe(2);
    expect(corpo.data.veiculos[0]?.carga_kg).toBe(25);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "shipment.rota.distribuida", resourceId: CARGA }),
    );
  });

  it("manda ao banco a versão nova e o saida_prevista do corpo", async () => {
    const fake = banco();
    vi.mocked(createClient).mockReturnValue(fake.client as never);
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });

    const updateDaCarga = fake.registros.find(
      (r) => r.tabela === "shipments" && r.op === "update",
    );
    expect(updateDaCarga?.payload).toMatchObject({ rota_versao: 2, saida_prevista: "08:00" });

    const insertDaVersao = fake.registros.find(
      (r) => r.tabela === "shipment_route_versions" && r.op === "insert",
    );
    expect(insertDaVersao?.payload).toMatchObject({ versao: 2, ativa: true });
  });

  it("recusa distribuição que não cobre todas as paradas", async () => {
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(
      patch({ ...corpoValido, veiculos: [{ veiculo_id: V1, paradas: ["c1"] }] }),
      { params: Promise.resolve({ id: CARGA }) },
    );

    expect(res.status).toBe(422);
    expect(audit).not.toHaveBeenCalled();
  });

  it("recusa a mesma parada em dois veículos", async () => {
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(
      patch({
        ...corpoValido,
        veiculos: [
          { veiculo_id: V1, paradas: ["c1", "c2"] },
          { veiculo_id: null, paradas: ["c2"] },
        ],
      }),
      { params: Promise.resolve({ id: CARGA }) },
    );

    expect(res.status).toBe(422);
  });

  it("recusa veículo que não existe nesta organização", async () => {
    vi.mocked(createClient).mockReturnValue(banco({ veiculos: [] }).client as never);
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });

    expect(res.status).toBe(422);
  });

  it("recusa veículo inativo", async () => {
    vi.mocked(createClient).mockReturnValue(
      banco({
        veiculos: [{ id: V1, placa: "ABC1D23", capacidade_kg: 1000, capacidade_m3: 10, ativo: false }],
      }).client as never,
    );
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });
    const corpo = (await res.json()) as { error: { message: string } };

    expect(res.status).toBe(422);
    expect(corpo.error.message).toContain("inativo");
  });

  it("não grava carga acima da capacidade do veículo (revalida no servidor)", async () => {
    vi.mocked(createClient).mockReturnValue(
      banco({
        veiculos: [{ id: V1, placa: "ABC1D23", capacidade_kg: 5, capacidade_m3: 10, ativo: true }],
      }).client as never,
    );
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });
    const corpo = (await res.json()) as {
      error: { details: { excedentes: { campo: string }[] } };
    };

    expect(res.status).toBe(422);
    expect(corpo.error.details.excedentes[0]?.campo).toBe("capacidade_kg");
  });

  it("não grava jornada acima da cadastrada para o motorista", async () => {
    vi.mocked(createClient).mockReturnValue(
      banco({
        motoristas: [{ id: M1, nome: "João", capacidade_jornada_min: 20, ativo: true }],
      }).client as never,
    );
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });
    const corpo = (await res.json()) as {
      error: { details: { excedentes: { campo: string }[] } };
    };

    expect(res.status).toBe(422);
    expect(corpo.error.details.excedentes[0]?.campo).toBe("jornada");
  });

  it("409 quando a tela está com uma versão velha", async () => {
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(
      patch({ ...corpoValido, versao_base: 0 }),
      { params: Promise.resolve({ id: CARGA }) },
    );

    expect(res.status).toBe(409);
    const corpo = (await res.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("state_conflict");
  });

  it("409 quando outra sessão confirma entre o SELECT e o UPDATE (lock no banco)", async () => {
    vi.mocked(createClient).mockReturnValue(banco({ atualizou: false }).client as never);
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });

    expect(res.status).toBe(409);
    expect(audit).not.toHaveBeenCalled();
  });

  it("recusa ETA fora de sincronia com as paradas", async () => {
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(
      patch({
        ...corpoValido,
        veiculos: [{ ...corpoValido.veiculos[0], chegadas_s: [600] }],
      }),
      { params: Promise.resolve({ id: CARGA }) },
    );

    expect(res.status).toBe(422);
  });

  it("aceita o veículo legado da carga e declara a capacidade sem dado", async () => {
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(
      patch({
        versao_base: 1,
        veiculos: [{ veiculo_id: null, paradas: ["c1", "c2"] }],
        saida_prevista: null,
      }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    const corpo = (await res.json()) as { data: { restricoes_nao_aplicadas: string[] } };

    expect(res.status).toBe(200);
    expect(corpo.data.restricoes_nao_aplicadas).toContain("capacidade_sem_dado_do_veiculo");
  });

  it("recusa carga concluída (histórico não muda)", async () => {
    vi.mocked(carregarCargaComParadas).mockResolvedValue(
      dadosDaCarga({ carga: { status: "concluida" } }) as never,
    );
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });

    expect(res.status).toBe(422);
  });

  it("falha na atribuição é dita, não escondida (versão gravada sem romaneio)", async () => {
    vi.mocked(createClient).mockReturnValue(banco({ erroAtribuicao: true }).client as never);
    const { PATCH } = await import("@/app/api/v1/shipments/[id]/rota/distribuicao/route");
    const res = await PATCH(patch(corpoValido), { params: Promise.resolve({ id: CARGA }) });

    expect(res.status).toBe(500);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("atribuição");
  });
});
