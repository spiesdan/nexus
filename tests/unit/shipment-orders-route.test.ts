/**
 * GET/POST /api/v1/shipments/[id]/orders — pôr pedido numa carga que já existe.
 *
 * O que se mede aqui são as DECISÕES da rota: carga fora de `montando` recusa,
 * pedido inelegível recusa, pedido já em outra carga recusa, e o que entra é
 * gravado com a sequência seguinte e avança o pedido para `expedido` — a mesma
 * regra da criação da carga. A resolução de cidade/nome é a mesma função da
 * ficha da carga (`lib/expedicao/endereco-da-entrega.ts`), testada lá.
 *
 * Banco dublado com cadeia encadeável, no molde de
 * `shipment-fechamento-route.test.ts`.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { avisarClientesDaCarga } from "@/lib/expedicao/aviso-de-carga";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/expedicao/aviso-de-carga", () => ({ avisarClientesDaCarga: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";
const PEDIDO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTRO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Gravado = { tabela: string; operacao: string; carga: unknown };

function banco(linhas: Record<string, Record<string, unknown>[]>): Gravado[] {
  const gravados: Gravado[] = [];
  const proto: Record<string, unknown> = {
    __tabela: "",
    __inserido: null as Record<string, unknown>[] | null,
    __filtros: [] as { coluna: string; valores: unknown[] }[],
    select() {
      return this;
    },
    eq(this: Record<string, unknown>, coluna: string, valor: unknown) {
      (this.__filtros as { coluna: string; valores: unknown[] }[]).push({ coluna, valores: [valor] });
      return this;
    },
    in(this: Record<string, unknown>, coluna: string, valores: unknown[]) {
      (this.__filtros as { coluna: string; valores: unknown[] }[]).push({ coluna, valores });
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    /**
     * Filtro de verdade nas colunas que o fixture tem — o suficiente para
     * separar "este pedido já está em outra carga" de "outro pedido está".
     * Coluna ausente no fixture é ignorada (organização/shipment_id não são o
     * que este teste mede).
     */
    __filtrar(this: Record<string, unknown>, linhas: Record<string, unknown>[]) {
      const filtros = this.__filtros as { coluna: string; valores: unknown[] }[];
      return linhas.filter((linha) =>
        filtros.every((f) => !(f.coluna in linha) || f.valores.includes(linha[f.coluna])),
      );
    },
    maybeSingle(this: Record<string, unknown>) {
      const filtradas = (this.__filtrar as (l: Record<string, unknown>[]) => Record<string, unknown>[])(
        linhas[this.__tabela as string] ?? [],
      );
      return Promise.resolve({ data: filtradas[0] ?? null, error: null });
    },
    then(this: Record<string, unknown>, ok: (v: unknown) => void) {
      const dados =
        this.__inserido ??
        (this.__filtrar as (l: Record<string, unknown>[]) => Record<string, unknown>[])(
          linhas[this.__tabela as string] ?? [],
        );
      return Promise.resolve({ data: dados, error: null }).then(ok);
    },
    insert(this: Record<string, unknown>, carga: Record<string, unknown>[]) {
      gravados.push({ tabela: this.__tabela as string, operacao: "insert", carga });
      this.__inserido = carga.map((linha, i) => ({ id: `novo-${i}`, ...linha }));
      return this;
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
      // Por consulta: `__filtros` no proto seria um array compartilhado por
      // todas as cadeias, e a segunda consulta herdaria os filtros da primeira.
      cadeia.__filtros = [];
      cadeia.__inserido = null;
      return cadeia;
    },
  };
  vi.mocked(createClient).mockResolvedValue(cliente as never);
  return gravados;
}

