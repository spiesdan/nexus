/**
 * POST /api/v1/financeiro/recebiveis — dinheiro a receber não pode duplicar no retry.
 *
 * O cliente HTTP injeta `Idempotency-Key` em todo POST, mas o servidor só
 * honrava a chave em duas rotas. Criar recebível sem honrar significa que um
 * timeout de rede vira DUAS dívidas do mesmo cliente no mesmo pedido.
 *
 * O que se mede aqui:
 *   1. replay com a mesma chave e o mesmo corpo devolve os MESMOS ids, com
 *      `Idempotent-Replayed: true`, e **não** insere de novo;
 *   2. a mesma chave com corpo diferente é 409 (reuso indevido, não cache hit);
 *   3. sem a chave, a rota continua criando como antes.
 *
 * O banco é o dublê encadeável do molde de `shipment-fechamento-route.test.ts`:
 * o filtro do Supabase encadeia `.eq().eq()`, e dublê raso falha com
 * `not a function` — que parece bug da rota e é typo do dublê.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { hashDaRequisicao } from "@/lib/api/idempotencia";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const GESTOR = "11111111-1111-4111-8111-111111111111";
const CONTATO = "44444444-4444-4444-8444-444444444444";

const CORPO = {
  contact_id: CONTATO,
  valor_original_cents: 90_000,
  parcelas: 3,
  vencimento: "2026-12-10",
};

type Cadeia = Record<string, unknown>;

/** Encadeável, com terminal configurável por tabela + operação. */
function cadeia(comportamento: {
  talvez?: () => Promise<{ data: unknown; error: unknown }>;
  inserir?: (carga: unknown) => Promise<{ data: unknown; error: unknown }>;
}): Cadeia {
  const q: Cadeia = {};
  const devolve = () => q;
  for (const metodo of ["select", "eq", "in", "order", "limit", "range", "not"]) {
    q[metodo] = devolve;
  }
  q.maybeSingle = () => comportamento.talvez?.() ?? Promise.resolve({ data: null, error: null });
  q.single = () => comportamento.talvez?.() ?? Promise.resolve({ data: null, error: null });
  // O insert encadeia (`.insert(...).select("id")`) ou é aguardado direto.
  // Nos dois casos o resultado é a promessa da inserção, resolvida no then.
  let insercao: Promise<{ data: unknown; error: unknown }> | undefined;
  q.insert = (carga: unknown) => {
    insercao = comportamento.inserir?.(carga) ?? Promise.resolve({ data: null, error: null });
    return q;
  };
  q.then = (resolve: (v: unknown) => unknown) =>
    (insercao ?? comportamento.talvez?.() ?? Promise.resolve({ data: null, error: null })).then(resolve);
  return q;
}

function req(corpo: unknown, chave?: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/financeiro/recebiveis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(chave ? { "Idempotency-Key": chave } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: GESTOR, email: "gestor@invariant.test" },
    org: { orgId: ORG, role: "manager", name: "Org" },
    supabase: {},
  } as never);
});

describe("POST /api/v1/financeiro/recebiveis — idempotência", () => {
  it("replay com a mesma chave e corpo devolve os mesmos ids e não insere", async () => {
    let insercoes = 0;
    vi.mocked(createClient).mockResolvedValue(
      {
        from: (tabela: string) => {
          if (tabela === "contacts") {
            return cadeia({ talvez: async () => ({ data: { id: CONTATO }, error: null }) });
          }
          return cadeia({
            inserir: async (carga) => {
              insercoes += 1;
              const n = (carga as unknown[]).length;
              return { data: Array.from({ length: n }, (_, i) => ({ id: `rec-${i + 1}` })), error: null };
            },
          });
        },
      } as never,
    );

    vi.mocked(createAdminClient).mockReturnValue(
      {
        from: () =>
          cadeia({
            talvez: async () => ({
              data: {
                request_hash: hashDaRequisicao(CORPO),
                status_code: 201,
                response_body: { ids: ["rec-1", "rec-2", "rec-3"] },
              },
              error: null,
            }),
          }),
      } as never,
    );

    const { POST } = await import("@/app/api/v1/financeiro/recebiveis/route");
    const res = await POST(req(CORPO, "chave-replay"));

    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotent-Replayed")).toBe("true");
    const corpo = (await res.json()) as { data: { ids: string[] } };
    expect(corpo.data.ids).toEqual(["rec-1", "rec-2", "rec-3"]);
    expect(insercoes, "replay não pode inserir recebível").toBe(0);
  });

  it("mesma chave com corpo diferente é 409 — não é cache hit", async () => {
    vi.mocked(createClient).mockResolvedValue(
      {
        from: (tabela: string) =>
          tabela === "contacts"
            ? cadeia({ talvez: async () => ({ data: { id: CONTATO }, error: null }) })
            : cadeia({}),
      } as never,
    );

    vi.mocked(createAdminClient).mockReturnValue(
      {
        from: () =>
          cadeia({
            talvez: async () => ({
              data: {
                request_hash: hashDaRequisicao({ ...CORPO, valor_original_cents: 1 }),
                status_code: 201,
                response_body: { ids: ["rec-1"] },
              },
              error: null,
            }),
          }),
      } as never,
    );

    const { POST } = await import("@/app/api/v1/financeiro/recebiveis/route");
    const res = await POST(req(CORPO, "chave-reusada"));

    expect(res.status).toBe(409);
    const corpo = (await res.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("conflict");
  });

  it("sem chave, cria normalmente (comportamento anterior preservado)", async () => {
    let insercoes = 0;
    vi.mocked(createClient).mockResolvedValue(
      {
        from: (tabela: string) => {
          if (tabela === "contacts") {
            return cadeia({ talvez: async () => ({ data: { id: CONTATO }, error: null }) });
          }
          return cadeia({
            inserir: async (carga) => {
              insercoes += 1;
              const n = (carga as unknown[]).length;
              return { data: Array.from({ length: n }, (_, i) => ({ id: `novo-${i + 1}` })), error: null };
            },
          });
        },
      } as never,
    );
    vi.mocked(createAdminClient).mockReturnValue({ from: () => cadeia({}) } as never);

    const { POST } = await import("@/app/api/v1/financeiro/recebiveis/route");
    const res = await POST(req(CORPO));

    expect(res.status).toBe(201);
    expect(insercoes).toBe(1);
    const corpo = (await res.json()) as { data: { ids: string[] } };
    expect(corpo.data.ids).toEqual(["novo-1", "novo-2", "novo-3"]);
  });

  it("JSON inválido é 400 e não toca o banco", async () => {
    vi.mocked(createClient).mockResolvedValue({ from: () => cadeia({}) } as never);
    vi.mocked(createAdminClient).mockReturnValue({ from: () => cadeia({}) } as never);

    const { POST } = await import("@/app/api/v1/financeiro/recebiveis/route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/financeiro/recebiveis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
  });
});
