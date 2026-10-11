/**
 * GET/POST laboratorio — gates e o cálculo do delta.
 *
 * ─── O que NÃO se testa aqui ────────────────────────────────────────────────
 *
 * O loop completo (6 simulações + 6 chamadas de juiz) exige LLM de verdade e
 * pool de banco — não há fake honesto para "o modelo responde". As peças têm
 * teste próprio: simulação e juiz em `laboratorio.test.ts` (17 casos), gates e
 * histórico aqui. Um teste que dubla o juiz com resposta fixa provaria a
 * fiação, não o laboratório.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { createClient } from "@/lib/supabase/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const CAMP = "22222222-2222-4222-8222-222222222222";

function sessao(papel: Role = "manager") {
  const user = { id: "user-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function req(metodo: string) {
  return new NextRequest(`http://x/api/v1/prospecting/campaigns/${CAMP}/laboratorio`, {
    method: metodo,
  });
}

const params = { params: Promise.resolve({ id: CAMP }) };

beforeEach(() => {
  vi.clearAllMocks();
  sessao("manager");
});

describe("POST laboratorio", () => {
  it("agent não roda — rodada gasta LLM de verdade", async () => {
    // 6 personas × até 6 turnos + 6 juízes. Quem não pode aprovar gasto não
    // aperta o botão que gasta.
    sessao("agent");
    const { POST } = await import("@/app/api/v1/prospecting/campaigns/[id]/laboratorio/route");
    const res = await POST(req("POST"), params);
    expect(res.status).toBe(403);
  });
});

describe("GET laboratorio", () => {
  function banco(linhas: Record<string, unknown>[]) {
    const cadeia = () => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.order = () => c;
      c.limit = () => Promise.resolve({ data: linhas, error: null });
      return c;
    };
    return { from: (_t: string) => cadeia() } as never;
  }

  it("agrupa por rodada com média e marca config mudada", async () => {
    // Ordem DESC, como o `.order("rodada_em", { ascending: false })` devolve:
    // o fake ignora ordenação, então a ordem vem da massa.
    vi.mocked(createClient).mockResolvedValue(
      banco([
        {
          rodada_em: "2026-10-11T10:00:00Z",
          persona: "a",
          nota: 90,
          resumo: "",
          config_hash: "h2",
        },
        {
          rodada_em: "2026-10-11T10:00:00Z",
          persona: "b",
          nota: null,
          resumo: "",
          config_hash: "h2",
        },
        {
          rodada_em: "2026-10-10T10:00:00Z",
          persona: "a",
          nota: 80,
          resumo: "",
          config_hash: "h1",
        },
        {
          rodada_em: "2026-10-10T10:00:00Z",
          persona: "b",
          nota: 60,
          resumo: "",
          config_hash: "h1",
        },
      ]),
    );
    const { GET } = await import("@/app/api/v1/prospecting/campaigns/[id]/laboratorio/route");
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: {
        rodadas: { rodada_em: string; media: number | null; config_hash: string }[];
        deltas: { delta: number | null; config_mudou: boolean }[];
      };
    };
    // Ordem: mais recente primeiro. Média ignora nulo (90, não 45).
    expect(corpo.data.rodadas[0]?.media).toBe(90);
    expect(corpo.data.rodadas[1]?.media).toBe(70);
    expect(corpo.data.deltas).toHaveLength(1);
    expect(corpo.data.deltas[0]?.delta).toBe(20);
    expect(corpo.data.deltas[0]?.config_mudou).toBe(true);
  });

  it("sem notas válidas a média é nula — não zero", async () => {
    // Zero diria "péssimo"; nulo diz "o juiz não respondeu". A média que
    // mistura os dois mente nas duas direções.
    vi.mocked(createClient).mockResolvedValue(
      banco([
        {
          rodada_em: "2026-10-10T10:00:00Z",
          persona: "a",
          nota: null,
          resumo: "",
          config_hash: "h1",
        },
      ]),
    );
    const { GET } = await import("@/app/api/v1/prospecting/campaigns/[id]/laboratorio/route");
    const res = await GET(req("GET"), params);
    const corpo = (await res.json()) as { data: { rodadas: { media: number | null }[] } };
    expect(corpo.data.rodadas[0]?.media).toBeNull();
  });

  it("viewer lê o histórico", async () => {
    sessao("viewer");
    vi.mocked(createClient).mockResolvedValue(banco([]));
    const { GET } = await import("@/app/api/v1/prospecting/campaigns/[id]/laboratorio/route");
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
  });
});