function sessao(papel: Role) {
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
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

function post(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function get() {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/orders`, { method: "GET" });
}

function cenario(): Record<string, Record<string, unknown>[]> {
  return {
    shipments: [{ id: CARGA, numero: 7, status: "montando" }],
    commercial_orders: [
      { id: PEDIDO, numero: 19341, cliente_nome: "WANDERLEI MACHADO", status: "aprovado", total_cents: 19500, contact_id: null },
      { id: OUTRO, numero: 19342, cliente_nome: "OUTRO CLIENTE", status: "entregue", total_cents: 5000, contact_id: null },
    ],
    shipment_orders: [{ id: "so-1", order_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", sequencia: 2, status: "na_carga" }],
    contacts: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("agent");
});

describe("POST /api/v1/shipments/[id]/orders", () => {
  it("recusa carga que já saiu: a rota lida pelo motorista não se reescreve", async () => {
    const linhas = cenario();
    linhas.shipments = [{ id: CARGA, numero: 7, status: "em_rota" }];
    banco(linhas);
    const { POST } = await import("@/app/api/v1/shipments/[id]/orders/route");
    const res = await POST(post({ order_ids: [PEDIDO] }), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("montagem");
  });

  it("recusa pedido que não é embarcável, nomeando o pedido", async () => {
    banco(cenario());
    const { POST } = await import("@/app/api/v1/shipments/[id]/orders/route");
    const res = await POST(post({ order_ids: [OUTRO] }), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("PED-19342");
    expect(corpo.error.message).toContain("entregue");
  });

  it("recusa pedido que já está em outra carga", async () => {
    const linhas = cenario();
    linhas.shipment_orders = [{ id: "so-9", order_id: PEDIDO, sequencia: 1, status: "na_carga" }];
    banco(linhas);
    const { POST } = await import("@/app/api/v1/shipments/[id]/orders/route");
    const res = await POST(post({ order_ids: [PEDIDO] }), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(409);
  });

  it("grava na sequência seguinte, avança o pedido para expedido e audita", async () => {
    const gravados = banco(cenario());
    const { POST } = await import("@/app/api/v1/shipments/[id]/orders/route");
    const res = await POST(post({ order_ids: [PEDIDO] }), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(201);

    const insercao = gravados.find((g) => g.tabela === "shipment_orders" && g.operacao === "insert");
    expect(insercao?.carga).toEqual([
      { organization_id: ORG, shipment_id: CARGA, order_id: PEDIDO, sequencia: 3, status: "na_carga" },
    ]);

    const avanco = gravados.find((g) => g.tabela === "commercial_orders" && g.operacao === "update");
    expect(avanco?.carga).toEqual({ status: "expedido" });

    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "shipment_order.added", resourceId: CARGA }),
    );
    expect(vi.mocked(avisarClientesDaCarga)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shipmentId: CARGA, orderIds: [PEDIDO] }),
    );
  });

  it("viewer não põe pedido na carga", async () => {
    sessao("viewer");
    banco(cenario());
    const { POST } = await import("@/app/api/v1/shipments/[id]/orders/route");
    const res = await POST(post({ order_ids: [PEDIDO] }), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/shipments/[id]/orders", () => {
  it("devolve a fila sem os pedidos que já estão em alguma carga, com cidade do cadastro", async () => {
    const linhas = cenario();
    const [pedido, outro] = linhas.commercial_orders ?? [];
    linhas.commercial_orders = [
      { ...pedido!, contact_id: "contato-1" },
      { ...outro!, status: "faturado", contact_id: "contato-1" },
    ];
    // O segundo já está numa carga: o "ocupados" da rota lê shipment_orders.
    linhas.shipment_orders = [{ id: "so-9", order_id: OUTRO, sequencia: 1, status: "na_carga" }];
    linhas.contacts = [
      {
        id: "contato-1",
        name: "WANDERLEI MACHADO",
        display_name: "Wanderlei Machado",
        cnpj: null,
        logradouro: "RUA JOÃO FRANCISCO DE ASSIS",
        numero_end: "27",
        complemento: null,
        bairro: "CENTRO",
        cidade: "Mafra",
        uf: "SC",
        cep: "89303092",
      },
    ];
    banco(linhas);
    const { GET } = await import("@/app/api/v1/shipments/[id]/orders/route");
    const res = await GET(get(), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { pedidos: { id: string; cliente_nome: string; cidade: string | null }[] };
    };
    expect(corpo.data.pedidos).toHaveLength(1);
    expect(corpo.data.pedidos[0]).toMatchObject({
      id: PEDIDO,
      cliente_nome: "Wanderlei Machado",
      cidade: "Mafra/SC",
    });
  });

  it("carga fora de montagem não oferece pedido nenhum", async () => {
    const linhas = cenario();
    linhas.shipments = [{ id: CARGA, numero: 7, status: "concluida" }];
    banco(linhas);
    const { GET } = await import("@/app/api/v1/shipments/[id]/orders/route");
    const res = await GET(get(), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { pedidos: unknown[] } };
    expect(corpo.data.pedidos).toEqual([]);
  });
});
