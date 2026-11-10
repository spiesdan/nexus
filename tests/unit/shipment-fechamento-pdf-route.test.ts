/**
 * GET /api/v1/shipments/[id]/fechamento/pdf — o fechamento da carga em PDF.
 *
 * ─── O QUE SE MEDE AQUI, E O QUE SE MEDE EM OUTRO LUGAR ───────────────────
 *
 * Aqui: o contrato da rota — leitura (`viewer`), UUID, 404 — e que o PDF vem do
 * MESMO fechamento que a tela (`GET/PUT /fechamento`) monta: a renderização em
 * si é dublada de propósito (`renderFechamentoPdf` mockado), porque o que esta
 * suíte mede é a fronteira (quem pode, qual id, o que sai), não o layout do
 * documento (isso é `tests/unit/fechamento-pdf.test.ts`).
 */
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerCarga, montarFechamento } from "@/lib/comercial/fechamento";
import { renderFechamentoPdf } from "@/lib/comercial/fechamento-pdf";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/comercial/fechamento", () => ({ lerCarga: vi.fn(), montarFechamento: vi.fn() }));
vi.mock("@/lib/comercial/fechamento-pdf", () => ({ renderFechamentoPdf: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CARGA = "33333333-3333-4333-8333-333333333333";

const CARGA_ROW = {
  id: CARGA,
  numero: 7,
  placa: "ABC1D23",
  veiculo_tipo: null,
  motorista_nome: "Zé",
  status: "concluida",
};

function sessao(papel: Role) {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: new NextResponse("forbidden", { status: 403 }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("viewer");
  const cadeia = {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
  };
  vi.mocked(createAdminClient).mockReturnValue({ from: () => cadeia } as never);
});

describe("GET /api/v1/shipments/[id]/fechamento/pdf", () => {
  it("viewer lê: devolve o PDF com o conteúdo do fechamento", async () => {
    vi.mocked(lerCarga).mockResolvedValue(CARGA_ROW as never);
    vi.mocked(montarFechamento).mockResolvedValue({
      carga: CARGA_ROW,
      resumo: {
        totalFaturado: 30000,
        pagoAntecipado: 3000,
        aCobrar: 27000,
        devolvido: 0,
        volumes: 2,
        concluidas: 2,
        pendentes: 0,
      },
      por_condicao: [],
      paradas: [],
      fechamento: null,
      avisos: [],
    } as never);
    vi.mocked(renderFechamentoPdf).mockResolvedValue(Buffer.from("%PDF-1.4 teste") as never);

    const { GET } = await import("@/app/api/v1/shipments/[id]/fechamento/pdf/route");
    const res = await GET(new NextRequest(`http://x/api/v1/shipments/${CARGA}/fechamento/pdf`), {
      params: Promise.resolve({ id: CARGA }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(renderFechamentoPdf).toHaveBeenCalledTimes(1);
  });

  it("id que não é UUID é 400", async () => {
    const { GET } = await import("@/app/api/v1/shipments/[id]/fechamento/pdf/route");
    const res = await GET(new NextRequest(`http://x/api/v1/shipments/nao-e-uuid/fechamento/pdf`), {
      params: Promise.resolve({ id: "nao-e-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("carga inexistente é 404", async () => {
    vi.mocked(lerCarga).mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/shipments/[id]/fechamento/pdf/route");
    const res = await GET(new NextRequest(`http://x/api/v1/shipments/${CARGA}/fechamento/pdf`), {
      params: Promise.resolve({ id: CARGA }),
    });
    expect(res.status).toBe(404);
  });
});
