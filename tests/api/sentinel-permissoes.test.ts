/**
 * A PORTA DE ESCRITA DO SENTINEL É A ROTA — E A ROTA COBRA GESTOR.
 *
 * O painel esconde botões por papel, mas esconder não é autorizar: um PATCH
 * direto com a sessão de um `agent` não pode ignorar/encerrar/aprovar. Este
 * teste prova a régua no fio, onde ela vale:
 *
 *  - `agent` assume e pede ação;
 *  - `agent` NÃO ignora/encerra (403, sem RPC);
 *  - `manager` ignora com motivo, e sem motivo é 422;
 *  - transição fora da máquina de estados é 422;
 *  - platform admin não depende do papel da organização.
 *
 * O banco é dublado: o que se mede aqui é a decisão da rota antes de qualquer
 * escrita, não a transação (essa é do `fn_sentinel_aplicar_mudanca` + test:db).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { PATCH } from "@/app/api/v1/sentinel/occurrences/[id]/route";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EstadoOcorrencia } from "@/lib/sentinel/tipos";

const ID = "a0130000-3333-4000-8000-000000000001";
const ORG = "a0130000-0000-4000-8000-000000000001";

const from = vi.fn();
const rpc = vi.fn();

type Papel = "viewer" | "agent" | "manager" | "admin";

function auth(papel: Papel, opts: { plataforma?: boolean } = {}) {
  return {
    ok: true,
    user: { id: "user-1", is_platform_admin: opts.plataforma ?? false },
    org: { orgId: ORG, role: papel },
  };
}

function clienteCom(estado: EstadoOcorrencia) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: ID, estado, responsavel_user_id: null },
    error: null,
  });
  const eqId = vi.fn(() => ({ maybeSingle }));
  const eqOrg = vi.fn(() => ({ eq: eqId }));
  const select = vi.fn(() => ({ eq: eqOrg }));
  from.mockReturnValue({ select });
}

function pedido(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/sentinel/occurrences/${ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: ID }) };
}

async function corpo(res: Response) {
  return (await res.json()) as {
    data?: { estado?: string };
    error?: { code?: string; message?: string };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
  vi.mocked(audit).mockResolvedValue(undefined as never);
  rpc.mockResolvedValue({
    data: [{ ocorrencia_id: ID, estado_resultante: "investigando", criada: false }],
    error: null,
  });
});

describe("PATCH /api/v1/sentinel/occurrences/[id]", () => {
  it("auth negado não toca no banco", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);

    const res = await PATCH(pedido({ estado: "investigando" }), ctx());
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("agent assume (investigando): 200 e vira responsável", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("agent") as never);
    clienteCom("nova");

    const res = await PATCH(pedido({ estado: "investigando" }), ctx());
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "fn_sentinel_aplicar_mudanca",
      expect.objectContaining({
        p_organization_id: ORG,
        p_occurrence_id: ID,
        p_estado: "investigando",
        p_responsavel_user_id: "user-1",
        p_ator: "user-1",
      }),
    );
  });

  it("agent NÃO ignora: 403 antes de qualquer RPC", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("agent") as never);
    clienteCom("nova");

    const res = await PATCH(
      pedido({ estado: "ignorada", motivo: "falso positivo do detector" }),
      ctx(),
    );
    expect(res.status).toBe(403);
    expect((await corpo(res)).error?.code).toBe("papel_insuficiente");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("agent NÃO encerra: 403 antes de qualquer RPC", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("agent") as never);
    clienteCom("investigando");

    const res = await PATCH(pedido({ estado: "encerrada", motivo: "acabou" }), ctx());
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("manager ignora sem motivo: 422 motivo_obrigatorio, sem RPC", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    clienteCom("nova");

    const res = await PATCH(pedido({ estado: "ignorada" }), ctx());
    expect(res.status).toBe(422);
    expect((await corpo(res)).error?.code).toBe("motivo_obrigatorio");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("manager ignora com motivo: 200 e o motivo vai no histórico", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    clienteCom("nova");

    const res = await PATCH(
      pedido({ estado: "ignorada", motivo: "falso positivo do detector" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "fn_sentinel_aplicar_mudanca",
      expect.objectContaining({
        p_estado: "ignorada",
        p_ignorada_motivo: "falso positivo do detector",
        p_ator: "user-1",
      }),
    );
    // A decisão é auditada; o texto livre do motivo não entra no audit.
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentinel.occurrence_state",
        organizationId: ORG,
        resourceId: ID,
      }),
    );
  });

  it("transição fora da máquina de estados: 422, sem RPC", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    clienteCom("encerrada");

    const res = await PATCH(pedido({ estado: "aprovada" }), ctx());
    expect(res.status).toBe(422);
    expect((await corpo(res)).error?.code).toBe("transicao_invalida");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("platform admin com papel agent pode ignorar (a plataforma manda)", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("agent", { plataforma: true }) as never);
    clienteCom("nova");

    const res = await PATCH(
      pedido({ estado: "ignorada", motivo: "triagem da plataforma" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "fn_sentinel_aplicar_mudanca",
      expect.objectContaining({ p_estado: "ignorada" }),
    );
  });
});
