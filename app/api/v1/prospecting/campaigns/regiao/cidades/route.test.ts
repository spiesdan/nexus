/**
 * GET /api/v1/prospecting/campaigns/regiao/cidades
 *
 * O que este teste prende: a tela só oferece cidade onde há ALGUÉM alcançável.
 * Cidade com cadastro mas sem telefone válido não vira opção (a contagem é de
 * contatos com WhatsApp, não de pedidos) — oferecer essa cidade é o caminho
 * mais curto para uma campanha vazia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { listarClientesPorRegiao } from "@/lib/comercial/clientes-por-regiao";
import type * as Regiao from "@/lib/comercial/clientes-por-regiao";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/comercial/clientes-por-regiao", async () => {
  // A rota usa o AGRUPAMENTO de verdade (é ele que conta por cidade); só a
  // consulta ao banco é falsa.
  const real = await vi.importActual<typeof Regiao>("@/lib/comercial/clientes-por-regiao");
  return { ...real, listarClientesPorRegiao: vi.fn() };
});

const ORG_ID = "22222222-2222-4222-8222-222222222222";

const cliente = (id: string, cidade: string, uf: string, telefone: string | null) => ({
  contact_id: id,
  nome: id,
  telefone,
  telefone_e164: telefone,
  cidade,
  uf,
  pedidos: 1,
  total_cents: 1_000,
  ultimo_pedido_em: "2026-10-01T12:00:00.000Z",
});

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
  vi.mocked(listarClientesPorRegiao).mockReset();
});

describe("GET /api/v1/prospecting/campaigns/regiao/cidades", () => {
  it("conta só contato alcançável e agrupa por cidade", async () => {
    vi.mocked(listarClientesPorRegiao).mockResolvedValue({
      lista: [
        cliente("c-1", "Canoinhas", "SC", "+5549999998888"),
        cliente("c-2", "Canoinhas", "SC", "+5549999997777"),
        cliente("c-3", "Caçador", "SC", "+5549999996666"),
        cliente("c-4", "Mafra", "SC", null),
      ],
      pedidos_lidos: 9,
      // A contagem agora inclui cadastro sem compra (ver `listarClientesPorRegiao`).
      contatos_lidos: 9,
      completa: true,
    } as never);

    const { GET } = await import("./route");
    const resposta = await GET();
    expect(resposta.status).toBe(200);

    const dados = (await resposta.json()).data;
    expect(dados.clientes).toBe(3);
    expect(dados.pedidos_lidos).toBe(9);
    expect(dados.cidades).toEqual([
      { cidade: "Canoinhas", uf: "SC", total: 2 },
      { cidade: "Caçador", uf: "SC", total: 1 },
    ]);
  });

  it("erro de leitura vira 500 com mensagem humana, não lista vazia", async () => {
    vi.mocked(listarClientesPorRegiao).mockRejectedValue(new Error("boom"));
    const { GET } = await import("./route");
    const resposta = await GET();
    expect(resposta.status).toBe(500);
    expect((await resposta.json()).error.message).toContain("cidades");
  });
});
