/**
 * POST /api/v1/prospecting/campaigns/regiao/preview
 *
 * O que este teste prende: a prévia conta a MESMA história do POST. Um cliente
 * sem telefone válido ou já reservado por outra campanha não aparece como
 * elegível — se aparecesse, a tela prometeria um público que a criação recusa.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { listarClientesPorRegiao } from "@/lib/comercial/clientes-por-regiao";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/comercial/clientes-por-regiao", () => ({
  listarClientesPorRegiao: vi.fn(),
}));
vi.mock("@/lib/prospeccao/reserva-de-campanha", () => ({
  idsReservadosPorOutras: vi.fn(),
}));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

function corpo(valor: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/prospecting/campaigns/regiao/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(valor),
  });
}

const cliente = (
  id: string,
  telefone: string | null = "+5549999998888",
  pedidos = 1,
) => ({
  contact_id: id,
  nome: id,
  telefone,
  telefone_e164: telefone,
  cidade: "Canoinhas",
  uf: "SC",
  pedidos,
  total_cents: pedidos * 10_000,
  ultimo_pedido_em: pedidos > 0 ? "2026-10-01T12:00:00.000Z" : "",
});

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
  vi.mocked(audit).mockResolvedValue(undefined as never);
  vi.mocked(idsReservadosPorOutras).mockResolvedValue(new Set<string>() as never);
  vi.mocked(listarClientesPorRegiao).mockReset();
  vi.mocked(listarClientesPorRegiao).mockResolvedValue({
    lista: [
      cliente("c-1"),
      cliente("c-2"),
      cliente("c-sem", null),
      cliente("c-reservado"),
      // Cadastrado na cidade e nunca comprou: entra na audiência.
      cliente("c-novo", "+5549999995555", 0),
    ],
    pedidos_lidos: 7,
    contatos_lidos: 12,
    completa: true,
  } as never);
});

describe("POST /api/v1/prospecting/campaigns/regiao/preview", () => {
  it("recusa sem permissão antes de ler qualquer coisa", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const { POST } = await import("./route");
    expect((await POST(corpo({ cidades: [{ cidade: "Canoinhas" }] }))).status).toBe(403);
    expect(listarClientesPorRegiao).not.toHaveBeenCalled();
  });

  it("sem cidade é 422", async () => {
    const { POST } = await import("./route");
    expect((await POST(corpo({ cidades: [] }))).status).toBe(422);
  });

  it("marca sem telefone e já em campanha como NÃO elegíveis", async () => {
    vi.mocked(idsReservadosPorOutras).mockResolvedValue(new Set(["c-reservado"]) as never);
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ cidades: [{ cidade: "Canoinhas", estado: "SC" }] }));
    expect(resposta.status).toBe(200);

    const dados = (await resposta.json()).data;
    expect(dados.total).toBe(5);
    expect(dados.com_pedido).toBe(4);
    expect(dados.sem_pedido).toBe(1);
    expect(dados.com_telefone).toBe(4);
    expect(dados.sem_telefone).toBe(1);
    expect(dados.em_campanha).toBe(1);
    expect(dados.elegiveis).toBe(3);
    expect(dados.pedidos_lidos).toBe(7);
    expect(dados.contatos_lidos).toBe(12);
    expect(dados.completa).toBe(true);
    expect(dados.resumo).toContain("5 clientes nas cidades escolhidas");
    expect(dados.resumo).toContain("4 com pedido");
    expect(dados.resumo).toContain("1 sem pedido");

    const porId = new Map<string, { elegivel: boolean; em_campanha: boolean }>(
      (dados.linhas as Array<{ contact_id: string; elegivel: boolean; em_campanha: boolean }>).map(
        (l) => [l.contact_id, l],
      ),
    );
    expect(porId.get("c-1")).toMatchObject({ elegivel: true, em_campanha: false });
    expect(porId.get("c-sem")).toMatchObject({ elegivel: false, em_campanha: false });
    expect(porId.get("c-reservado")).toMatchObject({ elegivel: false, em_campanha: true });

    // A prévia é leitura, mas fica registrada: "quem olhou o público".
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prospecting_campaigns.public_read",
        metadata: expect.objectContaining({ regiao: true, elegiveis: 3 }),
      }),
    );
  });
});
