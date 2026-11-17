/**
 * GET /api/v1/contacts/[id]/timeline — o recorte é a ORG ATIVA.
 *
 * A timeline do contato unia atividades do contato com as dos leads dele
 * filtrando só por `contact_id`/`lead_id`. O RLS deixa um membro de duas
 * organizações ver as duas, então a ficha aberta na org A exibia o histórico da
 * org B. O teste grava as cláusulas `.eq()` emitidas e cobra a organização em
 * todas as tabelas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/lib/auth/types";
import type * as TimelineQuery from "@/lib/leads/timeline-query";

import { GET } from "./route";

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/leads/timeline-query", async (importOriginal) => {
  const real = await importOriginal<typeof TimelineQuery>();
  return { ...real, comNomeDoAtor: vi.fn(async (_s: unknown, rows: unknown[]) => rows) };
});

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";

type Consulta = { tabela: string; eq: Array<[string, unknown]> };

function stub(contatoDaOrg: boolean) {
  const consultas: Consulta[] = [];
  const criar = (tabela: string) => {
    const registro: Consulta = { tabela, eq: [] };
    consultas.push(registro);
    const b = {
      select: () => b,
      eq: (coluna: string, valor: unknown) => {
        registro.eq.push([coluna, valor]);
        return b;
      },
      in: () => b,
      or: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () =>
        tabela === "contacts"
          ? { data: contatoDaOrg ? { id: CONTACT_ID } : null, error: null }
          : { data: null, error: null },
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    };
    return b;
  };
  return { consultas, client: { from: criar } };
}

function pedido() {
  return new NextRequest(`http://localhost/api/v1/contacts/${CONTACT_ID}/timeline?limit=10`);
}

const ctx = { params: Promise.resolve({ id: CONTACT_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAuthUser).mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    email: "a@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: "manager" }],
  } as AuthUser);
  vi.mocked(resolveActiveOrg).mockResolvedValue({
    orgId: ORG_ID,
    name: "Org",
    role: "manager",
  } as never);
});

describe("GET /api/v1/contacts/[id]/timeline", () => {
  it("filtra organization_id no contato, nos leads e nas atividades", async () => {
    const { consultas, client } = stub(true);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(200);

    for (const tabela of ["contacts", "crm_leads", "crm_lead_activities"]) {
      const daTabela = consultas.filter((c) => c.tabela === tabela);
      expect(daTabela.length).toBeGreaterThan(0);
      for (const c of daTabela) {
        expect(c.eq).toContainEqual(["organization_id", ORG_ID]);
      }
    }
  });

  it("contato de outra organização responde 404 e não busca atividades", async () => {
    const { consultas, client } = stub(false);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(404);
    expect(consultas.some((c) => c.tabela === "crm_lead_activities")).toBe(false);
  });

  it("sem organização ativa responde 403 e não consulta nada", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null);
    const { consultas, client } = stub(true);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(403);
    expect(consultas).toHaveLength(0);
  });
});
