/**
 * GET /api/v1/prospecting/campaigns/numeros
 *
 * O que este teste prende: a tela recebe rótulo e telefone, nunca nome de
 * provider — e o `tipo` da query escolhe a régua. Sem `tipo`, a campanha é de
 * texto, então o canal oficial não aparece.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { listarNumerosDaCampanha } from "@/lib/prospeccao/numero-da-campanha";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/prospeccao/numero-da-campanha", () => ({
  listarNumerosDaCampanha: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: "org-1" },
    user: { id: "user-1" },
  } as never);
  vi.mocked(listarNumerosDaCampanha).mockReset();
  vi.mocked(listarNumerosDaCampanha).mockResolvedValue([
    { id: "qr-1", rotulo: "Comercial", telefone: "+5549999990000" },
  ] as never);
});

function pedido(tipo?: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/prospecting/campaigns/numeros${tipo ? `?tipo=${tipo}` : ""}`,
  );
}

describe("GET /api/v1/prospecting/campaigns/numeros", () => {
  it("sem `tipo` assume texto — a campanha por região fala texto livre", async () => {
    const { GET } = await import("./route");
    const resposta = await GET(pedido());
    expect(resposta.status).toBe(200);
    expect(listarNumerosDaCampanha).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "texto",
    );
    const dados = (await resposta.json()).data;
    expect(dados).toEqual({
      tipo: "texto",
      numeros: [{ id: "qr-1", rotulo: "Comercial", telefone: "+5549999990000" }],
    });
    // Nada de encanamento na resposta da API.
    expect(JSON.stringify(dados)).not.toContain("waha");
  });

  it("`tipo=template` usa a outra régua", async () => {
    const { GET } = await import("./route");
    await GET(pedido("template"));
    expect(listarNumerosDaCampanha).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "template",
    );
  });

  it("erro de leitura vira 500", async () => {
    vi.mocked(listarNumerosDaCampanha).mockRejectedValue(new Error("boom"));
    const { GET } = await import("./route");
    expect((await GET(pedido())).status).toBe(500);
  });
});
