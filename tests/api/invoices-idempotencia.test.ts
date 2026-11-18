import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

/**
 * D-03 na rota de emissão: replay devolve a MESMA nota com header, payload
 * diferente é 409, e o caminho livre finaliza a chave — nunca deixa a chave
 * reivindicada para trás.
 *
 * A semântica de armazenamento/concorrência é do helper
 * (`lib/api/idempotencia-forte.test.ts`). Aqui se mede o contrato HTTP.
 */

const reservar = vi.fn();
vi.mock("@/lib/api/idempotencia", () => ({
  hashDaRequisicao: () => "hash-do-payload",
  reservarIdempotencia: (...args: unknown[]) => reservar(...args),
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    org: { orgId: "org-1", role: "owner" },
    user: { id: "user-1", is_platform_admin: false },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));

const emitir = vi.fn();
vi.mock("@/lib/fiscal/emitir-nota", () => ({
  emitirNota: (...args: unknown[]) => emitir(...args),
}));

const PEDIDO = "11111111-1111-4111-8111-111111111111";

function pedido(chave?: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/invoices", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(chave ? { "Idempotency-Key": chave } : {}),
    },
    body: JSON.stringify({ order_id: PEDIDO }),
  });
}

beforeEach(() => {
  reservar.mockReset();
  emitir.mockReset();
});

describe("POST /invoices — D-03", () => {
  it("replay devolve a mesma nota com Idempotency-Replayed e não emite de novo", async () => {
    reservar.mockResolvedValue({
      estado: "replay",
      resposta: { status: 201, body: { id: "nota-1", status: "em_emissao" } },
    });

    const { POST } = await import("@/app/api/v1/invoices/route");
    const res = await POST(pedido("chave-1"));
    const json = (await res.json()) as { data: { id: string } };

    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotency-Replayed")).toBe("true");
    expect(json.data.id).toBe("nota-1");
    expect(emitir).not.toHaveBeenCalled();
  });

  it("mesma chave com outro payload é 409 idempotency_conflict", async () => {
    reservar.mockResolvedValue({ estado: "conflito" });

    const { POST } = await import("@/app/api/v1/invoices/route");
    const res = await POST(pedido("chave-1"));
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("idempotency_conflict");
    expect(emitir).not.toHaveBeenCalled();
  });

  it("chave livre emite e finaliza com a nota criada", async () => {
    const finalizar = vi.fn(async () => undefined);
    const abortar = vi.fn(async () => undefined);
    reservar.mockResolvedValue({ estado: "livre", finalizar, abortar });
    const nota = { id: "nota-9", status: "em_emissao" };
    emitir.mockResolvedValue(nota);

    const { POST } = await import("@/app/api/v1/invoices/route");
    const res = await POST(pedido("chave-2"));

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ data: { id: "nota-9" } });
    expect(finalizar).toHaveBeenCalledWith({ status: 201, body: nota });
    expect(abortar).not.toHaveBeenCalled();
  });

  it("falha da emissão aborta a chave (não deixa reivindicação órfã)", async () => {
    const finalizar = vi.fn(async () => undefined);
    const abortar = vi.fn(async () => undefined);
    reservar.mockResolvedValue({ estado: "livre", finalizar, abortar });
    emitir.mockRejectedValue(new ApiError(422, "validation_failed", {}, "req-1", "Pedido inválido."));

    const { POST } = await import("@/app/api/v1/invoices/route");
    const res = await POST(pedido("chave-3"));

    expect(res.status).toBe(422);
    expect(abortar).toHaveBeenCalledTimes(1);
    expect(finalizar).not.toHaveBeenCalled();
  });
});
