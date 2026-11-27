/**
 * GET/PATCH /api/v1/prospecting/searches/[id] — o que a tela do Radar lê.
 *
 * A degradação não pode ser um boolean mudo: quando o Maps não executou, a
 * resposta leva `degradada: true` + `degradacao_motivo` legível. A parada não
 * pode fingir ser instantânea: com `parada_solicitada_em` e status running, a
 * resposta diz "parando" e declara o prazo máximo.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const SEARCH = "33333333-3333-4333-8333-333333333333";

type Linha = Record<string, unknown>;

function banco(linhas: { busca: Linha; depoisDoPatch?: Linha }) {
  const updates: unknown[] = [];
  const cliente = {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = () => Promise.resolve({ data: linhas.busca, error: null });
      q.single = () =>
        Promise.resolve({
          data: linhas.depoisDoPatch ?? linhas.busca,
          error: null,
        });
      q.update = (v: unknown) => {
        updates.push(v);
        return q;
      };
      return q;
    },
  };
  return { cliente, updates };
}

const BASE: Linha = {
  id: SEARCH,
  provider: "maps_browser",
  status: "running",
  categorias: ["oficina"],
  total_celulas: 0,
  celulas_processadas: 0,
  progresso: {
    termos_total: 1,
    termos_concluidos: [],
    termos_falhos: [],
    termo_atual: "oficina",
    tentativas: 0,
    bloqueio: null,
    termos_encontradas: {},
  },
  motivo_zero: null,
  degradada: false,
  degradacao_motivo: null,
  parada_solicitada_em: null,
};

function get(): Promise<Response> {
  return import("./route").then(({ GET }) =>
    GET(new NextRequest(`http://x/api/v1/prospecting/searches/${SEARCH}`), {
      params: Promise.resolve({ id: SEARCH }),
    }),
  );
}

function patch(corpo: unknown): Promise<Response> {
  return import("./route").then(({ PATCH }) =>
    PATCH(
      new NextRequest(`http://x/api/v1/prospecting/searches/${SEARCH}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      }),
      { params: Promise.resolve({ id: SEARCH }) },
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1" },
    org: { orgId: ORG, role: "agent" },
  } as never);
});

describe("GET /api/v1/prospecting/searches/[id]", () => {
  it("devolve degradada=true com motivo legível quando o Maps não executou", async () => {
    const { cliente } = banco({
      busca: {
        ...BASE,
        status: "paused",
        degradada: true,
        degradacao_motivo:
          "sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar.",
      },
    });
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const res = await get();
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha };
    expect(corpo.data.degradada).toBe(true);
    expect(String(corpo.data.degradacao_motivo)).toContain("fast_mode");
    expect(String(corpo.data.parcial_motivo)).toContain("degradada");
  });

  it("running com pause pedido mostra 'parando' e o prazo máximo", async () => {
    const { cliente } = banco({
      busca: { ...BASE, parada_solicitada_em: "2026-11-27T10:00:00Z" },
    });
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const corpo = (await (await get()).json()) as { data: Linha };
    expect(corpo.data.estado_parada).toBe("parando");
    expect(corpo.data.parada_maxima_s).toBe(125);
  });

  it("paused com pause pedido mostra 'parado'", async () => {
    const { cliente } = banco({
      busca: {
        ...BASE,
        status: "paused",
        parada_solicitada_em: "2026-11-27T10:00:00Z",
      },
    });
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const corpo = (await (await get()).json()) as { data: Linha };
    expect(corpo.data.estado_parada).toBe("parado");
  });
});

describe("PATCH — pause declarado", () => {
  it("em busca running grava parada_solicitada_em e NÃO finge paused", async () => {
    const { cliente, updates } = banco({
      busca: { ...BASE, status: "running" },
      depoisDoPatch: {
        ...BASE,
        status: "running",
        parada_solicitada_em: "2026-11-27T10:00:00Z",
      },
    });
    vi.mocked(createClient).mockResolvedValue(cliente as never);

    const res = await patch({ acao: "pause" });
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ parada_solicitada_em: expect.any(String) });
    const corpo = (await res.json()) as { data: Linha };
    expect(corpo.data.estado_parada).toBe("parando");
    expect(corpo.data.parada_maxima_s).toBe(125);
  });
});
