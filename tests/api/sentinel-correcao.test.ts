/**
 * NÍVEL 2 RESTRITO — a rota que executa correção aprovada.
 *
 * O que se prova no fio, antes de qualquer escrita:
 *  - só `manager` simula/executa/reverte;
 *  - só a regra/entidade do job de manutenção é suportada;
 *  - a ocorrência precisa estar `aprovada` (execução) ou `corrigida` (reversão);
 *  - o `hash` do dry-run amarra o antes/depois; plano diferente é 409;
 *  - a RPC é chamada com os valores revisados, e o audit registra a decisão.
 *
 * A semântica do CAS e da reversão honesta é do banco
 * (`tests/invariants/sentinel-correcao.test.ts`), não deste dublê.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { POST as executar } from "@/app/api/v1/sentinel/occurrences/[id]/correcao/route";
import { POST as reverter } from "@/app/api/v1/sentinel/occurrences/[id]/correcao/reverter/route";
import { POST as simular } from "@/app/api/v1/sentinel/occurrences/[id]/correcao/simular/route";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { hashDaCorrecao } from "@/lib/sentinel/correcao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ID = "a0250000-3333-4000-8000-000000000001";
const JOB = "a0250000-4444-4000-8000-000000000002";
const ORG = "a0250000-0000-4000-8000-000000000001";

const ANTES = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
const DEPOIS = new Date(Date.now() + 1_000).toISOString();

const from = vi.fn();
const rpc = vi.fn();

function auth(role: "agent" | "manager") {
  return {
    ok: true,
    user: { id: "user-1", is_platform_admin: false },
    org: { orgId: ORG, role },
  };
}

function ocorrencia(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    regra: "operacao.job_fila_travado",
    entidade_tipo: "job_queue",
    entidade_id: JOB,
    estado: "aprovada",
    ...over,
  };
}

function job(over: Record<string, unknown> = {}) {
  return {
    id: JOB,
    organization_id: ORG,
    kind: "watchdog",
    status: "pending",
    run_after: ANTES,
    attempts: 1,
    max_attempts: 5,
    ...over,
  };
}

function cliente(oc: ReturnType<typeof ocorrencia> | null, jb: ReturnType<typeof job> | null) {
  from.mockImplementation((tabela: string) => {
    const dado = tabela === "sentinel_occurrences" ? oc : tabela === "job_queue" ? jb : null;
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: dado, error: null }),
          }),
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
    error?: { code?: string; message?: string; details?: unknown };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
  vi.mocked(audit).mockResolvedValue(undefined as never);
  rpc.mockResolvedValue({
    data: [{ occurrence_id: ID, job_id: JOB, estado: "corrigida" }],
    error: null,
  });
  cliente(ocorrencia(), job());
});

describe("correção aprovada — simular", () => {
  it("agent não simula (403) e não toca no admin client", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const res = await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/simular`), ctx());
    expect(res.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith(
      "manager",
      expect.objectContaining({ resource: "sentinel" }),
    );
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("regra fora do allowlist é 422, sem RPC", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    cliente(ocorrencia({ regra: "fiscal.nota_rejeitada", entidade_tipo: "invoices" }), job());
    const res = await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/simular`), ctx());
    expect(res.status).toBe(422);
    expect((await corpo(res)).error?.code).toBe("correcao_nao_suportada");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ocorrência não aprovada é 409 antes do dry-run", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    cliente(ocorrencia({ estado: "acao_necessaria" }), job());
    const res = await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/simular`), ctx());
    expect(res.status).toBe(409);
    expect((await corpo(res)).error?.code).toBe("aprovacao_pendente");
  });

  it("job elegível devolve antes/depois/hash e NÃO executa nada", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    const res = await simular(pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/simular`), ctx());
    expect(res.status).toBe(200);
    const plano = (await corpo(res)).data?.plano as Record<string, unknown>;
    expect(plano.antes).toEqual({ run_after: ANTES });
    expect(plano.depois).toEqual({ run_after: expect.any(String) });
    expect(String(plano.hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("correção aprovada — executar", () => {
  function body(over: Record<string, unknown> = {}) {
    return {
      confirmado: true,
      antes: ANTES,
      depois: DEPOIS,
      hash: hashDaCorrecao(JOB, ANTES, DEPOIS),
      ...over,
    };
  }

  it("sem confirmado é 422", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    const res = await executar(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao`, body({ confirmado: false })),
      ctx(),
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("hash de outro plano é 409, sem RPC", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    const res = await executar(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao`, body({ hash: "a".repeat(64) })),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect((await corpo(res)).error?.code).toBe("plano_desatualizado");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("job que saiu de pending é 409, sem RPC", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    cliente(ocorrencia(), job({ status: "running" }));
    const res = await executar(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao`, body()),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("executa com os valores revisados e audita antes/depois", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    const res = await executar(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao`, body()),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fn_sentinel_corrigir_job", {
      p_organization_id: ORG,
      p_occurrence_id: ID,
      p_ator: "user-1",
      p_antes: ANTES,
      p_depois: DEPOIS,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentinel.correction_applied",
        organizationId: ORG,
        resourceId: ID,
        metadata: expect.objectContaining({
          job_id: JOB,
          run_after_antes: ANTES,
          run_after_depois: DEPOIS,
        }),
      }),
    );
  });

  it("RPC sem linha (CAS perdeu) é 409 e não audita sucesso", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await executar(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao`, body()),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect((await corpo(res)).error?.code).toBe("correcao_nao_aplicada");
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("correção aprovada — reverter", () => {
  it("ocorrência não corrigida é 409", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    cliente(ocorrencia({ estado: "aprovada" }), job());
    const res = await reverter(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/reverter`),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reversão honesta chama a RPC e audita", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    cliente(ocorrencia({ estado: "corrigida" }), job());
    rpc.mockResolvedValue({
      data: [{ occurrence_id: ID, job_id: JOB, run_after_restaurado: ANTES, estado: "nova" }],
      error: null,
    });
    const res = await reverter(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/reverter`),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fn_sentinel_reverter_job", {
      p_organization_id: ORG,
      p_occurrence_id: ID,
      p_ator: "user-1",
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentinel.correction_reverted",
        organizationId: ORG,
        resourceId: ID,
      }),
    );
  });

  it("RPC sem linha (worker reclamou) é 409 — reversão honesta ou nenhuma", async () => {
    vi.mocked(requireRole).mockResolvedValue(auth("manager") as never);
    cliente(ocorrencia({ estado: "corrigida" }), job());
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await reverter(
      pedido(`/api/v1/sentinel/occurrences/${ID}/correcao/reverter`),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect((await corpo(res)).error?.code).toBe("reversao_indisponivel");
    expect(audit).not.toHaveBeenCalled();
  });
});
