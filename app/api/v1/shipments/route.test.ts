/**
 * POST /api/v1/shipments — a carga nasce guardando o status comercial.
 *
 * 0362: a devolução restaura o status gravado no embarque. Se o embarque não
 * gravar, o fallback `aprovado` apaga a diferença em silêncio — por isso o
 * contrato da escrita também é medido aqui, não só o da devolução.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { garantirDestinosDosPedidos } from "@/lib/rotas/destinos-do-banco";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/rotas/destinos-do-banco", () => ({
  garantirDestinosDosPedidos: vi.fn(),
}));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PEDIDO = "33333333-3333-4333-8333-333333333333";

type Chamada = { tabela: string; op: string; args: unknown[] };

function fake() {
  const chamadas: Chamada[] = [];
  const resposta = (tabela: string) => {
    if (tabela === "commercial_orders") {
      return {
        data: [{ id: PEDIDO, numero: 10, status: "faturado", mercos_ultima_mudanca: null }],
        error: null,
      };
    }
    return { data: [], error: null };
  };

  const cliente = {
    from(tabela: string) {
      let op = "select";
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (...args: unknown[]) => {
        chamadas.push({ tabela, op, args });
        return q;
      };
      q.in = (...args: unknown[]) => {
        chamadas.push({ tabela, op, args });
        return q;
      };
      q.order = () => q;
      q.limit = () => q;
      q.insert = (v: unknown) => {
        op = "insert";
        chamadas.push({ tabela, op, args: [v] });
        return q;
      };
      q.update = (v: unknown) => {
        op = "update";
        chamadas.push({ tabela, op, args: [v] });
        return q;
      };
      q.single = () =>
        Promise.resolve(
          tabela === "shipments"
            ? { data: { id: "s1", numero: 7, status: "montando" }, error: null }
            : { data: null, error: null },
        );
      q.then = (ok: unknown, err: unknown) =>
        Promise.resolve(resposta(tabela)).then(ok as never, err as never);
      return q;
    },
    rpc(nome: string, args: unknown) {
      chamadas.push({ tabela: "rpc", op: nome, args: [args] });
      return Promise.resolve({ data: 7, error: null });
    },
  };
  return { cliente, chamadas };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1" },
    org: { orgId: ORG_ID },
  } as never);
  vi.mocked(garantirDestinosDosPedidos).mockResolvedValue({
    destinos: new Map([[PEDIDO, "d1"]]),
    erro: null,
  });
});

describe("POST /api/v1/shipments", () => {
  it("grava o status comercial do pedido no item da carga", async () => {
    const { cliente, chamadas } = fake();
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/shipments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order_ids: [PEDIDO] }),
      }),
    );
    expect(res.status).toBe(201);

    const insercao = chamadas.find((c) => c.tabela === "shipment_orders" && c.op === "insert");
    expect(insercao).toBeDefined();
    expect(insercao?.args[0]).toEqual([
      expect.objectContaining({
        order_id: PEDIDO,
        status: "na_carga",
        status_comercial_ao_embarcar: "faturado",
      }),
    ]);
  });
});
