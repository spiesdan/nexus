/**
 * `GET /api/v1/contacts/[id]/credito` — a MESMA conta do gate, uma porta só.
 *
 * O dublê aplica os filtros de `organization_id` de verdade: devolver a linha
 * sem olhar o filtro faria o teste de isolamento entre tenants passar com a
 * rota não filtrando nada.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const CONTATO = "55555555-5555-4555-8555-555555555555";

function banco(opcoes: { orgDoContato: string; limite: number | null; emAberto: number }) {
  function cadeia(tabela: string, selecao: string) {
    const filtros: Record<string, unknown> = {};
    const conjuntos: Record<string, readonly unknown[]> = {};
    const c: Record<string, unknown> = {};
    const casa = (linha: Record<string, unknown>) =>
      Object.entries(filtros).every(([col, v]) => linha[col] === v) &&
      Object.entries(conjuntos).every(([col, vs]) => vs.includes(linha[col]));

    c.select = (cols: string) => {
      selecao = cols;
      return c;
    };
    c.eq = (col: string, v: unknown) => {
      filtros[col] = v;
      return c;
    };
    c.in = (col: string, vs: readonly unknown[]) => {
      conjuntos[col] = vs;
      return c;
    };
    c.maybeSingle = () => {
      if (tabela !== "contacts") return Promise.resolve({ data: null, error: null });
      const contato = { id: CONTATO, organization_id: opcoes.orgDoContato };
      if (!casa(contato)) return Promise.resolve({ data: null, error: null });
      if (selecao.includes("limite_credito_cents")) {
        return Promise.resolve({
          data: { limite_credito_cents: opcoes.limite },
          error: null,
        });
      }
      return Promise.resolve({ data: { id: CONTATO }, error: null });
    };
    const terminal = () => {
      if (tabela === "commercial_orders" && conjuntos.status) {
        return Promise.resolve({ data: [{ total_cents: opcoes.emAberto }], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      terminal().then(resolve, reject);
    return c;
  }

  vi.mocked(createClient).mockResolvedValue({
    from: (tabela: string) => cadeia(tabela, ""),
  } as never);
}

function sessao(papel: Role = "viewer") {
  const user = { id: "user-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "papel insuficiente.", 403, {}) },
  );
}

function get(id = CONTATO) {
  return new NextRequest(`http://x/api/v1/contacts/${id}/credito`);
}

const ctx = (id = CONTATO) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("GET /api/v1/contacts/[id]/credito", () => {
  it("devolve limite e em aberto com a regra do gate", async () => {
    banco({ orgDoContato: ORG, limite: 10000, emAberto: 9000 });
    const { GET } = await import("./route");

    const res = await GET(get(), ctx());
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { tem_limite: boolean; limite_cents: number | null; em_aberto_cents: number };
    };
    expect(corpo.data).toEqual({
      tem_limite: true,
      limite_cents: 10000,
      em_aberto_cents: 9000,
    });
  });

  it("sem limite definido: tem_limite false, não um zero que barra tudo", async () => {
    banco({ orgDoContato: ORG, limite: null, emAberto: 3000 });
    const { GET } = await import("./route");

    const res = await GET(get(), ctx());
    const corpo = (await res.json()) as { data: { tem_limite: boolean; limite_cents: null } };
    expect(corpo.data.tem_limite).toBe(false);
    expect(corpo.data.limite_cents).toBeNull();
  });

  it("contato de outra organização é 404 — não um 200 de 'nada em aberto'", async () => {
    banco({ orgDoContato: OUTRA_ORG, limite: 10000, emAberto: 9000 });
    const { GET } = await import("./route");

    const res = await GET(get(), ctx());
    expect(res.status).toBe(404);
  });

  it("id que não é UUID é 422, sem consultar o banco", async () => {
    const { GET } = await import("./route");
    const res = await GET(get("nao-e-uuid"), ctx("nao-e-uuid"));
    expect(res.status).toBe(422);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("papel abaixo de viewer não lê crédito de ninguém", async () => {
    // `requireRole("viewer")` é o piso; o dublê devolve o 403 canônico.
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden_role", "papel insuficiente.", 403, {}),
    });
    const { GET } = await import("./route");
    const res = await GET(get(), ctx());
    expect(res.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });
});
