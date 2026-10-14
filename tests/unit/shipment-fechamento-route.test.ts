/**
 * GET/PUT /api/v1/shipments/[id]/fechamento — o fechamento de caixa no sistema.
 *
 * ─── O QUE SE MEDE AQUI, E O QUE SE MEDE EM OUTRO LUGAR ───────────────────
 *
 * Aqui: as DECISÕES da rota. Quem pode gravar (manager+, viewer lê), o que é
 * 400/404/422, e — a principal — que as somas vêm DO BANCO, nunca do corpo.
 *
 * A aritmética (`contaDoCaixa`, `avisosDoFechamento`, `resumoDoFechamento`) é
 * testada onde ela mora: `lib/comercial/fechamento-carga.test.ts` e
 * `tests/unit/fechamento-expedicao.test.ts`. Medir a conta aqui de novo seria
 * testar o dublê, não a rota.
 *
 * Banco dublado com cadeia encadeável, no molde de `pedido-itens-route.test.ts`:
 * o filtro do Supabase encadeia `.eq().eq().in()`, e um dublê raso falha com
 * `not a function` — que parece bug da rota e é typo do dublê.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";

/**
 * O banco em miniatura. Cada tabela tem linhas fixas; os filtros são
 * ignorados porque cada chamada da rota lê UMA tabela com UM filtro — o que
 * se mede é a decisão tomada com aquelas linhas, não o filtro.
 *
 * `gravados` guarda o que a rota ESCREVEU (upsert + updates), para afirmar
 * que as somas gravadas são as calculadas no servidor.
 */
function banco(linhas: Record<string, Record<string, unknown>[]>) {
  const gravados: { tabela: string; operacao: string; carga: unknown }[] = [];
  // Métodos com `this`, não arrow sobre `q`: a cadeia (`from(t).select().eq()`)
  // precisa carregar a tabela até o terminal (`maybeSingle`/`then`). Com arrow
  // fechando sobre o protótipo, `__tabela` era sempre `undefined` e todo
  // `maybeSingle` devolvia null — a rota respondia 404 em tudo, e o teste
  // media o dublê quebrado em vez da rota.
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
    not(this: Record<string, unknown>) {
      return this;
    },
    order(this: Record<string, unknown>) {
      return this;
    },
    maybeSingle(this: Record<string, unknown>) {
      return Promise.resolve({
        data: (linhas[this.__tabela as string] ?? [])[0] ?? null,
        error: null,
      });
    },
    then(this: Record<string, unknown>, ok: (v: unknown) => void) {
      return Promise.resolve({
        data: linhas[this.__tabela as string] ?? [],
        error: null,
      }).then(ok);
    },
    insert(this: Record<string, unknown>, carga: unknown) {
      gravados.push({ tabela: this.__tabela as string, operacao: "insert", carga });
      return Promise.resolve({ data: null, error: null });
    },
    upsert(this: Record<string, unknown>, carga: unknown) {
      gravados.push({ tabela: this.__tabela as string, operacao: "upsert", carga });
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
  vi.mocked(createAdminClient).mockReturnValue(cliente as never);
  return gravados;
}

/**
 * Carga com duas paradas: o1 (R$ 100,00, R$ 30,00 já pagos, 2 volumes,
 * condição dinheiro) e o2 (R$ 200,00, nada pago, condição PIX).
 *
 * Esperado ("a cobrar") = 7000 + 20000 = 27000. É sobre este número que os
 * testes de "a soma vem do banco" se apoiam.
 */
function cenarioBase(): Record<string, Record<string, unknown>[]> {
  return {
    shipments: [
      {
        id: CARGA,
        numero: 7,
        placa: "ABC1D23",
        veiculo_tipo: null,
        motorista_nome: "Zé",
        status: "concluida",
      },
    ],
    shipment_orders: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        order_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sequencia: 1,
        status: "entregue",
        motivo: null,
        entregue_em: null,
        conferido: false,
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sequencia: 2,
        status: "entregue",
        motivo: null,
        entregue_em: null,
        conferido: false,
      },
    ],
    commercial_orders: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        numero: 101,
        cliente_nome: "Cliente A",
        total_cents: 10000,
        condicao_pagamento: "dinheiro",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        numero: 102,
        cliente_nome: "Cliente B",
        total_cents: 20000,
        condicao_pagamento: "PIX",
      },
    ],
    commercial_order_items: [{ order_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantidade: 2 }],
    financial_receivables: [
      { order_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", valor_original_cents: 3000 },
    ],
    shipment_closings: [],
  };
}

