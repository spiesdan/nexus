/**
 * GET /api/v1/titulos — o `busca` que a Global Search (§17) passa.
 *
 * Duas ramificações, cada uma com seu tipo de termo: só dígitos é o NÚMERO do
 * pedido (exato), o resto é nome do cliente (ilike). O que não pode mudar é o
 * resto da rota: organization_id, status em faturado/expedido/entregue e a
 * ordenação por emissão — títulos sem isso deixam de ser a mesma lista da tela.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

type Registro = { data?: unknown; error?: null };
function fakeBuilder(resultado: Registro) {
  const q: Record<string, unknown> = {};
  const volta = () => q;
  q.select = vi.fn(volta);
  q.eq = vi.fn(volta);
  q.in = vi.fn(volta);
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
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: "u1" }, org: { orgId: ORG_ID } } as never);
  vi.mocked(createClient).mockResolvedValue({ from: de } as never);
});

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/titulos${query}`);
}

describe("GET /api/v1/titulos", () => {
  it("termo só com dígitos é número de pedido, exato", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("?busca=1237"));
    expect(response.status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("numero", 1237);
    expect(builder.ilike).not.toHaveBeenCalled();
  });

  it("termo com letra casa o cliente, sem quebrar com vírgula", async () => {
    const { GET } = await import("./route");
    await GET(request("?busca=Silva,"));
    expect(builder.ilike).toHaveBeenCalledWith("cliente_nome", "%Silva,%");
    expect(builder.eq).not.toHaveBeenCalledWith("numero", expect.anything());
  });

  it("sem busca a lista é a de sempre: org, status e ordem intactos", async () => {
    const { GET } = await import("./route");
    await GET(request());
    expect(de).toHaveBeenCalledWith("commercial_orders");
    expect(builder.eq).toHaveBeenCalledWith("organization_id", ORG_ID);
    expect(builder.in).toHaveBeenCalledWith(
      "status",
      expect.arrayContaining(["faturado", "expedido", "entregue"]),
    );
    expect(builder.ilike).not.toHaveBeenCalled();
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("situação inválida continua sendo 422 antes de qualquer consulta", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("?situacao=pago"));
    expect(response.status).toBe(422);
    expect(de).not.toHaveBeenCalled();
  });
});
