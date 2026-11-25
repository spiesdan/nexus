/**
 * A FUSÃO — recusas antes de tocar no banco, e a trilha quando aplica.
 *
 * A recusa de perdedor de OUTRA organização é da função (prova em
 * tests/invariants/clientes-duplicados.test.ts, porque é SECURITY DEFINER);
 * aqui se prova que a rota: (1) não chama a RPC quando o vencedor está na
 * lista, (2) traduz recusa de negócio em 422 em vez de 500, e (3) audita com
 * ids, contagens e motivo no mesmo caminho da resposta.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const VENCEDOR = "33333333-3333-4333-8333-333333333333";
const PERDEDOR = "44444444-4444-4444-8444-444444444444";
const ALHEIO = "55555555-5555-4555-8555-555555555555";

const authzOk = {
  ok: true as const,
  user: { id: "11111111-1111-4111-8111-111111111111", email: "m@j.test" },
  org: { orgId: ORG, role: "manager" as const, name: "Org" },
};

function pedido(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/contacts/duplicados/fundir", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(audit).mockReset();
});

describe("POST /contacts/duplicados/fundir", () => {
  it("recusa 422 quando o vencedor está entre os perdedores — sem chamar a RPC", async () => {
    const rpc = vi.fn();
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    const { POST } = await import("@/app/api/v1/contacts/duplicados/fundir/route");
    const res = await POST(
      pedido({ vencedor_id: VENCEDOR, perdedores_ids: [VENCEDOR, PERDEDOR], motivo: "mesma pessoa" }),
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("recusa 422 quando a lista está vazia (Zod, antes da RPC)", async () => {
    const rpc = vi.fn();
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    const { POST } = await import("@/app/api/v1/contacts/duplicados/fundir/route");
    const res = await POST(pedido({ vencedor_id: VENCEDOR, perdedores_ids: [], motivo: "x y z" }));
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa de outra organização vira 422, não 500", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "perdedor nao pertence a organizacao" },
      }),
    } as never);

    const { POST } = await import("@/app/api/v1/contacts/duplicados/fundir/route");
    const res = await POST(
      pedido({ vencedor_id: VENCEDOR, perdedores_ids: [ALHEIO], motivo: "mesma pessoa" }),
    );
    expect(res.status).toBe(422);
    expect(audit).not.toHaveBeenCalled();
  });

  it("funde, audita ids/contagens/motivo e devolve o que repontou", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          aplicado: true,
          vencedor_id: VENCEDOR,
          contatos_mesclados: 1,
          conversas_fundidas: 0,
          repontados: { commercial_orders: 2, conversations: 1 },
          conflitos: {},
        },
        error: null,
      }),
    } as never);

    const { POST } = await import("@/app/api/v1/contacts/duplicados/fundir/route");
    const res = await POST(
      pedido({ vencedor_id: VENCEDOR, perdedores_ids: [PERDEDOR], motivo: "mesmo cliente" }),
    );
    expect(res.status).toBe(200);

    const corpo = (await res.json()) as {
      data: { contatos_mesclados: number; repontados: Record<string, number> };
    };
    expect(corpo.data.contatos_mesclados).toBe(1);
    expect(corpo.data.repontados.commercial_orders).toBe(2);

    expect(audit).toHaveBeenCalledTimes(1);
    const entrada = vi.mocked(audit).mock.calls[0]![0];
    expect(entrada.action).toBe("contact.merged");
    expect(entrada.organizationId).toBe(ORG);
    expect(entrada.metadata).toMatchObject({
      motivo: "mesmo cliente",
      vencedor_id: VENCEDOR,
      perdedores_ids: [PERDEDOR],
      contatos_mesclados: 1,
    });
  });
});
