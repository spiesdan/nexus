/**
 * DELETE /api/v1/shipments/[id]/orders/[orderId] — tirar UM pedido da carga.
 *
 * 0362: embarcar leva o pedido para `expedido`; sair devolvia `aprovado` fixo e
 * apagava o status comercial anterior. Um pedido `faturado` voltava para a
 * fila como se não tivesse nota. O teste prende a restauração do status
 * gravado no embarque e o fallback de carga legada.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

type Chamada = { tabela: string; op: string; args: unknown[] };

function fake(
  item: { id: string; status: string; status_comercial_ao_embarcar: string | null } | null,
  rpcData: unknown = { status: "removido" },
) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from(tabela: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (...args: unknown[]) => {
        chamadas.push({ tabela, op: "eq", args });
        return q;
      };
      q.maybeSingle = () => Promise.resolve({ data: item, error: null });
      q.update = (v: unknown) => {
        chamadas.push({ tabela, op: "update", args: [v] });
        return q;
      };
      q.then = (ok: unknown, err: unknown) =>
        Promise.resolve({ data: null, error: null }).then(ok as never, err as never);
      return q;
    },
    rpc(nome: string, args: unknown) {
      chamadas.push({ tabela: "rpc", op: nome, args: [args] });
      return Promise.resolve({ data: rpcData, error: null });
    },
  };
  return { cliente, chamadas };
}

function remover(orderId: string): Promise<Response> {
  return import("./route").then(({ DELETE }) =>
    DELETE(
      new NextRequest(`http://localhost/api/v1/shipments/s1/orders/${orderId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "s1", orderId }) },
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1" },
    org: { orgId: ORG_ID },
  } as never);
});

describe("DELETE /api/v1/shipments/[id]/orders/[orderId]", () => {
  it("devolve o pedido ao status que ele tinha ao embarcar", async () => {
    const { cliente, chamadas } = fake({
      id: "i1",
      status: "na_carga",
      status_comercial_ao_embarcar: "faturado",
    });
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const res = await remover("o1");
    expect(res.status).toBe(200);

    // O fake registra o `eq` com op "eq" e o `update` com op "update": a
    // intenção é olhar a tabela inteira, não só uma das operações.
    const daDevolucao = chamadas
      .filter((c) => c.tabela === "commercial_orders")
      .map((c) => c.args);
    expect(daDevolucao).toContainEqual([{ status: "faturado" }]);
    // Só `expedido` regride: pedido entregue/reembarcado não é desfeito.
    expect(daDevolucao).toContainEqual(["status", "expedido"]);
  });

  it("carga legada (status gravado NULL) cai no fallback aprovado", async () => {
    const { cliente, chamadas } = fake({
      id: "i1",
      status: "em_rota",
      status_comercial_ao_embarcar: null,
    });
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const res = await remover("o1");
    expect(res.status).toBe(200);

    const daDevolucao = chamadas
      .filter((c) => c.tabela === "commercial_orders" && c.op === "update")
      .map((c) => c.args);
    expect(daDevolucao).toContainEqual([{ status: "aprovado" }]);
  });

  it("pedido já entregue não sai da carga — nada é restaurado", async () => {
    const { cliente, chamadas } = fake({
      id: "i1",
      status: "entregue",
      status_comercial_ao_embarcar: "faturado",
    });
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const res = await remover("o1");
    expect(res.status).toBe(422);
    expect(chamadas.some((c) => c.tabela === "rpc")).toBe(false);
    expect(chamadas.some((c) => c.tabela === "commercial_orders")).toBe(false);
  });
});
