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
  const tabelas: Record<string, Array<Record<string, unknown>>> = {
    contacts: [
      { id: CONTATO_ID, organization_id: ORG_ID, name: "Cliente", display_name: "Cliente" },
    ],
    prospecting_campaigns: [],
    prospecting_sends: [],
  };

  function builder(tabela: string) {
    const filtros: Array<{ col: string; val: unknown }> = [];
    let modo: "select" | "insert" = "select";
    let payload: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    const volta = () => q;
    q.insert = vi.fn((novo: Record<string, unknown>) => {
      modo = "insert";
      payload = novo;
      inserido = novo;
      return q;
    });
    q.select = vi.fn(volta);
    q.eq = vi.fn((col: string, val: unknown) => {
      filtros.push({ col, val });
      return q;
    });
    q.in = vi.fn((col: string, val: unknown[]) => {
      filtros.push({ col, val });
      return q;
    });
    q.single = vi.fn(() =>
      Promise.resolve(
        erroDoBanco
          ? { data: null, error: erroDoBanco }
          : { data: modo === "insert" ? { id: "camp-1", ...(payload ?? {}) } : null, error: null },
      ),
    );
    q.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      const linhas = (tabelas[tabela] ?? []).filter((l) =>
        filtros.every((f) =>
          Array.isArray(f.val)
            ? f.val.some((x) => String(x) === String(l[f.col]))
            : l[f.col] === f.val,
        ),
      );
      return Promise.resolve({ data: linhas, error: null }).then(onF, onR);
    };
    return q;
  }

  return { from: vi.fn((tabela: string) => builder(tabela)) };
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

  it("contato já reservado por outra campanha → 409 antes do insert", async () => {
    // A 0277 vale também para a campanha de recuperação: o contato não pode
    // estar em duas campanhas. A checagem devolve quem reservou, não um 500.
    const original = fakeClient;
    vi.mocked(createClient).mockResolvedValue({
      from: (tabela: string) =>
        tabela === "prospecting_campaigns"
          ? {
              select: () => ({
                eq: () => ({
                  then: (onF: (v: unknown) => unknown) =>
                    Promise.resolve({
                      data: [
                        {
                          id: "camp-antiga",
                          organization_id: ORG_ID,
                          nome: "Recuperação antiga",
                          prospect_ids: null,
                          contato_ids: [CONTATO_ID],
                        },
                      ],
                      error: null,
                    }).then(onF),
                }),
              }),
            }
          : original().from(tabela),
    } as never);

    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(409);
    expect((await resposta.json()).error.details.conflitos[0]).toMatchObject({
      id: CONTATO_ID,
      motivo: "outra_campanha",
      campanha_nome: "Recuperação antiga",
    });
    expect(inserido).toBeNull();
  });

  it("erro do banco vira 500, não 201 vazio", async () => {
    erroDoBanco = { message: "boom" };
    const { POST } = await import("./route");
    const resposta = await POST(corpo(VALIDO));
    expect(resposta.status).toBe(500);
  });
});
