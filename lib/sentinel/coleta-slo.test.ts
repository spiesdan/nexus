import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { coletarSnapshot } from "./coleta";
import { slosEstourados } from "./regras-plataforma";

/**
 * A ponte que faltava: o array da RPC vira `snapshot.sloApi.total > 0`, e o
 * detector abre a ocorrência de latência. Sem o fix, `total` era 0 e o
 * detector devolvia `null` — SLO estourado em produção, nenhuma ocorrência.
 */
function adminFake() {
  const rpc = vi.fn(async (fn: string) =>
    fn === "fn_slo_api_resumo"
      ? { data: [{ total: 267, erros: 0, p95: 2660 }], error: null }
      : fn === "fn_slo_api_rotas"
        ? {
            data: [
              { route: "/api/v1/conversations", total: 259, erros: 0, p95: 2673 },
              { route: "/api/v1/commercial-orders", total: 3, erros: 0, p95: 1378 },
            ],
            error: null,
          }
        : { data: [], error: null },
  );

  const from = () => {
    const q: Record<string, unknown> = {};
    for (const m of [
      "select",
      "eq",
      "gte",
      "lt",
      "gt",
      "neq",
      "in",
      "or",
      "not",
      "order",
      "limit",
      "range",
    ]) {
      q[m] = () => q;
    }
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.then = (resolve: (v: unknown) => void) => Promise.resolve(resolve({ data: [], error: null }));
    return q;
  };
  return { from, rpc };
}

describe("coleta do Sentinel — resumo do SLO", () => {
  it("RPC returns table (array) vira total 267 e abre plataforma.slo_estourado|latencia", async () => {
    const admin = adminFake();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const r = await coletarSnapshot("org-1", Date.parse("2026-11-23T10:00:00.000Z"));

    expect(r.snapshot.sloApi?.total).toBe(267);
    expect(r.snapshot.sloApi?.p95).toBe(2660);
    expect(r.falhas.filter((f) => f.startsWith("slo_api"))).toEqual([]);

    const achados = slosEstourados(r.snapshot);
    expect(achados).toHaveLength(1);
    expect(achados![0]).toMatchObject({
      regra: "plataforma.slo_estourado",
      entidadeId: "latencia",
      severidade: "critica",
    });
    expect(achados![0]?.evidencia).toMatchObject({ total: 267, p95_ms: 2660 });
  });
});
