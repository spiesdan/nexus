/**
 * Segundo caso do Nível 2 — liberar claim de conversa parada.
 *
 * A rota prova o que antecede a escrita: manager, ocorrência aprovada, regra/
 * entidade do caso, motivo obrigatório, hash/antes do dry-run e CAS. A recusa
 * em qualquer alvo fiscal/financeiro é por allowlist de regra/entidade.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { POST as executar } from "@/app/api/v1/sentinel/occurrences/[id]/correcao/conversa/route";
import { POST as reverter } from "@/app/api/v1/sentinel/occurrences/[id]/correcao/conversa/reverter/route";
import { POST as simular } from "@/app/api/v1/sentinel/occurrences/[id]/correcao/conversa/simular/route";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { hashDaCorrecao } from "@/lib/sentinel/correcao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ID = "a0280000-5555-4000-8000-000000000001";
const CONV = "a0280000-4444-4000-8000-000000000001";
const ORG = "a0280000-0000-4000-8000-000000000001";
const ATENDENTE = "a0280000-1111-4000-8000-000000000001";

const ASSIGNED = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
const ULTIMA = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();

const from = vi.fn();
const rpc = vi.fn();

function auth() {
  return {
    ok: true,
    user: { id: "user-1", is_platform_admin: false },
    org: { orgId: ORG, role: "manager" },
  };
}

function ocorrencia(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    regra: "operacao.conversa_claim_parado",
    entidade_tipo: "conversations",
    entidade_id: CONV,
    estado: "aprovada",
    ...over,
  };
}

function conversa(over: Record<string, unknown> = {}) {
  return {
    id: CONV,
    organization_id: ORG,
    status: "claimed",
    assigned_to_user_id: ATENDENTE,
    assigned_at: ASSIGNED,
    last_message_at: ULTIMA,
    ...over,
  };
}

function cliente(oc: ReturnType<typeof ocorrencia> | null, cv: ReturnType<typeof conversa> | null) {
  from.mockImplementation((tabela: string) => {
    const dado = tabela === "sentinel_occurrences" ? oc : tabela === "conversations" ? cv : null;
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: dado, error: null }) }),
        }),
      }),
    };
  });
}

function pedido(rota: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost${rota}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = () => ({ params: Promise.resolve({ id: ID }) });

async function corpo(res: Response) {
  return (await res.json()) as {
    data?: { plano?: Record<string, unknown>; estado?: string };
    error?: { code?: string };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
  vi.mocked(audit).mockResolvedValue(undefined as never);
  rpc.mockResolvedValue({
    data: [{ occurrence_id: ID, conversa_id: CONV, estado: "corrigida" }],
    error: null,
  });
  cliente(ocorrencia(), conversa());
});

describe("conversa parada — simular", () => {
  it("não-gestor recebe 403 antes do banco", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const res = await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa/simular`), ctx());
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("alvo fiscal/financeiro é recusa dura (422)", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth() as never);
    cliente(ocorrencia({ regra: "fiscal.nota_rejeitada", entidade_tipo: "invoices" }), conversa());
    const res = await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa/simular`), ctx());
    expect(res.status).toBe(422);
    expect((await corpo(res)).error?.code).toBe("correcao_nao_suportada");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não aprovada é 409; elegível devolve antes/depois/hash sem escrever", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth() as never);
    cliente(ocorrencia({ estado: "acao_necessaria" }), conversa());
    expect(
      (await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa/simular`), ctx())).status,
    ).toBe(409);

    cliente(ocorrencia(), conversa());
    const res = await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa/simular`), ctx());
    expect(res.status).toBe(200);
    const plano = (await corpo(res)).data?.plano as Record<string, unknown>;
    expect(plano.antes).toEqual({ atendente_id: ATENDENTE, assigned_at: ASSIGNED });
    expect(plano.depois).toEqual({ status: "open", atendente_id: null, assigned_at: null });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("conversa parada — executar", () => {
  function body(over: Record<string, unknown> = {}) {
    return {
      confirmado: true,
      motivo: "responsável de férias",
      antes_atendente: ATENDENTE,
      antes_assigned_at: ASSIGNED,
      hash: hashDaCorrecao(CONV, `${ATENDENTE}|${ASSIGNED}`, "open"),
      ...over,
    };
  }

  it("motivo vazio é 422; hash de outro plano é 409", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth() as never);
    expect(
      (await executar(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa`, body({ motivo: " " })), ctx())).status,
    ).toBe(422);

    const res = await executar(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa`, body({ hash: "a".repeat(64) })),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect((await corpo(res)).error?.code).toBe("plano_desatualizado");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("executa com motivo/antes revisados e audita", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth() as never);
    const res = await executar(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa`, body()), ctx());
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fn_sentinel_liberar_conversa", {
      p_organization_id: ORG,
      p_occurrence_id: ID,
      p_ator: "user-1",
      p_motivo: "responsável de férias",
      p_atendente: ATENDENTE,
      p_assigned_at: ASSIGNED,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentinel.correction_applied",
        metadata: expect.objectContaining({ correcao: "liberar_conversa", conversa_id: CONV }),
      }),
    );
  });

  it("CAS perdido (RPC sem linha) é 409 e não audita sucesso", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth() as never);
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await executar(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa`, body()), ctx());
    expect(res.status).toBe(409);
    expect((await corpo(res)).error?.code).toBe("correcao_nao_aplicada");
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("conversa parada — reverter", () => {
  it("não corrigida é 409; corrigida e ainda livre chama a RPC e audita", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth() as never);
    cliente(ocorrencia({ estado: "aprovada" }), conversa({ status: "open" }));
    expect(
      (await reverter(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa/reverter`), ctx())).status,
    ).toBe(409);

    cliente(ocorrencia({ estado: "corrigida" }), conversa({ status: "open", assigned_to_user_id: null, assigned_at: null }));
    rpc.mockResolvedValue({
      data: [{ occurrence_id: ID, conversa_id: CONV, atendente_restaurado: ATENDENTE, estado: "nova" }],
      error: null,
    });
    const res = await reverter(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa/reverter`),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fn_sentinel_reverter_liberacao_conversa", {
      p_organization_id: ORG,
      p_occurrence_id: ID,
      p_ator: "user-1",
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sentinel.correction_reverted" }),
    );
  });

  it("outro agente assumiu (RPC sem linha) é 409", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth() as never);
    cliente(ocorrencia({ estado: "corrigida" }), conversa({ status: "claimed" }));
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await reverter(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/conversa/reverter`),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect((await corpo(res)).error?.code).toBe("reversao_indisponivel");
  });
});
