import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O lote de fotos já quebrou a tela duas vezes, e as duas vezes por TAMANHO:
 *  1. na URL, no browser (>18 KB) → ERR_HTTP2_PROTOCOL_ERROR;
 *  2. na URL, no PostgREST (`in.(...)`, 500 ids = 19 KB) → 414 → 500 na tela.
 *
 * Este teste trava a segunda: o número de consultas ao banco cresce com o
 * tamanho do lote, e NENHUMA consulta carrega 500 ids.
 */

const consultas: { productId: string[] }[] = [];

vi.mock("@/lib/api/wrappers", () => ({
  ok: (d: unknown) => new Response(JSON.stringify({ data: d }), { status: 200 }),
  fail: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ error: { code, message } }), { status }),
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: () => Promise.resolve({ ok: true, org: { orgId: "org-1" } }),
}));

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://sb.test" } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: (_col: string, ids: string[]) => {
            consultas.push({ productId: ids });
            return { order: () => Promise.resolve({ data: [], error: null }) };
          },
        }),
      }),
    }),
  }),
}));

function requisicao(ids: string[]) {
  return new Request("http://localhost/api/v1/products/images", {
    method: "POST",
    body: JSON.stringify({ ids }),
  }) as never;
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("POST /api/v1/products/images", () => {
  beforeEach(() => {
    consultas.length = 0;
  });

  it("500 ids saem em fatias de 100 — nenhuma consulta estoura o PostgREST", async () => {
    const { POST } = await import("@/app/api/v1/products/images/route");
    const res = await POST(requisicao(ids(500)));

    expect(res.status).toBe(200);
    expect(consultas).toHaveLength(5);
    for (const c of consultas) {
      expect(c.productId.length).toBeLessThanOrEqual(100);
      // Medido na VPS: 500 ids numa URL de 19 KB → PostgREST "414 URI too long".
      expect(c.productId.join(",").length).toBeLessThan(4000);
    }
    const todos = consultas.flatMap((c) => c.productId);
    expect(new Set(todos).size).toBe(500);
  });

  it("lote pequeno não vira rajada: uma consulta só", async () => {
    const { POST } = await import("@/app/api/v1/products/images/route");
    await POST(requisicao(ids(9)));
    expect(consultas).toHaveLength(1);
  });

  it("recusa lote acima do teto com 422 em vez de mandar tudo", async () => {
    const { POST } = await import("@/app/api/v1/products/images/route");
    const res = await POST(requisicao(ids(501)));
    expect(res.status).toBe(422);
    expect(consultas).toHaveLength(0);
  });
});