const SO1 = "44444444-4444-4444-8444-444444444444";
const SO2 = "55555555-5555-4555-8555-555555555555";

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

function get() {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/fechamento`, { method: "GET" });
}

function put(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/shipments/${CARGA}/fechamento`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("manager");
});

describe("GET /api/v1/shipments/[id]/fechamento", () => {
  it("viewer lê: resumo, paradas, por condição e sem fechamento gravado", async () => {
    sessao("viewer");
    banco(cenarioBase());
    const { GET } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await GET(get(), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: {
        resumo: Record<string, number>;
        paradas: unknown[];
        por_condicao: { condicao: string; valor_cents: number }[];
        fechamento: unknown;
      };
    };
    expect(corpo.data.resumo).toMatchObject({
      totalFaturado: 30000,
      pagoAntecipado: 3000,
      aCobrar: 27000,
      volumes: 2,
    });
    expect(corpo.data.paradas).toHaveLength(2);
    expect(corpo.data.por_condicao).toEqual([
      { condicao: "PIX", valor_cents: 20000 },
      { condicao: "Dinheiro", valor_cents: 7000 },
    ]);
    expect(corpo.data.fechamento).toBeNull();
  });

  it("com fechamento gravado, devolve as linhas e a conta recomputada", async () => {
    const cenario = cenarioBase();
    cenario.shipment_closings = [
      {
        linhas: [{ chave: "dinheiro", valor_cents: 5000 }],
        conferente_nome: "Ana",
        conferido_em: "2026-10-14T12:00:00.000Z",
        observacao: null,
      },
    ];
    banco(cenario);
    const { GET } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await GET(get(), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: {
        fechamento: {
          linhas: { chave: string; valor_cents: number }[];
          conta: Record<string, number>;
          conferente_nome: string;
        };
      };
    };
    // Oito linhas, na ordem do PDF, com zero onde nada foi contado.
    expect(corpo.data.fechamento.linhas).toHaveLength(8);
    expect(corpo.data.fechamento.linhas[0]).toEqual({ chave: "dinheiro", valor_cents: 5000 });
    // 5000 contados contra 27000 esperados: falta de 22000.
    expect(corpo.data.fechamento.conta.diferenca_cents).toBe(-22000);
    expect(corpo.data.fechamento.conta.bate).toBe(false);
    expect(corpo.data.fechamento.conferente_nome).toBe("Ana");
  });

  it("id que não é UUID é 400", async () => {
    banco(cenarioBase());
    const { GET } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await GET(get(), { params: Promise.resolve({ id: "nao-e-uuid" }) });
    expect(res.status).toBe(400);
  });

  it("carga inexistente é 404", async () => {
    const cenario = cenarioBase();
    cenario.shipments = [];
    banco(cenario);
    const { GET } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await GET(get(), { params: Promise.resolve({ id: CARGA }) });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/shipments/[id]/fechamento", () => {
  it("viewer NÃO grava fechamento", async () => {
    sessao("viewer");
    banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(put({ linhas: [], conferidos: [] }), {
      params: Promise.resolve({ id: CARGA }),
    });
    expect(res.status).toBe(403);
  });

  it("grava com as somas VINDO DO BANCO — o corpo não tem 'esperado'", async () => {
    // A prova central: o corpo informa só o que foi contado. Se as somas
    // viessem do corpo, este teste passaria com qualquer número — e o
    // conferente informaria o total que ele mesmo inventou.
    const gravados = banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(
      put({
        linhas: [{ chave: "dinheiro", valor_cents: 27000 }],
        conferidos: [SO1, SO2],
        conferente_nome: "Ana",
      }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { conta: Record<string, number>; avisos: unknown[] };
    };
    expect(corpo.data.conta).toMatchObject({
      entradas_cents: 27000,
      saidas_cents: 0,
      liquido_cents: 27000,
      esperado_cents: 27000,
      diferenca_cents: 0,
      bate: true,
    });
    expect(corpo.data.avisos).toEqual([]);
    const upsert = gravados.find((g) => g.operacao === "upsert");
    expect(upsert?.tabela).toBe("shipment_closings");
    // O que foi GRAVADO é o calculado no servidor, com as oito linhas.
    expect(upsert?.carga).toMatchObject({
      organization_id: ORG,
      shipment_id: CARGA,
      esperado_cents: 27000,
      diferenca_cents: 0,
      conferente_nome: "Ana",
    });
    expect((upsert?.carga as { linhas: unknown[] }).linhas).toHaveLength(8);
  });

  it("marca os conferidos e desmarca o resto — o PUT substitui, não soma", async () => {
    const gravados = banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    await PUT(put({ linhas: [], conferidos: [SO1] }), {
      params: Promise.resolve({ id: CARGA }),
    });
    const updates = gravados.filter((g) => g.tabela === "shipment_orders");
    expect(updates.some((u) => (u.carga as { conferido: boolean }).conferido === true)).toBe(true);
    expect(updates.some((u) => (u.carga as { conferido: boolean }).conferido === false)).toBe(
      true,
    );
  });

  it("diferença vira 200 com aviso — e NÃO 422: troco a menos é rotina", async () => {
    banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(
      put({ linhas: [{ chave: "dinheiro", valor_cents: 26000 }], conferidos: [SO1, SO2] }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { conta: Record<string, number>; avisos: { nivel: string; texto: string }[] };
    };
    expect(corpo.data.conta.diferenca_cents).toBe(-1000);
    expect(corpo.data.avisos.some((a) => a.nivel === "atencao" && /Falta/.test(a.texto))).toBe(
      true,
    );
  });

  it("MUTAÇÃO: diferença tratada como erro impediria fechar com troco a menos", async () => {
    // Se o `!conta.bate` virasse `nivel: "erro"`, o PUT acima devolveria 422
    // e o conferente não conseguiria gravar um caixa com falta de R$ 10,00 —
    // que é o caso mais comum do fechamento real.
    banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(
      put({ linhas: [{ chave: "dinheiro", valor_cents: 26000 }], conferidos: [SO1, SO2] }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(200);
  });

  it("nada conferido é 422 e NÃO grava", async () => {
    const gravados = banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(put({ linhas: [{ chave: "dinheiro", valor_cents: 27000 }], conferidos: [] }), {
      params: Promise.resolve({ id: CARGA }),
    });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error?: { message?: string } };
    expect(corpo.error?.message ?? "").toMatch(/não pode ser gravado/i);
    expect(gravados.some((g) => g.operacao === "upsert")).toBe(false);
  });

  it("parada que não é desta carga é 422", async () => {
    banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(
      put({
        linhas: [],
        conferidos: ["66666666-6666-4666-8666-666666666666"],
      }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(422);
  });

  it("linha repetida é 422 — somar duas vezes é dupla contagem", async () => {
    banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(
      put({
        linhas: [
          { chave: "dinheiro", valor_cents: 1000 },
          { chave: "dinheiro", valor_cents: 1000 },
        ],
        conferidos: [SO1, SO2],
      }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(res.status).toBe(422);
  });

  it("valor negativo e chave desconhecida são 422", async () => {
    banco(cenarioBase());
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const negativo = await PUT(
      put({ linhas: [{ chave: "dinheiro", valor_cents: -5 }], conferidos: [SO1, SO2] }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(negativo.status).toBe(422);
    const desconhecida = await PUT(
      put({ linhas: [{ chave: "ouro_em_barra", valor_cents: 5 }], conferidos: [SO1, SO2] }),
      { params: Promise.resolve({ id: CARGA }) },
    );
    expect(desconhecida.status).toBe(422);
  });

  it("carga inexistente é 404", async () => {
    const cenario = cenarioBase();
    cenario.shipments = [];
    banco(cenario);
    const { PUT } = await import("@/app/api/v1/shipments/[id]/fechamento/route");
    const res = await PUT(put({ linhas: [], conferidos: [SO1] }), {
      params: Promise.resolve({ id: CARGA }),
    });
    expect(res.status).toBe(404);
  });
});