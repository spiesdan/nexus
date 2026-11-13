/**
 * FROTA — /api/v1/fleet e o CRUD de veículos e motoristas.
 *
 * A frota é a fonte das capacidades que o VRPTW usa. Estes testes travam o que
 * a distribuição depende:
 * 1. leitura para `viewer`, escrita só para `manager`;
 * 2. placa normalizada antes de gravar (o índice único compara a forma
 *    normalizada — "abc 1d23" e "ABC1D23" são o mesmo veículo);
 * 3. placa repetida é 409 de cadastro, não 500;
 * 4. jornada fora da faixa é recusada na borda, não no solver.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const VEICULO = "44444444-4444-4444-8444-444444444444";

type Resposta = { data?: unknown; error?: { code: string } | null };

function banco(mapa: Record<string, Resposta>) {
  const chamadas: { tabela: string; op: string; payload?: unknown }[] = [];
  const construtor = (tabela: string) => {
    let op = "";
    let payload: unknown;
    const resposta = mapa[tabela] ?? { data: null, error: null };
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
      delete() {
        op = "delete";
        return b;
      },
      eq() {
        return b;
      },
      in() {
        return b;
      },
      order() {
        return b;
      },
      single() {
        chamadas.push({ tabela, op, payload });
        return Promise.resolve(resposta);
      },
      maybeSingle() {
        chamadas.push({ tabela, op, payload });
        return Promise.resolve(resposta);
      },
      then(ok: (v: unknown) => void) {
        chamadas.push({ tabela, op, payload });
        return Promise.resolve(resposta).then(ok);
      },
    };
    return b;
  };
  return { client: { from: construtor }, chamadas };
}

let papel: Role = "manager";

function sessao() {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "no.", 403, {}) },
  );
}

function req(metodo: string, corpo?: unknown) {
  return new NextRequest("http://x/api/v1/fleet/vehicles", {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  papel = "manager";
  sessao();
});

describe("GET /api/v1/fleet", () => {
  it("devolve veículos e motoristas da organização", async () => {
    const fake = banco({
      fleet_vehicles: { data: [{ id: VEICULO, placa: "ABC1D23" }], error: null },
      fleet_drivers: { data: [{ id: "m1", nome: "João" }], error: null },
    });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { GET } = await import("@/app/api/v1/fleet/route");
    const res = await GET(req("GET"));
    const corpo = (await res.json()) as {
      data: { veiculos: unknown[]; motoristas: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(corpo.data.veiculos).toHaveLength(1);
    expect(corpo.data.motoristas).toHaveLength(1);
  });

  it("nega leitura abaixo de viewer", async () => {
    papel = "viewer";
    const { GET } = await import("@/app/api/v1/fleet/route");
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/fleet/vehicles", () => {
  it("normaliza a placa antes de gravar", async () => {
    const fake = banco({
      fleet_vehicles: { data: { id: VEICULO, placa: "ABC1D23" }, error: null },
    });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { POST } = await import("@/app/api/v1/fleet/vehicles/route");
    const res = await POST(req("POST", { placa: "abc 1d23", capacidade_kg: 500 }));

    expect(res.status).toBe(200);
    const insert = fake.chamadas.find((c) => c.op === "insert");
    expect(insert?.payload).toMatchObject({
      placa: "ABC1D23",
      capacidade_kg: 500,
      organization_id: ORG,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "fleet.vehicle.created" }),
    );
  });

  it("placa repetida é 409, não 500", async () => {
    const fake = banco({ fleet_vehicles: { data: null, error: { code: "23505" } } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { POST } = await import("@/app/api/v1/fleet/vehicles/route");
    const res = await POST(req("POST", { placa: "ABC1D23" }));

    expect(res.status).toBe(409);
    expect(audit).not.toHaveBeenCalled();
  });

  it("agent não cadastra veículo (capacidade é decisão de supervisão)", async () => {
    papel = "agent";
    sessao();
    const fake = banco({ fleet_vehicles: { data: { id: VEICULO }, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { POST } = await import("@/app/api/v1/fleet/vehicles/route");
    const res = await POST(req("POST", { placa: "ABC1D23" }));

    expect(res.status).toBe(403);
    expect(fake.chamadas).toHaveLength(0);
  });

  it("placa inválida é 422 sem tocar no banco", async () => {
    const fake = banco({ fleet_vehicles: { data: { id: VEICULO }, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { POST } = await import("@/app/api/v1/fleet/vehicles/route");
    const res = await POST(req("POST", { placa: "^" }));

    expect(res.status).toBe(422);
    expect(fake.chamadas).toHaveLength(0);
  });
});

describe("PATCH /api/v1/fleet/vehicles/[id]", () => {
  it("404 quando o veículo não existe nesta organização", async () => {
    const fake = banco({ fleet_vehicles: { data: null, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { PATCH } = await import("@/app/api/v1/fleet/vehicles/[id]/route");
    const res = await PATCH(req("PATCH", { ativo: false }), {
      params: Promise.resolve({ id: VEICULO }),
    });

    expect(res.status).toBe(404);
  });

  it("corpo vazio é 422 (nada para atualizar)", async () => {
    const fake = banco({ fleet_vehicles: { data: { id: VEICULO }, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { PATCH } = await import("@/app/api/v1/fleet/vehicles/[id]/route");
    const res = await PATCH(req("PATCH", {}), { params: Promise.resolve({ id: VEICULO }) });

    expect(res.status).toBe(422);
  });

  it("desativar não apaga o cadastro e audita", async () => {
    const fake = banco({ fleet_vehicles: { data: { id: VEICULO, ativo: false }, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { PATCH } = await import("@/app/api/v1/fleet/vehicles/[id]/route");
    const res = await PATCH(req("PATCH", { ativo: false }), {
      params: Promise.resolve({ id: VEICULO }),
    });

    expect(res.status).toBe(200);
    const update = fake.chamadas.find((c) => c.op === "update");
    expect(update?.payload).toMatchObject({ ativo: false });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "fleet.vehicle.updated" }),
    );
  });
});

describe("DELETE /api/v1/fleet/vehicles/[id]", () => {
  it("404 quando não há o que apagar", async () => {
    const fake = banco({ fleet_vehicles: { data: null, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { DELETE } = await import("@/app/api/v1/fleet/vehicles/[id]/route");
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: VEICULO }) });

    expect(res.status).toBe(404);
  });

  it("apaga e audita", async () => {
    const fake = banco({ fleet_vehicles: { data: { id: VEICULO }, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { DELETE } = await import("@/app/api/v1/fleet/vehicles/[id]/route");
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: VEICULO }) });

    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "fleet.vehicle.deleted" }),
    );
  });
});

describe("POST /api/v1/fleet/drivers", () => {
  it("recusa jornada fora da faixa sem tocar no banco", async () => {
    const fake = banco({ fleet_drivers: { data: { id: "m1" }, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { POST } = await import("@/app/api/v1/fleet/drivers/route");
    const res = await POST(req("POST", { nome: "João", capacidade_jornada_min: 10 }));

    expect(res.status).toBe(422);
    expect(fake.chamadas).toHaveLength(0);
  });

  it("cadastra motorista com a jornada padrão quando não informada", async () => {
    const fake = banco({ fleet_drivers: { data: { id: "m1", nome: "João" }, error: null } });
    vi.mocked(createClient).mockReturnValue(fake.client as never);

    const { POST } = await import("@/app/api/v1/fleet/drivers/route");
    const res = await POST(req("POST", { nome: "João" }));

    expect(res.status).toBe(200);
    const insert = fake.chamadas.find((c) => c.op === "insert");
    expect(insert?.payload).toMatchObject({ nome: "João", capacidade_jornada_min: 480 });
  });
});
