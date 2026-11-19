import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  env: { SENTINEL_ENABLED: "true", INTERNAL_CRON_SECRET: "s3cr3t", INTERNAL_SECRET: null },
}));
vi.mock("@/lib/sentinel/agenda", () => ({ organizacoesDevidas: vi.fn() }));
vi.mock("@/lib/sentinel/execucao", () => ({ executarSentinela: vi.fn() }));

import { organizacoesDevidas } from "@/lib/sentinel/agenda";
import { executarSentinela } from "@/lib/sentinel/execucao";

import { GET } from "./route";

const ATIVA = "a0290000-0000-4000-8000-000000000001";
const SUSPENSA = "a0290000-0000-4000-8000-000000000002";

function pedido(): NextRequest {
  return new NextRequest("http://localhost/api/v1/cron/sentinel", {
    headers: { authorization: "Bearer s3cr3t" },
  });
}

function resultado(organizationId: string, suspensa: boolean) {
  return {
    status: suspensa ? "ignorada" : "sucesso",
    execucaoId: `run-${organizationId}`,
    achados: suspensa ? 0 : 3,
    criadas: suspensa ? 0 : 2,
    reafirmadas: suspensa ? 0 : 1,
    encerradas: suspensa ? 5 : 0,
    erros: 0,
    truncado: false,
    duracaoMs: 1,
    falhas: [],
    motivo: suspensa ? "organizacao_suspensa" : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(organizacoesDevidas).mockResolvedValue({
    devidas: [{ organizationId: ATIVA, intervaloMinutos: 360 }],
    suspensas: [{ organizationId: SUSPENSA, intervaloMinutos: 360 }],
  });
  vi.mocked(executarSentinela).mockImplementation(async ({ organizationId }) =>
    resultado(organizationId, organizationId === SUSPENSA) as never,
  );
});

describe("Cron do Sentinel — contagem honesta com org suspensa", () => {
  it("roda as ativas primeiro e reporta organizacoes_puladas", async () => {
    const res = await GET(pedido());
    expect(res.status).toBe(200);

    const corpo = (await res.json()) as {
      data: {
        organizacoes: Array<{ organization_id: string; motivo: string | null }>;
        organizacoes_puladas: number;
      };
    };

    expect(corpo.data.organizacoes_puladas).toBe(1);
    expect(corpo.data.organizacoes.map((o) => o.organization_id)).toEqual([ATIVA, SUSPENSA]);
    expect(corpo.data.organizacoes[1]?.motivo).toBe("organizacao_suspensa");
    expect(executarSentinela).toHaveBeenNthCalledWith(1, {
      organizationId: ATIVA,
      origem: "cron",
    });
    expect(executarSentinela).toHaveBeenNthCalledWith(2, {
      organizationId: SUSPENSA,
      origem: "cron",
    });
  });

  it("tick sem org devida responde vazio e organizacoes_puladas 0", async () => {
    vi.mocked(organizacoesDevidas).mockResolvedValue({ devidas: [], suspensas: [] });
    const res = await GET(pedido());
    const corpo = (await res.json()) as {
      data: { organizacoes: unknown[]; organizacoes_puladas: number };
    };
    expect(corpo.data.organizacoes).toEqual([]);
    expect(corpo.data.organizacoes_puladas).toBe(0);
  });
});
