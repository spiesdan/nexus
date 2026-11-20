import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

import { GET } from "./route";

type Intervalo = { de: number; ate: number };
type Resultado = { data: unknown; count?: number; error: { message: string } | null };
type Fonte = Resultado | ((intervalo: Intervalo) => Resultado);

/** O builder falso honra `range(de, ate)`: sem isso o teste não enxerga
 *  paginação — devolveria a mesma página em loop, ou passaria sem provar nada. */
function builder(fonte: Fonte) {
  const q: Record<string, unknown> = {};
  let de = 0;
  let ate = Number.POSITIVE_INFINITY;
  for (const metodo of ["select", "is", "eq", "limit", "order", "gte", "neq"]) q[metodo] = () => q;
  q.range = (novoDe: number, novoAte: number) => {
    de = novoDe;
    ate = novoAte;
    return q;
  };
  const resolver = (intervalo: Intervalo) =>
    typeof fonte === "function" ? fonte(intervalo) : fonte;
  q.maybeSingle = async () => resolver({ de: 0, ate: Number.POSITIVE_INFINITY });
  q.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve(resolver({ de, ate })).then(ok, falha);
  return q;
}

const from = vi.fn();
const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({} as never);
});

function montar(
  orgs: Array<{ id: string }>,
  settings: Array<Record<string, unknown>>,
) {
  from.mockImplementation((tabela: string) => {
    if (tabela === "api_request_probes") {
      return builder({ data: null, error: null });
    }
    if (tabela === "api_request_samples") {
      return builder({
        data: { created_at: "2026-11-20T00:00:00.000Z" },
        count: 0,
        error: null,
      });
    }
    const linhas =
      tabela === "organizations" ? (orgs as unknown[]) : (settings as unknown[]);
    return builder(({ de, ate }) => ({ data: linhas.slice(de, ate + 1), error: null }));
  });
  rpc.mockImplementation(async (fn: string) =>
    fn === "fn_slo_api_rotas"
      ? { data: [], error: null }
      : { data: { total: 0, erros: 0, p95: null }, error: null },
  );
  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as never);
}

async function corpo(res: Response) {
  return (await res.json()) as {
    data: {
      sonda: {
        id: string;
        created_at: string;
        origem: string;
        duracao_ms: number;
        ok: boolean;
      } | null;
      serie: {
        amostras: number;
        rotas: number;
        primeira_em: string | null;
        ultima_em: string | null;
      };
      slos: Array<{
        id: string;
        valor: number | null;
        estado: string;
        detalhe?: Record<string, unknown>;
      }>;
    };
    error?: { code: string };
  };
}

describe("GET /api/v1/admin/observabilidade", () => {
  it("sem platform admin é 403 e não toca o banco", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("redirect"));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("sem série histórica, disponibilidade e latência dizem isso — não zero", async () => {
    montar([], []);
    const res = await GET();
    expect(res.status).toBe(200);

    const { slos, serie, sonda } = (await corpo(res)).data;
    expect(sonda).toBeNull();
    expect(serie).toEqual({
      amostras: 0,
      rotas: 0,
      primeira_em: "2026-11-20T00:00:00.000Z",
      ultima_em: "2026-11-20T00:00:00.000Z",
    });
    expect(slos).toHaveLength(3);
    for (const id of ["disponibilidade", "latencia"]) {
      const slo = slos.find((s) => s.id === id);
      expect(slo).toMatchObject({ valor: null, estado: "sem_historico" });
    }
  });

  it("frescor do Sentinel mede orgs ativas e ignora desativada/suspensa", async () => {
    montar(
      [{ id: "org-fresca" }, { id: "org-atrasada" }],
      [
        {
          organization_id: "org-fresca",
          ativo: true,
          intervalo_minutos: 360,
          ultima_execucao_em: new Date().toISOString(),
        },
        {
          organization_id: "org-atrasada",
          ativo: true,
          intervalo_minutos: 360,
          ultima_execucao_em: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    );

    const res = await GET();
    const slo = (await corpo(res)).data.slos.find((s) => s.id === "frescor_sentinel");
    expect(slo).toMatchObject({
      valor: 50,
      estado: "estourado",
      detalhe: { orgs_em_dia: 1, orgs_ativas: 2 },
    });
  });

  it("passa do teto de 1.000 do PostgREST sem truncar em silêncio", async () => {
    // `max_rows = 1000` corta `.limit(5_000)` sem erro. O denominador do SLO
    // não pode virar "o tamanho da página".
    const orgs = Array.from({ length: 1_001 }, (_, i) => ({ id: `org-${i}` }));
    montar(orgs, []);

    const res = await GET();
    const slo = (await corpo(res)).data.slos.find((s) => s.id === "frescor_sentinel");
    expect(slo).toMatchObject({
      detalhe: { orgs_ativas: 1_001, amostra_truncada: false },
    });
  });

  it("com amostras suficientes calcula disponibilidade e p95 reais", async () => {
    montar([{ id: "org-a" }], []);
    rpc.mockImplementation(async (fn: string) =>
      fn === "fn_slo_api_rotas"
        ? { data: [{ route: "/api/v1/contacts", total: 1_000, erros: 2, p95: 450 }], error: null }
        : { data: { total: 1_000, erros: 2, p95: 450.4 }, error: null },
    );

    const res = await GET();
    const { slos } = (await corpo(res)).data;
    expect(slos.find((s) => s.id === "disponibilidade")).toMatchObject({
      valor: 99.8,
      estado: "ok",
      detalhe: { amostras: 1_000, erros: 2 },
    });
    expect(slos.find((s) => s.id === "latencia")).toMatchObject({
      valor: 450,
      estado: "ok",
      detalhe: { amostras: 1_000 },
    });
  });

  it("erro de leitura vira 500, não painel vazio", async () => {
    from.mockImplementation((tabela: string) =>
      builder(tabela === "organizations" ? { data: null, error: { message: "db" } } : { data: [], error: null }),
    );
    rpc.mockResolvedValue({ data: { total: 0, erros: 0, p95: null }, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as never);
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
