/**
 * GET /api/v1/leads — a busca de leads da Global Search (§17).
 *
 * O que se defende: viewer lê, o `busca` chega no `title` do lead, o
 * `organization_id` nunca sai do filtro e o `limite` não passa de 20 (a rota
 * é de paleta, não de listagem — um GET sem teto viraria export de funil).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

type Registro = { data?: unknown; error?: null };
/** Fake do builder PostgREST: cadeia encadeável + await resolve o resultado. */
function fakeBuilder(resultado: Registro) {
  const q: Record<string, unknown> = {};
  const volta = () => q;
  q.from = vi.fn(volta);
  q.select = vi.fn(volta);
  q.eq = vi.fn(volta);
  q.ilike = vi.fn(volta);
  q.order = vi.fn(volta);
  q.limit = vi.fn(volta);
  q.then = (onOk: unknown, onErr: unknown) =>
    Promise.resolve(resultado).then(onOk as never, onErr as never);
  return q;
}

let builder: ReturnType<typeof fakeBuilder>;
let de: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  builder = fakeBuilder({ data: [], error: null });
  de = vi.fn(() => builder);
  vi.mocked(requireRole).mockResolvedValue({ ok: true, org: { orgId: ORG_ID } } as never);
  vi.mocked(createClient).mockResolvedValue({ from: de } as never);
});

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/leads${query}`);
}

describe("GET /api/v1/leads", () => {
  it("viewer lê — a paleta do dono e a do atendente têm a mesma porta", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("?busca=ana"));
    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith(
      "viewer",
      expect.objectContaining({ resource: "crm_leads" }),
    );
  });

  it("busca casa por title e sempre filtra pela organização", async () => {
    const { GET } = await import("./route");
    await GET(request("?busca=reforma"));
    expect(de).toHaveBeenCalledWith("crm_leads");
    expect(builder.eq).toHaveBeenCalledWith("organization_id", ORG_ID);
    expect(builder.ilike).toHaveBeenCalledWith("title", "%reforma%");
  });

  it("sem termo devolve os recentes — e nunca sem organization_id", async () => {
    const { GET } = await import("./route");
    await GET(request());
    expect(builder.ilike).not.toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("organization_id", ORG_ID);
  });

  it("limite de paleta: teto 20, piso 1, 0 é o default (padrão do prospects)", async () => {
    const { GET } = await import("./route");
    await GET(request("?limite=500"));
    expect(builder.limit).toHaveBeenCalledWith(20);
    await GET(request("?limite=-3"));
    expect(builder.limit).toHaveBeenCalledWith(1);
    await GET(request("?limite=0"));
    expect(builder.limit).toHaveBeenCalledWith(5);
  });
});
