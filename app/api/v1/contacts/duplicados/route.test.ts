/**
 * A ROTA DA FILA — o que a tela vê, com o teto declarado.
 *
 * O agrupamento e o filtro de descartados moram em `fn_contatos_duplicados`
 * (prova própria em tests/invariants/clientes-duplicados.test.ts). Aqui se
 * prova a LIGAÇÃO: org do `authz` (nunca do body), envelope `{data, meta}` e o
 * aviso de truncamento — fila que termina sem avisar faz o operador achar que
 * não há mais nada.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const authzOk = {
  ok: true as const,
  user: { id: "11111111-1111-4111-8111-111111111111", email: "v@j.test" },
  org: { orgId: ORG, role: "agent" as const, name: "Org" },
};

const GRUPO = {
  chave: "joao silva|canoinhas",
  nome: "JOAO SILVA",
  cidade: "Canoinhas",
  uf: "SC",
  total_fichas: 2,
  pedidos: 3,
  conversas: 1,
  leads: 0,
  fichas: [],
};

function req(querystring = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/contacts/duplicados${querystring}`);
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(createAdminClient).mockReset();
});

describe("GET /contacts/duplicados", () => {
  it("devolve os grupos com o total real e chama a RPC com a org do authz", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { grupos: [GRUPO], total_grupos: 117, total_fichas: 2075, limite: 200, truncado: false },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    const { GET } = await import("@/app/api/v1/contacts/duplicados/route");
    const res = await GET(req());
    expect(res.status).toBe(200);

    const corpo = (await res.json()) as {
      data: typeof GRUPO[];
      meta: { total_grupos: number; total_fichas: number; truncado: boolean; aviso: string | null };
    };
    expect(corpo.data).toHaveLength(1);
    expect(corpo.meta).toMatchObject({ total_grupos: 117, total_fichas: 2075, truncado: false });
    expect(corpo.meta.aviso).toBeNull();
    expect(rpc).toHaveBeenCalledWith("fn_contatos_duplicados", { p_org: ORG, p_limite: 200 });
  });

  it("quando truncou, diz que truncou", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: { grupos: [GRUPO], total_grupos: 900, total_fichas: 4000, limite: 200, truncado: true },
        error: null,
      }),
    } as never);

    const { GET } = await import("@/app/api/v1/contacts/duplicados/route");
    const res = await GET(req("?limite=200"));
    const corpo = (await res.json()) as { meta: { truncado: boolean; aviso: string | null } };
    expect(corpo.meta.truncado).toBe(true);
    expect(corpo.meta.aviso).toContain("teto");
  });

  it("erro da RPC é 500 — não devolve lista vazia como se não houvesse duplicata", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } }),
    } as never);

    const { GET } = await import("@/app/api/v1/contacts/duplicados/route");
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it("guard negado devolve a resposta e nem cria client", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "unauthenticated" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { GET } = await import("@/app/api/v1/contacts/duplicados/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});
