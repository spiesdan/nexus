/**
 * POST /api/v1/prospecting/campaigns/recuperacao
 *
 * O que este teste prende é o que a rota GRAVA: audiência `contatos` (nunca
 * prospect), `categorias`/`cidades` vazias de propósito (o recorte é o radar, não
 * uma busca) e a campanha nascendo ATIVA e agendada — o formulário da tela é a
 * agenda inteira. E que corpo torto não chega ao banco.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONTATO_ID = "33333333-3333-4333-8333-333333333333";

let inserido: Record<string, unknown> | null = null;
let erroDoBanco: { message: string } | null = null;

function fakeClient() {
  const q: Record<string, unknown> = {};
  const volta = () => q;
  q.insert = vi.fn((payload: Record<string, unknown>) => {
    inserido = payload;
    return q;
  });
  q.select = vi.fn(volta);
  q.single = vi.fn(() =>
    Promise.resolve(erroDoBanco ? { data: null, error: erroDoBanco } : { data: { id: "camp-1" }, error: null }),
  );
  return { from: vi.fn(() => q) };
}

function corpo(valor: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/prospecting/campaigns/recuperacao", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(valor),
  });
}

const VALIDO = {
  nome: "Recuperação — clientes que pararam",
  contato_ids: [CONTATO_ID],
  mensagens: ["Sentimos sua falta! Vamos conversar sobre o próximo pedido?"],
  janelas: [{ inicio: "07:00", fim: "12:00" }],
  data_inicio: "2026-10-19",
  data_fim: "2026-10-23",
  limite_diario: 30,
};

beforeEach(() => {
  inserido = null;
  erroDoBanco = null;
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
  vi.mocked(createClient).mockResolvedValue(fakeClient() as never);
});

describe("POST /api/v1/prospecting/campaigns/recuperacao", () => {
  it("recusa sem permissão, antes de tocar o banco", async () => {
    const negado = new Response(null, { status: 403 });
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: negado } as never);
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(403);
    expect(inserido).toBeNull();
  });

  it("lista vazia é 422 — campanha sem público não se cria", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ ...VALIDO, contato_ids: [] }));
    expect(resposta.status).toBe(422);
    expect(inserido).toBeNull();
  });

  it("sem mensagem é 422 (o tick não teria o que mandar)", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(corpo({ ...VALIDO, mensagens: [] }));
    expect(resposta.status).toBe(422);
    expect(inserido).toBeNull();
  });

  it("período invertido é 422", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(
      corpo({ ...VALIDO, data_inicio: "2026-10-23", data_fim: "2026-10-19" }),
    );
    expect(resposta.status).toBe(422);
    expect(inserido).toBeNull();
  });

  it("grava a audiência como CONTATOS, ativa e agendada", async () => {
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(201);

    expect(inserido).toMatchObject({
      organization_id: ORG_ID,
      nome: VALIDO.nome,
      publico: "contatos",
      contato_ids: [CONTATO_ID],
      mensagens: VALIDO.mensagens,
      // O recorte de garimpagem não existe numa campanha de recuperação.
      categorias: [],
      cidades: [],
      data_inicio: "2026-10-19",
      data_fim: "2026-10-23",
      limite_diario: 30,
      status: "ativa",
      created_by: "user-1",
    });
    expect(typeof inserido?.agendada_em).toBe("string");
    // Nunca cai no default `prospects` do banco.
    expect(inserido?.prospect_ids).toBeUndefined();
  });

  it("erro do banco vira 500, não 201 vazio", async () => {
    erroDoBanco = { message: "boom" };
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(500);
  });
});
