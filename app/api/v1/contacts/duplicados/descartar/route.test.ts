/**
 * O DESCARTE — "não é a mesma pessoa" é uma decisão registrada, não um clique
 * que some. A rota grava a chave estável e audita o motivo; o grupo sai da
 * próxima varredura (prova na RPC, em tests/invariants).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const CHAVE = "joao silva|canoinhas";

const authzOk = {
  ok: true as const,
  user: { id: USER, email: "m@j.test" },
  org: { orgId: ORG, role: "manager" as const, name: "Org" },
};

function pedido(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/contacts/duplicados/descartar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function duble(erro: { message: string } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error: erro });
  return { from: vi.fn(() => ({ upsert })), upsert };
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(createClient).mockReset();
  vi.mocked(audit).mockReset();
});

describe("POST /contacts/duplicados/descartar", () => {
  it("grava a chave na org do authz e audita o motivo", async () => {
    const d = duble();
    vi.mocked(createClient).mockResolvedValue(d as never);

    const { POST } = await import("@/app/api/v1/contacts/duplicados/descartar/route");
    const res = await POST(pedido({ chave: CHAVE, motivo: "pessoas diferentes" }));
    expect(res.status).toBe(200);

    expect(d.upsert).toHaveBeenCalledWith(
      { organization_id: ORG, chave: CHAVE, motivo: "pessoas diferentes", created_by: USER },
      { onConflict: "organization_id,chave" },
    );
    expect(audit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({
      action: "contact.duplicate_dismissed",
      organizationId: ORG,
      metadata: { chave: CHAVE, motivo: "pessoas diferentes" },
    });
  });

  it("erro do banco é 500 e NÃO audita uma decisão que não foi gravada", async () => {
    vi.mocked(createClient).mockResolvedValue(duble({ message: "rls" }) as never);

    const { POST } = await import("@/app/api/v1/contacts/duplicados/descartar/route");
    const res = await POST(pedido({ chave: CHAVE, motivo: "pessoas diferentes" }));
    expect(res.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });

  it("motivo vazio é 422 — descartar sem porquê não passa", async () => {
    const d = duble();
    vi.mocked(createClient).mockResolvedValue(d as never);

    const { POST } = await import("@/app/api/v1/contacts/duplicados/descartar/route");
    const res = await POST(pedido({ chave: CHAVE, motivo: "" }));
    expect(res.status).toBe(422);
    expect(d.upsert).not.toHaveBeenCalled();
  });
});
