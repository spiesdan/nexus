/**
 * Gate do Address Recovery Engine em POST /rota/otimizar.
 *
 * A regra que este arquivo protege: **não se otimiza rota com endereço não
 * resolvido**. O custo de mandar o motorista ao lugar errado é maior que o de
 * pedir ao operador que confirme um endereço.
 *
 * Do outro lado, a coluna nova (0309) não pode parar cargas que já existiam:
 * destino com pino válido nunca bloqueia, mesmo com `recuperacao_status` ainda
 * `nao_tentada`. É o par de asserções abaixo.
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
vi.mock("@/lib/rotas/osrm", () => ({
  OsmrmProvider: class {
    async rota(pontos: Array<{ lat: number; lng: number }>) {
      return {
        distanciaM: 1000 * Math.max(0, pontos.length - 1),
        duracaoS: 120 * Math.max(0, pontos.length - 1),
        geometria: pontos.map((p) => [p.lat, p.lng]),
        provedor: "osrm",
        ruas: true,
      };
    }
  },
  otimizarComFallback: vi.fn(async (provider: { rota: (p: unknown) => Promise<unknown> }, pontos: unknown) =>
    provider.rota(pontos)
  ),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";
const DEST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Gravado = { tabela: string; operacao: string; carga: Record<string, unknown> };

function banco(linhas: Record<string, Record<string, unknown>[]>) {
  const gravados: Gravado[] = [];
  const proto: Record<string, unknown> = {
    __tabela: "",
    __filtros: {} as Record<string, unknown>,
    select(this: Record<string, unknown>) {
      return this;
    },
    eq(this: Record<string, unknown>, coluna: string, valor: unknown) {
      (this.__filtros as Record<string, unknown>)[coluna] = valor;
      return this;
    },
    in(this: Record<string, unknown>) {
      return this;
    },
    order(this: Record<string, unknown>) {
      return this;
    },
    maybeSingle(this: Record<string, unknown>) {
      const filtros = this.__filtros as Record<string, unknown>;
      const candidatos = (linhas[this.__tabela as string] ?? []).filter((l) =>
        Object.entries(filtros).every(([c, v]) => l[c] === v)
      );
      return Promise.resolve({ data: candidatos[0] ?? null, error: null });
    },
    then(this: Record<string, unknown>, ok: (v: unknown) => void) {
      const filtros = this.__filtros as Record<string, unknown>;
      const filtrados = (linhas[this.__tabela as string] ?? []).filter((l) =>
        Object.entries(filtros).every(([c, v]) => l[c] === v)
      );
      return Promise.resolve({ data: filtrados, error: null }).then(ok);
    },
    insert(this: Record<string, unknown>, carga: Record<string, unknown>) {
      gravados.push({ tabela: this.__tabela as string, operacao: "insert", carga });
      return Promise.resolve({ data: null, error: null });
    },
    update(this: Record<string, unknown>, carga: Record<string, unknown>) {
      gravados.push({ tabela: this.__tabela as string, operacao: "update", carga });
      return this;
    },
  };
  const cliente = {
    from: (tabela: string) => {
      const cadeia = Object.create(proto);
      cadeia.__tabela = tabela;
      cadeia.__filtros = {};
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
      : { ok: false, response: fail("forbidden_role", "no.", 403, {}) }
  );
}

const carga = {
  id: CARGA,
  numero: 22,
  status: "montando",
  placa: null,
  veiculo_tipo: null,
  motorista_nome: null,
  origem_endereco: "Base",
  origem_lat: -26.17,
  origem_lng: -50.39,
  retornar_origem: false,
  tempo_parada_min: 10,
  distancia_m: null,
  duracao_s: null,
  rota_geojson: null,
  rota_em: null,
  rota_versao: 1,
  started_at: null,
  finished_at: null,
};

function parada(destinationId: string, lat: number | null, lng: number | null) {
  return {
    chave: `chave-${destinationId}`,
    contact_id: null,
    cliente: "Cliente",
    fone: null,
    endereco: "Rua X, 1",
    latitude: lat,
    longitude: lng,
    geo_status: lat != null ? "ok" : "pendente",
    geo_fonte: lat != null ? "nominatim:numero" : null,
    pedidos: [],
    itens: [],
    total_cents: 0,
    janela_inicio: null,
    janela_fim: null,
    janela_conflito: false,
    veiculo_id: null,
    motorista_id: null,
    sequencia_veiculo: null,
    destination_id: destinationId,
  };
}

function post(corpo: unknown = {}) {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/rota/otimizar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function chamar(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/shipments/[id]/rota/otimizar/route");
  return POST(post(corpo), { params: Promise.resolve({ id: CARGA }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("gate de destino não resolvido", () => {
  it("422 com a lista de pendentes quando há destino sem pino válido", async () => {
    const { cliente } = banco({
      shipment_destinations: [
        {
          id: DEST_A,
          organization_id: ORG,
          chave: `chave-${DEST_A}`,
          recuperacao_status: "nao_tentada",
          endereco_original: "Rua X, 1",
          endereco_recuperado: null,
          latitude: null,
          longitude: null,
          geo_status: "pendente",
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    vi.mocked(carregarCargaComParadas).mockResolvedValue({
      carga: carga as never,
      itens: [],
      paradas: [parada(DEST_A, -26.2, -50.2)] as never,
    });

    const res = await chamar({ modo: "distancia" });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as {
      error?: { message?: string; details?: { pendentes?: Array<{ destinationId: string }> } };
    };
    expect(corpo.error?.message).toContain("Recupere os endereços");
    expect(corpo.error?.details?.pendentes?.[0]?.destinationId).toBe(DEST_A);
  });

  it("destino com pino válido NÃO bloqueia (carga antiga continua roteirizável)", async () => {
    const { cliente } = banco({
      shipment_destinations: [
        {
          id: DEST_A,
          organization_id: ORG,
          chave: `chave-${DEST_A}`,
          recuperacao_status: "nao_tentada",
          endereco_original: "Rua X, 1",
          endereco_recuperado: null,
          latitude: -26.2,
          longitude: -50.2,
          geo_status: "ok",
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    vi.mocked(carregarCargaComParadas).mockResolvedValue({
      carga: carga as never,
      itens: [],
      paradas: [parada(DEST_A, -26.2, -50.2)] as never,
    });

    const res = await chamar({ modo: "distancia" });
    expect(res.status).toBe(200);
  });

  it("`ignorar_pendentes` libera a rota e o destino entra em nao_roteirizaveis", async () => {
    const { cliente } = banco({
      shipment_destinations: [
        {
          id: DEST_A,
          organization_id: ORG,
          chave: `chave-${DEST_A}`,
          recuperacao_status: "nao_tentada",
          endereco_original: "Rua X, 1",
          endereco_recuperado: null,
          latitude: null,
          longitude: null,
          geo_status: "pendente",
        },
        {
          id: DEST_B,
          organization_id: ORG,
          chave: `chave-${DEST_B}`,
          recuperacao_status: "encontrado",
          endereco_original: "Rua Y, 2",
          endereco_recuperado: null,
          latitude: -26.3,
          longitude: -50.3,
          geo_status: "ok",
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    vi.mocked(carregarCargaComParadas).mockResolvedValue({
      carga: carga as never,
      itens: [],
      paradas: [parada(DEST_A, null, null), parada(DEST_B, -26.3, -50.3)] as never,
    });

    const res = await chamar({ modo: "distancia", ignorar_pendentes: true });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data?: { nao_roteirizaveis?: string[] } };
    expect(corpo.data?.nao_roteirizaveis).toContain(`chave-${DEST_A}`);
  });

  it("destino `ambiguo` SEM pino bloqueia igual a `nao_tentada`", async () => {
    const { cliente } = banco({
      shipment_destinations: [
        {
          id: DEST_A,
          organization_id: ORG,
          chave: `chave-${DEST_A}`,
          recuperacao_status: "ambiguo",
          endereco_original: "Rua X, 1",
          endereco_recuperado: "Rua X, 100",
          latitude: null,
          longitude: null,
          geo_status: "pendente",
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    vi.mocked(carregarCargaComParadas).mockResolvedValue({
      carga: carga as never,
      itens: [],
      paradas: [parada(DEST_A, -26.2, -50.2)] as never,
    });

    const res = await chamar({ modo: "distancia" });
    expect(res.status).toBe(422);
  });
});
