import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { SENTINEL_ENABLED: "true" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("./coleta", () => ({ coletarSnapshot: vi.fn() }));
vi.mock("./motor", () => ({ executarDetectores: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";

import { coletarSnapshot } from "./coleta";
import { executarSentinela } from "./execucao";
import { executarDetectores } from "./motor";
import { snapshotVazio } from "./tipos";

const ORG = "a0330000-0000-4000-8000-000000000001";
const RUN = "a0330000-2222-4000-8000-000000000001";

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
const update = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  from.mockImplementation((tabela: string) => {
    if (tabela === "organizations") return builder({ data: { suspended_at: null }, error: null });
    if (tabela === "sentinel_settings") return builder({ data: { ativo: true }, error: null });
    const q = builder({ data: { id: RUN }, error: null });
    q.update = (valor: unknown) => {
      update(valor);
      return q;
    };
    return q;
  });
  rpc.mockResolvedValue({ data: 1, error: null });
  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as never);
  vi.mocked(coletarSnapshot).mockResolvedValue({
    snapshot: snapshotVazio(ORG, Date.now()),
    truncado: false,
    truncados: [],
    falhas: [],
  } as never);
});

function deteccao(over: Record<string, unknown> = {}) {
  return {
    achados: [],
    regrasAvaliadas: ["regra.a"],
    regrasNaoAvaliadas: ["regra.b"],
    temposPorRegra: { "regra.a": 3 },
    falhas: [],
    tempoMs: 8_100,
    truncadoPorTempo: true,
    ...over,
  } as never;
}

describe("Sentinel — encerramento por regra avaliada", () => {
  it("rodada truncada por TEMPO encerra só as regras que rodaram", async () => {
    vi.mocked(executarDetectores).mockReturnValue(deteccao());

    const r = await executarSentinela({ organizationId: ORG, origem: "cron" });

    expect(rpc).toHaveBeenCalledWith("fn_sentinel_encerrar_ausentes", {
      p_organization_id: ORG,
      p_execucao_id: RUN,
      p_regras: ["regra.a"],
    });
    expect(r).toMatchObject({ encerradas: 1 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        detalhe: expect.objectContaining({
          regras_avaliadas_ids: ["regra.a"],
          regras_nao_avaliadas: ["regra.b"],
          tempos_por_regra_ms: { "regra.a": 3 },
        }),
      }),
    );
  });

  it("truncar importações Mercos fecha fiscal/lead e preserva só as regras Mercos", async () => {
    vi.mocked(coletarSnapshot).mockResolvedValue({
      snapshot: snapshotVazio(ORG, Date.now()),
      truncado: true,
      truncados: ["importacoes_mercos"],
      falhas: [],
    } as never);
    vi.mocked(executarDetectores).mockReturnValue(
      deteccao({
        truncadoPorTempo: false,
        regrasAvaliadas: [
          "fiscal.nota_rejeitada",
          "operacao.lead_duplicado",
          "operacao.mercos_importacao_falhou",
        ],
        regrasNaoAvaliadas: [],
      }),
    );

    await executarSentinela({ organizationId: ORG, origem: "cron" });

    expect(rpc).toHaveBeenCalledWith("fn_sentinel_encerrar_ausentes", {
      p_organization_id: ORG,
      p_execucao_id: RUN,
      p_regras: ["fiscal.nota_rejeitada", "operacao.lead_duplicado"],
    });
  });

  it("coleta truncada bloqueia TODAS as regras (snapshot incompleto para todas)", async () => {
    vi.mocked(coletarSnapshot).mockResolvedValue({
      snapshot: snapshotVazio(ORG, Date.now()),
      truncado: true,
      truncados: ["pedidos"],
      falhas: [],
    } as never);
    vi.mocked(executarDetectores).mockReturnValue(deteccao({ truncadoPorTempo: false }));

    await executarSentinela({ organizationId: ORG, origem: "cron" });

    expect(rpc).not.toHaveBeenCalledWith("fn_sentinel_encerrar_ausentes", expect.anything());
  });

  it("regra com falha de registro não encerra; as demais seguem", async () => {
    vi.mocked(executarDetectores).mockReturnValue(
      deteccao({
        achados: [
          {
            regra: "regra.a",
            categoria: "operacao",
            entidadeTipo: "catalog_products",
            entidadeId: "p1",
            titulo: "t",
            resumo: "r",
            causaProvavel: "c",
            severidade: "alta",
            recomendacao: null,
          },
        ],
      }),
    );
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "fn_sentinel_registrar_ocorrencia") return { data: null, error: { message: "db" } };
      return { data: 0, error: null };
    });

    await executarSentinela({ organizationId: ORG, origem: "cron" });

    expect(rpc).not.toHaveBeenCalledWith("fn_sentinel_encerrar_ausentes", {
      p_organization_id: ORG,
      p_execucao_id: RUN,
      p_regras: ["regra.a"],
    });
  });
});
