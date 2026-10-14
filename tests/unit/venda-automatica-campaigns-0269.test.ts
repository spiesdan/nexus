/**
 * POST /api/v1/automatic-sales/campaigns — os campos novos chegam ao banco.
 *
 * ═══ POR QUE ESTE TESTE EXISTE ════════════════════════════════════════════
 *
 * O schema valida, a migration cria a coluna — e no meio fica o `.insert()`
 * da rota, escrito à mão. Se alguém acrescentar o campo no schema e esquecer
 * no insert, a campanha é criada "com mensagem" na tela e sem mensagem no
 * banco: o motor cai no gerar IA, e o dono descobre quando o cliente recebe
 * um texto que ele não escreveu.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";

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
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

/** Supabase dublado que GUARDA o que foi inserido — é isso que se mede. */
function banco() {
  const inseridos: Record<string, unknown>[] = [];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    insert: (carga: Record<string, unknown>) => {
      inseridos.push(carga);
      return {
        select: () => ({ single: async () => ({ data: { id: "camp-1" }, error: null }) }),
      };
    },
  };
  vi.mocked(createClient).mockReturnValue({ from: () => q } as never);
  return inseridos;
}

function post(corpo: unknown) {
  return new NextRequest("http://x/api/v1/automatic-sales/campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function base(sobre: Record<string, unknown> = {}) {
  return {
    nome: "Radar Videira",
    cidade: "Videira",
    limite_diario: 30,
    janela_inicio: "09:00",
    janela_fim: "17:30",
    ...sobre,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("agent");
});

describe("POST /api/v1/automatic-sales/campaigns — 0269", () => {
  it("mensagem, cooldown e lista chegam ao insert", async () => {
    const inseridos = banco();
    const { POST } = await import("@/app/api/v1/automatic-sales/campaigns/route");
    const id = "11111111-1111-4111-8111-111111111111";
    const res = await POST(
      post({
        ...base(),
        mensagem_padrao: "Olá! Aqui é da loja.",
        cooldown_segundos: 90,
        prospect_ids: [id],
      }),
    );
    expect([200, 201]).toContain(res.status);
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0]).toMatchObject({
      organization_id: ORG,
      mensagem_padrao: "Olá! Aqui é da loja.",
      cooldown_segundos: 90,
      prospect_ids: [id],
    });
  });

  it("MUTAÇÃO: campo esquecido no insert cria campanha muda", async () => {
    // Se o `mensagem_padrao` validado não fosse repassado, o insert passaria
    // com a coluna ausente e o motor geraria por IA — este teste é o que
    // impede as duas pontas de divergirem em silêncio.
    const inseridos = banco();
    const { POST } = await import("@/app/api/v1/automatic-sales/campaigns/route");
    await POST(post({ ...base(), mensagem_padrao: "texto fixo" }));
    expect(Object.keys(inseridos[0] ?? {})).toContain("mensagem_padrao");
    expect(Object.keys(inseridos[0] ?? {})).toContain("cooldown_segundos");
    expect(Object.keys(inseridos[0] ?? {})).toContain("prospect_ids");
  });

  it("lista vazia vira NULL, não array vazio", async () => {
    // `[]` no banco seria uma terceira interpretação ("lista de ninguém")
    // que o motor teria que adivinhar. NULL = sem lista = filtro.
    const inseridos = banco();
    const { POST } = await import("@/app/api/v1/automatic-sales/campaigns/route");
    await POST(post(base()));
    expect(inseridos[0]?.prospect_ids).toBeNull();
  });

  it("cooldown fora da faixa é 422 (espelha o CHECK)", async () => {
    banco();
    const { POST } = await import("@/app/api/v1/automatic-sales/campaigns/route");
    const res = await POST(post({ ...base(), cooldown_segundos: 5 }));
    expect(res.status).toBe(422);
  });
});
