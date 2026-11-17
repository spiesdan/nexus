/**
 * GET /api/v1/contacts/[id]/crm-summary — o recorte é a ORG ATIVA.
 *
 * O painel do inbox mostrava leads, pedidos, atividades e demandas de um
 * contato filtrados só por `contact_id`. Como o RLS deixa um membro de duas
 * organizações ver as duas, a ficha aberta na org A exibia o negócio da org B —
 * vazamento entre tenants do MESMO usuário, que nenhuma policy pega.
 *
 * Aqui o cliente Supabase é um stub que grava as cláusulas `.eq()`: o teste não
 * prova o resultado da consulta, prova que o filtro de organização foi emitido
 * em CADA tabela — que é exatamente o que faltava.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/lib/auth/types";

import { GET } from "./route";

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/users/nome-do-atendente", () => ({
  nomesDosAtendentes: vi.fn(async () => new Map()),
}));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";

type Consulta = { tabela: string; eq: Array<[string, unknown]> };

/**
 * Stub mínimo: encadeia, grava `.eq()`, resolve para lista vazia. A tabela
 * `contacts` devolve o contato (a rota usa `.maybeSingle()` para decidir 404).
 */
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
      is: () => b,
      order: () => b,
      limit: () => b,
      in: () => b,
      or: () => b,
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
  return new NextRequest(`http://localhost/api/v1/contacts/${CONTACT_ID}/crm-summary`);
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

describe("GET /api/v1/contacts/[id]/crm-summary", () => {
  it("filtra organization_id em TODA tabela do resumo", async () => {
    const { consultas, client } = stub(true);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(200);

    for (const tabela of ["contacts", "crm_leads", "orders", "crm_lead_activities", "demandas"]) {
      const daTabela = consultas.filter((c) => c.tabela === tabela);
      expect(daTabela.length).toBeGreaterThan(0);
      // Cada consulta da tabela tem de carregar o recorte da org ativa.
      for (const c of daTabela) {
        expect(c.eq).toContainEqual(["organization_id", ORG_ID]);
      }
    }
  });

  it("contato de outra organização responde 404, não um resumo vazio", async () => {
    const { client } = stub(false);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await GET(pedido(), ctx);
    expect(res.status).toBe(404);
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
