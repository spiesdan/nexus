/**
 * MATRIZ E · 5 — `ignorar_credito` É PODER DE GERENTE (GATE DO SERVIDOR).
 *
 * A tela não é o gate: quem manda `ignorar_credito: true` no corpo da requisição
 * é o cliente HTTP, e o corpo não é fonte confiável. Se a rota aceitasse o
 * campo sem checar papel, qualquer agente (ou um curl com o cookie dele)
 * furaria o bloqueio de crédito da loja — e o limite viraria decoração.
 *
 * O que este arquivo prende:
 *  1. agente com pedido acima do limite → 422 e NADA é gravado;
 *  2. agente mandando `ignorar_credito` → 422 do GATE, sem tocar no banco;
 *  3. gerente com `ignorar_credito` → passa (é o override que existe);
 *  4. rascunho nunca é barrado (orçamento não é compromisso) — a barreira é
 *     na hora de virar compromisso.
 *
 * O dublê aplica `.eq()`/`.in()` de verdade: um fake que devolvesse linhas sem
 * olhar os filtros provaria o fake, não o isolamento da consulta de crédito.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const CONTATO = "55555555-5555-4555-8555-555555555555";

interface Pedido {
  id: string;
  organization_id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  total_cents: number;
}

function banco(opcoes: { limite: number; emAberto: number }) {
  const pedidos: Pedido[] = [];
  const escritas: string[] = [];
  let proximoNumero = 500;

  function cadeia(tabela: string) {
    const filtros: Record<string, unknown> = {};
    const conjuntos: Record<string, readonly unknown[]> = {};
    const c: Record<string, unknown> = {};

    c.select = () => c;
    c.eq = (col: string, v: unknown) => {
      filtros[col] = v;
      return c;
    };
    c.in = (col: string, vs: readonly unknown[]) => {
      conjuntos[col] = vs;
      return c;
    };
    c.order = () => c;
    c.limit = () => Promise.resolve({ data: [], error: null });

    c.maybeSingle = () => {
      if (tabela === "commercial_policies") return Promise.resolve({ data: null, error: null });
      if (tabela === "contacts") {
        return Promise.resolve({
          data: {
            limite_credito_cents: opcoes.limite,
            condicao_pagamento: null,
            fantasia: "Bill Higiene",
            display_name: "BILL",
            name: "BILL",
          },
          error: null,
        });
      }
      if (tabela === "commercial_orders") {
        // O pedido em aberto do cliente: só conta se o status estiver na lista
        // que `situacaoDeCredito` pediu.
        const statusPedidos = (conjuntos.status ?? []) as readonly string[];
        return Promise.resolve({
          data:
            opcoes.emAberto > 0 && statusPedidos.includes("aprovado")
              ? { total_cents: opcoes.emAberto }
              : null,
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    };

    // `.in("status", [...])` termina a cadeia em `situacaoDeCredito`.
    const entao = () => {
      if (tabela === "commercial_orders" && conjuntos.status) {
        return Promise.resolve({
          data: opcoes.emAberto > 0 ? [{ total_cents: opcoes.emAberto }] : [],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    };
    c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      entao().then(resolve, reject);

    c.insert = (valores: unknown) => {
      escritas.push(tabela);
      if (tabela === "commercial_orders") {
        const v = valores as Record<string, unknown>;
        const linha: Pedido = {
          id: `ped-${pedidos.length + 1}`,
          organization_id: v.organization_id as string,
          numero: v.numero as number,
          cliente_nome: v.cliente_nome as string,
          status: v.status as string,
          total_cents: v.total_cents as number,
        };
        pedidos.push(linha);
        return {
          select: () => ({ single: async () => ({ data: linha, error: null }) }),
        };
      }
      return Promise.resolve({ error: null });
    };
    c.delete = () => ({ eq: () => Promise.resolve({ error: null }) });
    c.update = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
    return c;
  }

  const cliente = {
    from: (tabela: string) => cadeia(tabela),
    rpc: async (fn: string) =>
      fn === "fn_proximo_numero_pedido"
        ? { data: proximoNumero++, error: null }
        : { data: null, error: null },
  };

  return { cliente: cliente as never, pedidos, escritas };
}

function sessao(papel: Role) {
  const user = { id: "user-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "papel insuficiente.", 403, {}) },
  );
}

function req(corpo: Record<string, unknown>) {
  return new NextRequest("http://x/api/v1/commercial-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function pedido(over: Record<string, unknown> = {}) {
  return {
    contact_id: CONTATO,
    cliente_nome: "Bill Higiene",
    status: "aprovado",
    itens: [{ product_id: null, quantidade: 1, preco_unit_cents: 50000, desconto_pct: 0 }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("agent");
});

describe("POST /api/v1/commercial-orders — crédito", () => {
  it("acima do limite: 422 e nenhum pedido gravado", async () => {
    const mem = banco({ limite: 10000, emAberto: 9000 });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(pedido()));
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as {
      error: { message: string; details?: Record<string, unknown> };
    };
    expect(corpo.error.message).toBe("Cliente acima do limite de crédito.");
    expect(corpo.error.details).toMatchObject({
      limite_cents: 10000,
      em_aberto_cents: 9000,
      novo_total_cents: 50000,
    });
    expect(mem.pedidos).toHaveLength(0);
  });

  it("sem limite definido não há o que estourar", async () => {
    const mem = banco({ limite: Number.MAX_SAFE_INTEGER, emAberto: 0 });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(pedido()));
    expect(res.status).toBe(201);
  });

  it("agente mandando `ignorar_credito` é barrado pelo GATE — sem escrever nada", async () => {
    sessao("agent");
    const mem = banco({ limite: 10000, emAberto: 9000 });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(pedido({ ignorar_credito: true })));
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toBe("Só gerente pode ignorar estoque ou crédito.");
    // O gate vem antes de qualquer leitura/escrita de pedido.
    expect(mem.pedidos).toHaveLength(0);
    expect(mem.escritas).toHaveLength(0);
  });

  it("gerente com `ignorar_credito` passa — é o override que existe", async () => {
    sessao("manager");
    const mem = banco({ limite: 10000, emAberto: 9000 });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(pedido({ ignorar_credito: true })));
    expect(res.status).toBe(201);
    expect(mem.pedidos).toHaveLength(1);
  });

  it("rascunho (orçamento) não é barrado pelo crédito", async () => {
    const mem = banco({ limite: 10000, emAberto: 9000 });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(pedido({ status: "rascunho" })));
    expect(res.status).toBe(201);
    expect(mem.pedidos).toHaveLength(1);
  });
});
