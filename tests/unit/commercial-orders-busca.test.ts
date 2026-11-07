/**
 * GET /api/v1/commercial-orders?busca= — a rota que alimenta a lista de
 * Pedidos, a paleta ⌘K e o agente.
 *
 * O defeito medido: digitar "19405" no campo de busca devolvia lista vazia,
 * porque o filtro só olhava `cliente_nome`/`cliente_documento`. O número do
 * pedido é justamente o que a pessoa tem na mão.
 *
 * Auth e banco dublados: o que se mede é o FILTRO que a rota monta.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import type { AuthUser, Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/comercial/criar-pedido", () => ({ criarPedidoComercial: vi.fn() }));
vi.mock("@/lib/comercial/emitente", () => ({
  comNomeDoEmitente: vi.fn(async (linhas: unknown[]) => linhas),
}));

import { GET } from "@/app/api/v1/commercial-orders/route";

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";

const or = vi.fn<(filtro: string) => void>();

/** O builder do Supabase, encadeável, com `or` gravando o filtro. */
function consulta() {
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "gte", "lte", "ilike", "order"]) {
    q[metodo] = () => q;
  }
  q.or = (filtro: string) => {
    or(filtro);
    return q;
  };
  q.limit = async () => ({ data: [], error: null });
  return q;
}

function sessao() {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: "viewer" as Role }],
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user,
    org: { orgId: ORG, name: "Org", role: "viewer" },
  });
}

function pedir(query: string) {
  return GET(new NextRequest(`http://x/api/v1/commercial-orders${query}`));
}

beforeEach(() => {
  or.mockReset();
  sessao();
  vi.mocked(createClient).mockResolvedValue({ from: () => consulta() } as never);
});

describe("GET /api/v1/commercial-orders — busca", () => {
  it("acha o pedido pelo número digitado", async () => {
    const resposta = await pedir("?busca=19405");
    expect(resposta.status).toBe(200);
    expect(or).toHaveBeenCalledWith(
      "cliente_nome.ilike.%19405%,cliente_documento.ilike.%19405%,numero.eq.19405",
    );
  });

  it("acha também pelo formato que a tela mostra (`PED-19405`)", async () => {
    await pedir("?busca=PED-19405");
    expect(or.mock.calls[0]?.[0]).toContain("numero.eq.19405");
  });

  it("mantém a busca por nome do cliente", async () => {
    await pedir("?busca=BILL");
    expect(or).toHaveBeenCalledWith(
      "cliente_nome.ilike.%BILL%,cliente_documento.ilike.%BILL%",
    );
  });

  it("não aplica filtro quando não há termo", async () => {
    await pedir("");
    expect(or).not.toHaveBeenCalled();
  });
});
