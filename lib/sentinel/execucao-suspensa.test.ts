import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { SENTINEL_ENABLED: "true" },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("./coleta", () => ({ coletarSnapshot: vi.fn() }));

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

import { coletarSnapshot } from "./coleta";
import { executarSentinela } from "./execucao";
import { snapshotVazio } from "./tipos";

const ORG = "a0290000-0000-4000-8000-000000000001";
const RUN = "a0290000-2222-4000-8000-000000000001";

function builder(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "order", "eq", "limit", "update", "insert", "lt"]) {
    q[metodo] = () => q;
  }
  q.maybeSingle = async () => result;
  q.single = async () => result;
  q.upsert = async () => ({ error: null });
  q.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(ok, falha);
  return q;
}

const rpc = vi.fn();
const from = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  from.mockImplementation((tabela: string) => {
    if (tabela === "organizations") {
      return builder({ data: { suspended_at: "2026-11-19T09:00:00.000Z" }, error: null });
    }
    if (tabela === "sentinel_settings") {
      return builder({ data: { ativo: true }, error: null });
    }
    return builder({ data: { id: RUN }, error: null });
  });
  rpc.mockResolvedValue({ data: 2, error: null });
  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as never);
  vi.mocked(audit).mockResolvedValue(undefined as never);
});

describe("Sentinel — execução de organização suspensa", () => {
  it("não coleta, não detecta, registra a rodada e encerra com motivo", async () => {
    const r = await executarSentinela({ organizationId: ORG, origem: "cron" });

    expect(coletarSnapshot).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("fn_sentinel_encerrar_org_suspensa", {
      p_organization_id: ORG,
      p_execucao_id: RUN,
    });
    expect(r).toMatchObject({
      status: "ignorada",
      motivo: "organizacao_suspensa",
      execucaoId: RUN,
      encerradas: 2,
      achados: 0,
      criadas: 0,
      reafirmadas: 0,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentinel.run",
        metadata: expect.objectContaining({
          status: "ignorada",
          motivo: "organizacao_suspensa",
          encerradas: 2,
        }),
      }),
    );
  });

  it("org ativa continua coletando e não chama o encerramento por suspensão", async () => {
    from.mockImplementation((tabela: string) => {
      if (tabela === "organizations") return builder({ data: { suspended_at: null }, error: null });
      if (tabela === "sentinel_settings") return builder({ data: { ativo: true }, error: null });
      return builder({ data: { id: RUN }, error: null });
    });

    vi.mocked(coletarSnapshot).mockResolvedValue({
      snapshot: snapshotVazio(ORG, Date.now()),
      truncado: false,
      falhas: [],
    } as never);

    const r = await executarSentinela({ organizationId: ORG, origem: "cron" });

    expect(coletarSnapshot).toHaveBeenCalledWith(ORG, expect.any(Number));
    expect(rpc).not.toHaveBeenCalledWith(
      "fn_sentinel_encerrar_org_suspensa",
      expect.anything(),
    );
    expect(r.motivo).not.toBe("organizacao_suspensa");
  });
});
