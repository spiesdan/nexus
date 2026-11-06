/**
 * POST /api/v1/commercial-orders/[id]/mercos — "Atualizar do Mercos".
 *
 * A rota é a porta do botão por pedido. O que ela NÃO pode fazer é enfileirar
 * uma revisão de pedido que não veio do ERP: o número é a identidade dentro da
 * organização, e um pedido local pode ter o mesmo (o caso dos 18538..18558 de
 * demonstração). Revisar esse pedido traria dado do Mercos por cima de algo que
 * nunca esteve lá.
 *
 * Também não faz sentido revisar ciclo encerrado: `entregue`/`cancelado` é
 * exatamente o que a função do banco bloqueia, e a rota responde antes para o
 * operador não esperar um scrape inteiro por um "não".
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { enfileirarImportacaoMercos } from "@/lib/mercos/importacao";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/mercos/importacao", () => ({ enfileirarImportacaoMercos: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PEDIDO = "33333333-3333-4333-8333-333333333333";

function pedido(over: Record<string, unknown> = {}) {
  return { id: PEDIDO, numero: 19228, origem: "mercos", status: "aprovado", ...over };
}

function montarSupabase(resposta: { data?: unknown; error?: unknown }) {
  const q: Record<string, unknown> = {};
  for (const nome of ["select", "eq"]) {
    q[nome] = () => q;
  }
  q.maybeSingle = () => Promise.resolve(resposta);
  vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);
}

function req() {
  return new NextRequest(`https://crm.test/api/v1/commercial-orders/${PEDIDO}/mercos`, {
    method: "POST",
  });
}

const params = { params: Promise.resolve({ id: PEDIDO }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG },
    user: { id: USER },
  } as never);
  vi.mocked(enfileirarImportacaoMercos).mockResolvedValue({
    execucao: { id: "run-1" },
    jaEstavaRodando: false,
  } as never);
});

describe("POST /api/v1/commercial-orders/[id]/mercos", () => {
  it("pedido inexistente na organização responde 404", async () => {
    montarSupabase({ data: null, error: null });
    const r = await POST(req(), params);
    expect(r.status).toBe(404);
    expect(enfileirarImportacaoMercos).not.toHaveBeenCalled();
  });

  it("pedido local (origem vendedor) é recusado com 422", async () => {
    montarSupabase({ data: pedido({ origem: "vendedor" }), error: null });
    const r = await POST(req(), params);
    expect(r.status).toBe(422);
    expect(enfileirarImportacaoMercos).not.toHaveBeenCalled();
  });

  it("pedido entregue ou cancelado é recusado com 422", async () => {
    for (const status of ["entregue", "cancelado"]) {
      montarSupabase({ data: pedido({ status }), error: null });
      const r = await POST(req(), params);
      expect(r.status).toBe(422);
    }
    expect(enfileirarImportacaoMercos).not.toHaveBeenCalled();
  });

  it("pedido do Mercos enfileira a revisão DAQUELE número", async () => {
    montarSupabase({ data: pedido(), error: null });
    const r = await POST(req(), params);
    expect(r.status).toBe(200);
    expect(enfileirarImportacaoMercos).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        requestedBy: USER,
        origem: "manual",
        revisarNumeros: [19228],
      }),
    );
  });
});
