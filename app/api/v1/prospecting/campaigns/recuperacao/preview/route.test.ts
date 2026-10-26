/**
 * POST /api/v1/prospecting/campaigns/recuperacao/preview
 *
 * O que este teste prende: a prévia conta a MESMA história do POST. Um contato
 * sem telefone válido ou já reservado por outra campanha não aparece como
 * elegível — se aparecesse, a tela prometeria um público que o insert recusa.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { listarInativos } from "@/lib/comercial/inativos";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/comercial/inativos", () => ({ listarInativos: vi.fn() }));
vi.mock("@/lib/prospeccao/reserva-de-campanha", () => ({
  idsReservadosPorOutras: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

const CLIENTES = [
  {
    contact_id: "11111111-1111-4111-8111-111111111111",
    nome: "Cliente com telefone",
    telefone: "+5547999999999",
    dias_sem_compra: 120,
    total_historico_cents: 250000,
    qtd_pedidos: 4,
    faixa: "frio" as const,
    score: 90,
  },
  {
    contact_id: "22222222-2222-4222-8222-222222222222",
    nome: "Cliente sem telefone",
    telefone: null,
    dias_sem_compra: 90,
    total_historico_cents: 10000,
    qtd_pedidos: 1,
    faixa: "morno" as const,
    score: 40,
  },
  {
    contact_id: "33333333-3333-4333-8333-333333333333",
    nome: "Cliente reservado",
    telefone: "+5547888888888",
    dias_sem_compra: 60,
    total_historico_cents: 5000,
    qtd_pedidos: 1,
    faixa: "atencao" as const,
    score: 10,
  },
];

function corpo(valor: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/prospecting/campaigns/recuperacao/preview",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(valor),
    },
  );
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
  vi.mocked(listarInativos).mockResolvedValue({
    lista: CLIENTES,
    varridos: 10,
    completa: true,
  } as never);
  vi.mocked(idsReservadosPorOutras).mockResolvedValue(
    new Set([CLIENTES[2]!.contact_id]) as never,
  );
});

describe("POST /api/v1/prospecting/campaigns/recuperacao/preview", () => {
  it("recusa sem permissão, antes de ler os inativos", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ dias_sem_compra: 90 }));
    expect(resposta.status).toBe(403);
    expect(listarInativos).not.toHaveBeenCalled();
  });

  it("exige um recorte de dias válido", async () => {
    const { POST } = await import("./route");
    for (const dias of [undefined, 0, -1, 3651, "90", 1.5]) {
      const resposta = await POST(corpo({ dias_sem_compra: dias }));
      expect(resposta.status).toBe(422);
    }
    expect(listarInativos).not.toHaveBeenCalled();
  });

  it("marca telefone, reserva e elegibilidade sem prometer o que o POST recusa", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ dias_sem_compra: 90 }));
    expect(resposta.status).toBe(200);
    const json = await resposta.json();

    expect(listarInativos).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG_ID,
      dias: 90,
    });
    expect(json.data).toMatchObject({
      dias_sem_compra: 90,
      total: 3,
      com_telefone: 2,
      sem_telefone: 1,
      em_campanha: 1,
      elegiveis: 1,
      varridos: 10,
      completa: true,
    });
    expect(
      json.data.linhas.map((l: { nome: string; elegivel: boolean }) => [l.nome, l.elegivel]),
    ).toEqual([
      ["Cliente com telefone", true],
      ["Cliente sem telefone", false],
      ["Cliente reservado", false],
    ]);
  });

  it("registra a leitura com os números da prévia", async () => {
    const { POST } = await import("./route");
    await POST(corpo({ dias_sem_compra: 90 }));
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        actorUserId: "user-1",
        action: "prospecting_campaigns.public_read",
        metadata: expect.objectContaining({
          preview: true,
          publico: "contatos",
          dias_sem_compra: 90,
          total: 3,
          elegiveis: 1,
        }),
      }),
    );
  });

  it("telefone antigo fora do E.164 é normalizado como no motor", async () => {
    vi.mocked(listarInativos).mockResolvedValue({
      lista: [
        {
          ...CLIENTES[0]!,
          telefone: "(49) 99999-8888",
        },
      ],
      varridos: 1,
      completa: true,
    } as never);
    vi.mocked(idsReservadosPorOutras).mockResolvedValue(new Set() as never);

    const { POST } = await import("./route");
    const resposta = await POST(corpo({ dias_sem_compra: 90 }));
    const json = await resposta.json();

    expect(json.data.linhas[0]).toMatchObject({ com_telefone: true, elegivel: true });
  });

  it("falha da leitura vira 500, não lista vazia", async () => {
    vi.mocked(listarInativos).mockRejectedValue(new Error("pedidos_indisponiveis"));
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ dias_sem_compra: 90 }));
    expect(resposta.status).toBe(500);
  });
});
