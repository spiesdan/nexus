/**
 * MATRIZ E · 8 — TIMEOUT COM RESPOSTA PERDIDA: O RETRY NÃO DUPLICA O PEDIDO.
 *
 * O cenário real: o vendedor clica em "Gerar pedido", o servidor grava, e a
 * resposta se perde (rede do 4G, timeout do proxy, aba fechada). Ele clica de
 * novo. Sem idempotência, nascem DOIS pedidos — mesmo cliente, mesmos itens,
 * números diferentes — e a duplicata só aparece no fechamento do mês.
 *
 * O que este arquivo acrescenta ao teste da chave
 * (`pedido-chave-sincronizacao.test.ts`, que cobre o contrato geral):
 *
 *  1. o retry não duplica ITENS — um pedido com 3 itens continua com 3, não 6;
 *  2. quando o insert dos ITENS falha, a compensação apaga a casca do pedido e
 *     o retry cria UM pedido completo (nada de pedido órfão nem item solto);
 *  3. o retry devolve o MESMO número — número queimado é buraco em numeração
 *     fiscal, o que o contador pergunta na auditoria.
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
const CHAVE = "99999999-9999-4999-8999-999999999999";

interface Pedido {
  id: string;
  organization_id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  chave_sincronizacao: string | null;
}

interface Item {
  order_id: string;
  produto_nome: string;
  quantidade: number;
}

/**
 * Banco em memória com o contrato do PostgREST que a rota usa.
 *
 * `falharItens` simula a falha DEPOIS do pedido gravado (o caso que a
 * compensação existe para cobrir).
 */
function banco() {
  const pedidos: Pedido[] = [];
  const itens: Item[] = [];
  const numerosConsumidos: number[] = [];
  let proximoNumero = 700;
  let falharItens = false;
  let falharPedido: { code: string; message: string } | null = null;

  function cadeia(tabela: string) {
    const filtros: Record<string, unknown> = {};
    const c: Record<string, unknown> = {};
    const casa = (linha: unknown) => {
      const l = linha as Record<string, unknown>;
      return Object.entries(filtros).every(([col, v]) => l[col] === v);
    };

    c.select = () => c;
    c.eq = (col: string, v: unknown) => {
      filtros[col] = v;
      return c;
    };
    c.order = () => c;
    c.limit = () => Promise.resolve({ data: [], error: null });
    c.in = () => c;

    c.maybeSingle = () => {
      if (tabela === "commercial_policies") return Promise.resolve({ data: null, error: null });
      if (tabela === "commercial_orders") {
        return Promise.resolve({ data: pedidos.find(casa) ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    c.single = () => Promise.resolve({ data: pedidos.find(casa) ?? null, error: null });

    c.insert = (valores: unknown) => {
      if (tabela === "commercial_orders") {
        const v = valores as Record<string, unknown>;
        const duplicada =
          v.chave_sincronizacao != null &&
          pedidos.some(
            (p) =>
              p.organization_id === v.organization_id &&
              p.chave_sincronizacao === v.chave_sincronizacao,
          );
        if (falharPedido || duplicada) {
          const erro = falharPedido ?? { code: "23505", message: "duplicate key value" };
          falharPedido = null;
          return { select: () => ({ single: async () => ({ data: null, error: erro }) }) };
        }
        const linha: Pedido = {
          id: `ped-${pedidos.length + 1}`,
          organization_id: v.organization_id as string,
          numero: v.numero as number,
          cliente_nome: v.cliente_nome as string,
          status: v.status as string,
          chave_sincronizacao: (v.chave_sincronizacao as string | null) ?? null,
        };
        pedidos.push(linha);
        return { select: () => ({ single: async () => ({ data: linha, error: null }) }) };
      }
      if (tabela === "commercial_order_items") {
        if (falharItens) {
          falharItens = false;
          return Promise.resolve({ error: { code: "500", message: "insert falhou" } });
        }
        for (const i of valores as Item[]) itens.push(i);
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    };

    c.delete = () => ({
      eq: (_col: string, id: string) => {
        const i = pedidos.findIndex((p) => p.id === id);
        if (i >= 0) pedidos.splice(i, 1);
        for (let k = itens.length - 1; k >= 0; k--) if (itens[k]!.order_id === id) itens.splice(k, 1);
        return Promise.resolve({ error: null });
      },
    });
    c.update = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
    return c;
  }

  const cliente = {
    from: (tabela: string) => cadeia(tabela),
    rpc: async (fn: string) => {
      if (fn === "fn_proximo_numero_pedido") {
        numerosConsumidos.push(proximoNumero);
        return { data: proximoNumero++, error: null };
      }
      return { data: null, error: null };
    },
  };

  return {
    cliente: cliente as never,
    pedidos,
    itens,
    numerosConsumidos,
    quebrarItens: () => {
      falharItens = true;
    },
  };
}

function sessao() {
  const user = { id: "user-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK["agent" as Role] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: "agent" as Role } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function req(chave = CHAVE) {
  return new NextRequest("http://x/api/v1/commercial-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cliente_nome: "Cliente do Timeout",
      status: "aprovado",
      chave_sincronizacao: chave,
      itens: [
        { product_id: null, quantidade: 1, preco_unit_cents: 1000, desconto_pct: 0 },
        { product_id: null, quantidade: 2, preco_unit_cents: 2500, desconto_pct: 10 },
        { product_id: null, quantidade: 3, preco_unit_cents: 500, desconto_pct: 0 },
      ],
    }),
  });
}

function ligarBanco(mem: ReturnType<typeof banco>) {
  vi.mocked(createClient).mockResolvedValue(mem.cliente);
  vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("timeout com resposta perdida", () => {
  it("repetir o POST com a mesma chave não duplica pedido NEM itens", async () => {
    const mem = banco();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    // Primeiro POST: gravou. A resposta "se perdeu" do lado do cliente.
    const primeiro = await POST(req());
    expect(primeiro.status).toBe(201);
    expect(mem.pedidos).toHaveLength(1);
    expect(mem.itens).toHaveLength(3);

    // O retry do vendedor (ou do sincronizador offline).
    const segundo = await POST(req());
    expect(segundo.status).toBe(200);
    const corpo = (await segundo.json()) as { data: { ja_existia: boolean; id: string } };
    expect(corpo.data.ja_existia).toBe(true);

    expect(mem.pedidos).toHaveLength(1);
    expect(mem.itens).toHaveLength(3);
    expect(mem.numerosConsumidos).toEqual([700]);
  });

  it("falha no insert dos itens não deixa pedido-casca; o retry cria um completo", async () => {
    const mem = banco();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    mem.quebrarItens();
    const falhou = await POST(req());
    expect(falhou.status).toBe(500);
    // Compensação: sem itens, o pedido é casca — apagado, não órfão.
    expect(mem.pedidos).toHaveLength(0);

    const retry = await POST(req());
    expect(retry.status).toBe(201);
    expect(mem.pedidos).toHaveLength(1);
    expect(mem.itens).toHaveLength(3);
  });

  it("um retry não queima número da sequência", async () => {
    const mem = banco();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    await POST(req());
    await POST(req());
    await POST(req("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));

    // O retry não consome número; o pedido seguinte é 701, não 702.
    expect(mem.numerosConsumidos).toEqual([700, 701]);
    expect(mem.pedidos.map((p) => p.numero)).toEqual([700, 701]);
  });
});
