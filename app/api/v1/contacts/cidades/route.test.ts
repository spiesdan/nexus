/**
 * A ROTA DO SELETOR — canônica, com o número do dado ruim.
 *
 * O caso que originou o bug: `AGROCOMERCIAL SCHULTZ LTDA ME` aparecendo como
 * cidade. A regra de agrupamento mora em `lib/contacts/cidades.ts` (teste
 * próprio); aqui se prova a LIGAÇÃO com a rota: o que o banco devolve vira
 * opção canônica, o que não é município fica de fora e `meta.sem_municipio`
 * publica a contagem — dado ruim não some sem número.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const authzOk = {
  ok: true as const,
  user: { id: "11111111-1111-4111-8111-111111111111", email: "v@j.test" },
  org: { orgId: ORG, role: "viewer" as const, name: "Org" },
};

function duble(cfg: { linhas?: Array<{ cidade: string | null; uf: string | null }>; erro?: { message: string } | null } = {}) {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.is = () => q;
  q.order = () => q;
  q.range = () => q;
  q.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data: cfg.linhas ?? [], error: cfg.erro ?? null }).then(resolve);
  return { from: () => q };
}

function req(): NextRequest {
  return new NextRequest("http://localhost/api/v1/contacts/cidades");
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(createClient).mockReset();
});

describe("GET /contacts/cidades", () => {
  it("devolve município canônico com variantes e conta quem ficou de fora", async () => {
    vi.mocked(createClient).mockResolvedValue(
      duble({
        linhas: [
          { cidade: "CANOINHAS", uf: "SC" },
          { cidade: "Canoinhas", uf: "SC" },
          { cidade: "AGROCOMERCIAL SCHULTZ LTDA ME", uf: "SC" },
          { cidade: null, uf: null },
        ],
      }) as never,
    );

    const { GET } = await import("@/app/api/v1/contacts/cidades/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: Array<{ rotulo: string; variantes: string[] }>;
      meta: { sem_municipio: number; total_contatos: number };
    };

    expect(corpo.data.map((c) => c.rotulo)).toEqual(["Canoinhas/SC"]);
    expect(corpo.data[0]?.variantes).toHaveLength(2);
    // Empresa + contato sem cidade: dois fora do seletor, e o número é dito.
    expect(corpo.meta.sem_municipio).toBe(2);
    expect(corpo.meta.total_contatos).toBe(4);
  });

  it("erro do banco é 500 — não devolve lista vazia como se não houvesse cidade", async () => {
    vi.mocked(createClient).mockResolvedValue(duble({ erro: { message: "timeout" } }) as never);
    const { GET } = await import("@/app/api/v1/contacts/cidades/route");
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it("viewer é o mínimo (o seletor é leitura); guard negado devolve a resposta", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "unauthenticated" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { GET } = await import("@/app/api/v1/contacts/cidades/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });
});
