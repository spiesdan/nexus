/**
 * Rotas do Address Recovery Engine — `recuperar` e as ações humanas.
 *
 * O que se mede aqui é o que pode causar dano em produção:
 *
 *   1. `recuperar` não inventa destino nem sobrescreve `endereco_original`;
 *   2. `confirmar` grava o ponto escolhido pelo operador e registra o histórico;
 *   3. `rejeitar` NÃO apaga o original nem grava coordenada;
 *   4. `reverter` volta ao original, zera o pino e não apaga o histórico;
 *   5. destino de outra carga/org responde 422/404, nunca 200.
 *
 * Nenhum teste toca provedor real: o motor é dublado aqui (o comportamento
 * dele é medido em `lib/rotas/recuperacao/motor.test.ts`).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import type * as Geocodificacao from "@/lib/rotas/geocodificacao";
import { createClient } from "@/lib/supabase/server";
import { carregarCargaComParadas } from "@/app/api/v1/shipments/[id]/rota/_carga";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/app/api/v1/shipments/[id]/rota/_carga", () => ({ carregarCargaComParadas: vi.fn() }));
// O motor roda de verdade: só os PROVEDORES são dublados. Assim o teste mede a
// fiação (snapshot → motor → update/histórico), não um mock de si mesmo.
vi.mock("@/lib/rotas/geocodificacao", async (importOriginal) => {
  const atual = await importOriginal<typeof Geocodificacao>();
  return {
    ...atual,
    geocodificarEndereco: vi.fn(async () => ({
      estado: "nao_encontrado",
      latitude: null,
      longitude: null,
      precisao: null,
    })),
    geocodificarComFallback: vi.fn(async () => ({
      estado: "nao_encontrado",
      latitude: null,
      longitude: null,
      precisao: null,
    })),
  };
});
vi.mock("@/lib/rotas/recuperacao/photon", () => ({
  photonDisponivel: vi.fn(() => false),
  buscarPhoton: vi.fn(async () => []),
  buscarPhotonPorComponentes: vi.fn(async () => []),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";
const DESTINO = "44444444-4444-4444-8444-444444444444";
const OUTRA_CARGA = "55555555-5555-4555-8555-555555555555";

type Gravado = { tabela: string; operacao: string; carga: Record<string, unknown> };

/**
 * Dublê de Supabase: implementa só as cadeias usadas pelas rotas
 * (`select().eq().eq().maybeSingle()`, `select().eq().in()` e `update/insert`).
 */
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
      const tabela = this.__tabela as string;
      const candidatos = (linhas[tabela] ?? []).filter((linha) =>
        Object.entries(filtros).every(([coluna, valor]) => linha[coluna] === valor)
      );
      return Promise.resolve({ data: candidatos[0] ?? null, error: null });
    },
    then(this: Record<string, unknown>, ok: (v: unknown) => void) {
      const filtros = this.__filtros as Record<string, unknown>;
      const tabela = this.__tabela as string;
      const filtrados = (linhas[tabela] ?? []).filter((linha) =>
        Object.entries(filtros).every(([coluna, valor]) => linha[coluna] === valor)
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
  origem_endereco: null,
  origem_lat: null,
  origem_lng: null,
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

function parada(destinationId = DESTINO) {
  return {
    chave: `destino-${destinationId}`,
    contact_id: null,
    cliente: "Cliente",
    fone: null,
    endereco: "Rua A, 100",
    latitude: null,
    longitude: null,
    geo_status: "pendente",
    geo_fonte: null,
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

function mockCarga(paradas = [parada()]) {
  vi.mocked(carregarCargaComParadas).mockResolvedValue({
    carga: carga as never,
    itens: [],
    paradas: paradas as never,
  });
}

function post(url: string, corpo: unknown = {}) {
  return new NextRequest(`http://x${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("POST /rota/recuperar", () => {
  const url = `/api/v1/shipments/${CARGA}/rota/recuperar`;

  it("404 quando a carga não é da organização", async () => {
    const { cliente } = banco({});
    vi.mocked(createClient).mockReturnValue(cliente as never);
    vi.mocked(carregarCargaComParadas).mockResolvedValue(null);

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/recuperar/route");
    const res = await POST(post(url), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(404);
  });

  it("422 quando a carga não tem destinos persistidos (anterior à 0308)", async () => {
    const { cliente } = banco({});
    vi.mocked(createClient).mockReturnValue(cliente as never);
    mockCarga([{ ...parada(), destination_id: null } as never]);

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/recuperar/route");
    const res = await POST(post(url), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error?: { message?: string } };
    expect(corpo.error?.message).toContain("0308");
  });

  it("usa as partes do snapshot e nunca envia endereco_original no update", async () => {
    const { cliente, gravados } = banco({
      shipment_destinations: [
        {
          id: DESTINO,
          organization_id: ORG,
          endereco: "Rua A",
          endereco_original: "Rua A, 100, Centro, Canoinhas/SC",
          numero: "100",
          complemento: null,
          bairro: "Centro",
          cidade: "Canoinhas",
          uf: "SC",
          cep: "89460-000",
          latitude: null,
          longitude: null,
          geo_status: "pendente",
          recuperacao_status: "nao_tentada",
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    mockCarga();

    const { POST } = await import("@/app/api/v1/shipments/[id]/rota/recuperar/route");
    const res = await POST(post(url), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(200);

    const updates = gravados.filter((g) => g.tabela === "shipment_destinations" && g.operacao === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.carga).not.toHaveProperty("endereco_original");
    // O estado que o motor devolveu é o que vai para o banco.
    expect(updates[0]!.carga.recuperacao_status).toBe("nao_encontrado");
    // Sem sugestão, nenhum pino inventado.
    expect(updates[0]!.carga.latitude).toBeNull();
    expect(updates[0]!.carga.longitude).toBeNull();

    // Toda tentativa vira histórico append-only.
    const historico = gravados.filter(
      (g) => g.tabela === "shipment_destination_recoveries" && g.operacao === "insert"
    );
    expect(historico.length).toBeGreaterThan(0);

    // A resposta devolve o resumo para a tela.
    const corpo = (await res.json()) as { data?: { resumo?: { analisados?: number } } };
    expect(corpo.data?.resumo?.analisados).toBe(1);
  });
});

describe("GET /rota/recuperacoes", () => {
  const url = `/api/v1/shipments/${CARGA}/rota/recuperacoes`;

  it("devolve a última sugestão COM coordenada e o resumo por estado", async () => {
    const { cliente } = banco({
      shipment_destinations: [
        {
          id: DESTINO,
          organization_id: ORG,
          chave: `chave-${DESTINO}`,
          endereco: "Rua A",
          endereco_original: "Rua A, 100",
          endereco_normalizado: "Rua A, 100, Centro, Canoinhas, SC",
          endereco_recuperado: "Rua A, 100, Centro, Canoinhas, SC",
          recuperacao_status: "ambiguo",
          confianca: 0.62,
          metodo: "normalizado",
          provedor: "nominatim",
          recuperado_em: null,
          latitude: null,
          longitude: null,
          geo_status: "pendente",
        },
      ],
      shipment_destination_recoveries: [
        {
          destination_id: DESTINO,
          organization_id: ORG,
          tentativa: 5,
          provedor: "nominatim",
          consulta: "Rua A, 100",
          candidato: {
            endereco: "Rua A, 100, Centro, Canoinhas, SC",
            latitude: -26.1748,
            longitude: -50.3933,
            precisao: "rua",
            metodo: "normalizado",
            provedor: "nominatim",
            confianca: 0.62,
          },
          confianca: 0.62,
          motivo: "Confiança intermediária: exige confirmação.",
          criado_em: "2026-11-13T10:00:00Z",
        },
      ],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);
    mockCarga();

    const { GET } = await import("@/app/api/v1/shipments/[id]/rota/recuperacoes/route");
    const res = await GET(new NextRequest(`http://x${url}`), {
      params: Promise.resolve({ id: CARGA }),
    });
    expect(res.status).toBe(200);

    const corpo = (await res.json()) as {
      data?: {
        destinos?: Array<{
          destinationId: string;
          cliente: string | null;
          status: string;
          enderecoOriginal: string | null;
          enderecoRecuperado: string | null;
          sugestao: { latitude: number; longitude: number; endereco: string } | null;
        }>;
        resumo?: { pendentes?: number; aguardandoConfirmacao?: number };
      };
    };
    const destino = corpo.data?.destinos?.[0];
    expect(destino?.destinationId).toBe(DESTINO);
    expect(destino?.cliente).toBe("Cliente");
    expect(destino?.status).toBe("ambiguo");
    // Original e recuperado são campos distintos — a tela mostra os dois.
    expect(destino?.enderecoOriginal).toBe("Rua A, 100");
    expect(destino?.enderecoRecuperado).toBe("Rua A, 100, Centro, Canoinhas, SC");
    // A sugestão com coordenada vem do histórico: sem ela o operador não teria
    // o que confirmar depois de recarregar a página.
    expect(destino?.sugestao?.latitude).toBe(-26.1748);
    expect(destino?.sugestao?.longitude).toBe(-50.3933);
    expect(corpo.data?.resumo?.pendentes).toBe(1);
    expect(corpo.data?.resumo?.aguardandoConfirmacao).toBe(1);
  });
});

