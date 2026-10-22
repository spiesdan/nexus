/**
 * DELETE /api/v1/prospecting/campaigns/[id]
 *
 * O que este teste prende é a fronteira que impede apagar campanha alheia: o
 * filtro por `organization_id` vai no SELECT (404 para id de outra org) e no
 * DELETE. Deletar sem o filtro apagaria a campanha de outro tenant — e o
 * service role não está em jogo aqui justamente para o RLS não ser a única
 * camada.
 *
 * Também prende o audit: apagar campanha derruba o ledger de envios dela (FK
 * ON DELETE CASCADE) e libera as empresas para outra campanha. Sem o registro,
 * não sobra rastro de quem apagou.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { DELETE } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const CAMPANHA_ID = "55555555-5555-4555-8555-555555555555";

let campanha: { id: string; nome: string } | null = null;
let filtrosDeDelete: Array<{ col: string; val: unknown }> = [];
let erroDeLeitura: { message: string } | null = null;
let erroDeDelete: { message: string } | null = null;

function fakeClient() {
  return {
    from(tabela: string) {
      if (tabela !== "prospecting_campaigns") throw new Error(`tabela inesperada: ${tabela}`);
      const filtros: Array<{ col: string; val: unknown }> = [];
      const q: Record<string, unknown> = {};
      q.select = vi.fn(() => q);
      q.delete = vi.fn(() => {
        filtrosDeDelete = filtros;
        return q;
      });
      q.eq = vi.fn((col: string, val: unknown) => {
        filtros.push({ col, val });
        return q;
      });
      q.maybeSingle = vi.fn(() =>
        Promise.resolve(
          erroDeLeitura ? { data: null, error: erroDeLeitura } : { data: campanha, error: null },
        ),
      );
      q.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: erroDeDelete }).then(onF, onR);
      return q;
    },
  };
}

function requisicao() {
  return new NextRequest(
    `http://localhost/api/v1/prospecting/campaigns/${CAMPANHA_ID}`,
    { method: "DELETE" },
  );
}

const params = () => ({ params: Promise.resolve({ id: CAMPANHA_ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  campanha = { id: CAMPANHA_ID, nome: "Oficinas - SC" };
  filtrosDeDelete = [];
  erroDeLeitura = null;
  erroDeDelete = null;
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: USER_ID },
  } as never);
  vi.mocked(createClient).mockResolvedValue(fakeClient() as never);
  vi.mocked(audit).mockResolvedValue(undefined as never);
});

describe("DELETE /api/v1/prospecting/campaigns/[id]", () => {
  it("apaga só a campanha da organização e registra no audit", async () => {
    const res = await DELETE(requisicao(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ data: { id: CAMPANHA_ID } });
    expect(filtrosDeDelete).toEqual(
      expect.arrayContaining([
        { col: "id", val: CAMPANHA_ID },
        { col: "organization_id", val: ORG_ID },
      ]),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prospecting_campaign.deleted",
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        resourceId: CAMPANHA_ID,
      }),
    );
  });

  it("404 sem apagar quando o id é de outra organização", async () => {
    campanha = null;

    const res = await DELETE(requisicao(), params());

    expect(res.status).toBe(404);
    expect(filtrosDeDelete).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("erro do banco no delete devolve 500 e não mente no audit", async () => {
    erroDeDelete = { message: "fk em uso" };

    const res = await DELETE(requisicao(), params());

    expect(res.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });
});
