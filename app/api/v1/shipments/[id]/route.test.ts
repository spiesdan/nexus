/**
 * DELETE /api/v1/shipments/[id] — excluir a carga devolve os pedidos à fila.
 *
 * O defeito: criar a carga leva os pedidos para `expedido` e nada os trazia de
 * volta. Excluir a carga deixava os pedidos invisíveis nas duas telas (fora da
 * carga, fora da fila de embarque, que só lê `aprovado`/`faturado`), com um
 * cookie de sucesso na tela. O que este teste prende é a DEVOLUÇÃO.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

type Registro = { data?: unknown; error?: unknown };
type Chamada = { tabela: string; op: string; args: unknown[] };

let chamadas: Chamada[] = [];

/** Builder falso: a resposta depende da TABELA e da OPERAÇÃO da cadeia. */
function fake(porTabela: Record<string, (op: string) => Registro>) {
  chamadas = [];
  return vi.fn((tabela: string) => {
    let op = "select";
    const q: Record<string, unknown> = {};
    const empilha = (..._args: unknown[]) => q;
    const registra = (nome: string) => {
      q[nome] = (...args: unknown[]) => {
        chamadas.push({ tabela, op, args });
        return empilha(...args);
      };
    };
    for (const nome of ["select", "eq", "in", "order", "limit"]) registra(nome);
    q.update = (v: unknown) => {
      op = "update";
      chamadas.push({ tabela, op, args: [v] });
      return q;
    };
    q.delete = () => {
      op = "delete";
      chamadas.push({ tabela, op, args: [] });
      return q;
    };
    q.single = () => Promise.resolve(porTabela[tabela]?.("select") ?? { data: null, error: null });
    q.then = (ok: unknown, err: unknown) =>
      Promise.resolve(porTabela[tabela]?.(op) ?? { data: null, error: null }).then(
        ok as never,
        err as never,
      );
    return q;
  });
}

function tabelas(statusDaCarga = "montando", erroAoExcluir: unknown = null) {
  return {
    shipments: (op: string) =>
      op === "delete" ? { data: null, error: erroAoExcluir } : { data: { id: "s1", status: statusDaCarga }, error: null },
    shipment_orders: () => ({
      data: [{ id: "i1", order_id: "o1", sequencia: 1, status: "na_carga", separado_em: null }],
      error: null,
    }),
    commercial_orders: (op: string) =>
      op === "update"
        ? { data: [{ id: "o1" }], error: null }
        : {
            data: [
              {
                id: "o1",
                numero: 1,
                cliente_nome: "Cliente",
                endereco_entrega: null,
                total_cents: 0,
                status: "expedido",
              },
            ],
            error: null,
          },
    shipment_proofs: () => ({ data: [], error: null }),
    financial_receivables: () => ({ data: [], error: null }),
  };
}

function excluir(id: string): Promise<Response> {
  return import("./route").then(({ DELETE }) =>
    DELETE(new NextRequest(`http://localhost/api/v1/shipments/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1" },
    org: { orgId: ORG_ID },
  } as never);
  vi.mocked(createClient).mockResolvedValue({ from: fake(tabelas()) } as never);
});

describe("DELETE /api/v1/shipments/[id]", () => {
  it("devolve os pedidos que a carga levou para `expedido`", async () => {
    const res = await excluir("s1");
    expect(res.status).toBe(200);

    const corpo = (await res.json()) as { data: { pedidos_devolvidos: number } };
    expect(corpo.data.pedidos_devolvidos).toBe(1);

    const daDevolucao = chamadas
      .filter((c) => c.tabela === "commercial_orders" && c.op === "update")
      .map((c) => c.args);

    expect(daDevolucao).toContainEqual([{ status: "aprovado" }]);
    // Só `expedido` regride: um pedido que já seguiu para `entregue` não volta.
    expect(daDevolucao).toContainEqual(["status", "expedido"]);
    expect(daDevolucao).toContainEqual(["organization_id", ORG_ID]);
    expect(daDevolucao).toContainEqual(["id", ["o1"]]);
  });

  it("não exclui carga encerrada — e não mexe em pedido nenhum", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: fake(tabelas("concluida")),
    } as never);

    const res = await excluir("s1");
    expect(res.status).toBe(422);
    expect(chamadas.some((c) => c.op === "delete")).toBe(false);
    expect(chamadas.some((c) => c.op === "update")).toBe(false);
  });

  it("não devolve pedido quando a exclusão da carga falhou", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: fake(tabelas("montando", { message: "boom" })),
    } as never);

    const res = await excluir("s1");
    expect(res.status).toBe(500);
    expect(chamadas.some((c) => c.tabela === "commercial_orders" && c.op === "update")).toBe(false);
  });
});