describe("POST /destinos/[destinationId]/confirmar", () => {
  const url = `/api/v1/shipments/${CARGA}/destinos/${DESTINO}/confirmar`;

  it("404 quando o destino não existe na organização", async () => {
    const { cliente } = banco({ shipment_destinations: [] });
    vi.mocked(createClient).mockReturnValue(cliente as never);

    const { POST } = await import(
      "@/app/api/v1/shipments/[id]/destinos/[destinationId]/confirmar/route"
    );
    const res = await POST(post(url, { endereco: "Rua A, 100", latitude: -26.17, longitude: -50.39, metodo: "manual", provedor: "nominatim" }), {
      params: Promise.resolve({ id: CARGA, destinationId: DESTINO }),
    });
    expect(res.status).toBe(404);
  });

  it("422 quando o destino não pertence a esta carga", async () => {
    const { cliente } = banco({
      shipment_destinations: [{ id: DESTINO, organization_id: ORG, recuperacao_status: "ambiguo", endereco_original: "Rua A" }],
      shipment_orders: [{ id: "ped-1", destination_id: DESTINO, shipment_id: OUTRA_CARGA, organization_id: ORG }],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);

    const { POST } = await import(
      "@/app/api/v1/shipments/[id]/destinos/[destinationId]/confirmar/route"
    );
    const res = await POST(post(url, { endereco: "Rua A, 100", latitude: -26.17, longitude: -50.39, metodo: "manual", provedor: "nominatim" }), {
      params: Promise.resolve({ id: CARGA, destinationId: DESTINO }),
    });
    expect(res.status).toBe(422);
    expect(res.status).not.toBe(200);
  });

  it("grava o ponto confirmado, o status e a linha de histórico", async () => {
    const { cliente, gravados } = banco({
      shipment_destinations: [{ id: DESTINO, organization_id: ORG, recuperacao_status: "ambiguo", endereco_original: "Rua A" }],
      shipment_orders: [{ id: "ped-1", destination_id: DESTINO, shipment_id: CARGA, organization_id: ORG }],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);

    const { POST } = await import(
      "@/app/api/v1/shipments/[id]/destinos/[destinationId]/confirmar/route"
    );
    const res = await POST(
      post(url, {
        endereco: "Rua A, 100, Centro, Canoinhas, SC",
        latitude: -26.1748,
        longitude: -50.3933,
        metodo: "normalizado",
        provedor: "nominatim",
        confianca: 0.87,
      }),
      { params: Promise.resolve({ id: CARGA, destinationId: DESTINO }) }
    );
    expect(res.status).toBe(200);

    const update = gravados.find((g) => g.tabela === "shipment_destinations" && g.operacao === "update");
    expect(update?.carga.recuperacao_status).toBe("recuperado");
    expect(update?.carga.latitude).toBe(-26.1748);
    expect(update?.carga).not.toHaveProperty("endereco_original");

    const historico = gravados.find(
      (g) => g.tabela === "shipment_destination_recoveries" && g.operacao === "insert"
    );
    expect(historico).toBeDefined();
    expect(historico?.carga.destination_id).toBe(DESTINO);
    expect(historico?.carga.organization_id).toBe(ORG);
  });
});

describe("POST /destinos/[destinationId]/rejeitar", () => {
  const url = `/api/v1/shipments/${CARGA}/destinos/${DESTINO}/rejeitar`;

  it("marca nao_encontrado sem tocar no original nem gravar coordenada", async () => {
    const { cliente, gravados } = banco({
      shipment_destinations: [{ id: DESTINO, organization_id: ORG }],
      shipment_orders: [{ id: "ped-1", destination_id: DESTINO, shipment_id: CARGA, organization_id: ORG }],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);

    const { POST } = await import(
      "@/app/api/v1/shipments/[id]/destinos/[destinationId]/rejeitar/route"
    );
    const res = await POST(post(url, { motivo: "Endereço divergente" }), {
      params: Promise.resolve({ id: CARGA, destinationId: DESTINO }),
    });
    expect(res.status).toBe(200);

    const update = gravados.find((g) => g.tabela === "shipment_destinations" && g.operacao === "update");
    expect(update?.carga.recuperacao_status).toBe("nao_encontrado");
    expect(update?.carga).not.toHaveProperty("endereco_original");
    expect(update?.carga).not.toHaveProperty("latitude");
    expect(update?.carga).not.toHaveProperty("longitude");

    expect(
      gravados.some((g) => g.tabela === "shipment_destination_recoveries" && g.operacao === "insert")
    ).toBe(true);
  });
});

describe("POST /destinos/[destinationId]/reverter", () => {
  const url = `/api/v1/shipments/${CARGA}/destinos/${DESTINO}/reverter`;

  it("volta a nao_tentada, zera o pino e preserva o original", async () => {
    const { cliente, gravados } = banco({
      shipment_destinations: [
        {
          id: DESTINO,
          organization_id: ORG,
          endereco_original: "Rua A, 100",
          recuperacao_status: "recuperado",
        },
      ],
      shipment_orders: [{ id: "ped-1", destination_id: DESTINO, shipment_id: CARGA, organization_id: ORG }],
    });
    vi.mocked(createClient).mockReturnValue(cliente as never);

    const { POST } = await import(
      "@/app/api/v1/shipments/[id]/destinos/[destinationId]/reverter/route"
    );
    const res = await POST(post(url), {
      params: Promise.resolve({ id: CARGA, destinationId: DESTINO }),
    });
    expect(res.status).toBe(200);

    const update = gravados.find((g) => g.tabela === "shipment_destinations" && g.operacao === "update");
    expect(update?.carga.recuperacao_status).toBe("nao_tentada");
    expect(update?.carga.latitude).toBeNull();
    expect(update?.carga.longitude).toBeNull();
    expect(update?.carga.endereco_recuperado).toBeNull();
    expect(update?.carga).not.toHaveProperty("endereco_original");
  });
});
