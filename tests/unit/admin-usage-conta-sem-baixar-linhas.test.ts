/**
 * F-30 (6.5) — `/api/v1/admin/usage` conta no banco, não baixando a janela.
 *
 * A rota agregava 7/30/90 dias de `messages` e `conversations` e contava em
 * memória, baixando TODAS as linhas do período para produzir um inteiro. Com
 * uma instalação de uso real isso é a tabela inteira atravessando a rede para
 * somar `length`.
 *
 * O que se mede aqui, na chamada (não no texto do arquivo):
 *   1. as contagens por organização usam `count: "exact", head: true` —
 *      nenhuma linha trafega;
 *   2. `conversations` não é lida como linha em lugar nenhum;
 *   3. `llm_calls` é lida UMA vez e serve total e série (antes eram duas
 *      passadas pela mesma janela);
 *   4. a série diária de mensagens continua vindo de linhas — é gráfico, não
 *      contagem, e o PostgREST não faz `group by`. O teto está declarado.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";

type SelectOpts = { count?: string; head?: boolean } | undefined;

function fakeAdmin(chamadas: Array<{ tabela: string; colunas: string; opts: SelectOpts }>) {
  const q: Record<string, unknown> = {};
  let tabela = "";
  let colunas = "";
  let opts: SelectOpts;
  let filtros: Array<[string, unknown]> = [];

  q.select = (cols: string, o?: SelectOpts) => {
    colunas = cols;
    opts = o;
    chamadas.push({ tabela, colunas, opts });
    return q;
  };
  for (const m of ["eq", "in", "gte", "order", "limit", "range"]) {
    q[m] = (...args: unknown[]) => {
      if (m === "eq") filtros.push([String(args[0]), args[1]]);
      return q;
    };
  }
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.then = (resolve: (v: unknown) => unknown) => {
    // Contagem: devolve um inteiro; leitura de linha: devolve linhas vazias.
    if (opts?.head) return Promise.resolve({ data: null, count: 3, error: null }).then(resolve);
    if (tabela === "organizations") {
      return Promise.resolve({
        data: [{ id: ORG, display_name: "Org", slug: "org" }],
        error: null,
      }).then(resolve);
    }
    return Promise.resolve({
      data:
        tabela === "messages"
          ? [{ created_at: "2026-11-01T10:00:00Z" }]
          : tabela === "llm_calls"
            ? [{ organization_id: ORG, input_tokens: 10, output_tokens: 5, cost_cents: 7, created_at: "2026-11-01T10:00:00Z" }]
            : [],
      error: null,
    }).then(resolve);
  };
  return {
    from: (t: string) => {
      tabela = t;
      filtros = [];
      return q;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "admin-1" },
  } as never);
});

describe("GET /api/v1/admin/usage — contagem sem baixar linhas", () => {
  it("contagens usam head:true; conversations não é lida como linha", async () => {
    const chamadas: Array<{ tabela: string; colunas: string; opts: SelectOpts }> = [];
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin(chamadas) as never);

    const { GET } = await import("@/app/api/v1/admin/usage/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/usage?range=30d"));
    expect(res.status).toBe(200);

    const contagens = chamadas.filter((c) => c.opts?.head === true);
    expect(contagens.map((c) => c.tabela).sort()).toEqual([
      "conversations",
      "llm_calls",
      "messages",
    ]);

    // O padrão antigo: select("organization_id") sem head, varrendo a janela.
    const varredurasDeContagem = chamadas.filter(
      (c) => c.colunas === "organization_id" && c.tabela !== "organizations",
    );
    expect(varredurasDeContagem, "nenhuma linha pode ser baixada só para contar").toEqual([]);

    // `conversations` só aparece como contagem — nunca como leitura de linha.
    const leiturasDeConversas = chamadas.filter(
      (c) => c.tabela === "conversations" && c.opts?.head !== true,
    );
    expect(leiturasDeConversas).toEqual([]);

    // `llm_calls` é uma passada só (total + série).
    const leiturasDeIA = chamadas.filter(
      (c) => c.tabela === "llm_calls" && c.opts?.head !== true,
    );
    expect(leiturasDeIA).toHaveLength(1);
  });

  it("a resposta continua no contrato (range, tenants, series)", async () => {
    const chamadas: Array<{ tabela: string; colunas: string; opts: SelectOpts }> = [];
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin(chamadas) as never);

    const { GET } = await import("@/app/api/v1/admin/usage/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/usage?range=7d"));
    const corpo = (await res.json()) as {
      data: { range: string; tenants: Array<{ organization_id: string; messages_count: number }>; series: { messages: unknown[] } };
    };
    expect(corpo.data.range).toBe("7d");
    expect(corpo.data.tenants[0]?.organization_id).toBe(ORG);
    expect(corpo.data.tenants[0]?.messages_count).toBe(3);
    expect(corpo.data.series.messages).toHaveLength(7);
  });
});
