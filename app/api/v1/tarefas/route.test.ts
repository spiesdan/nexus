import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/lib/auth/types";

/**
 * GET /api/v1/tarefas — o filtro `responsavel=minhas` (novo na refatoração
 * da aba Meu Dia) precisa provar DUAS pontas:
 *
 *  - o default NÃO muda: sem o parâmetro a lista continua sendo da
 *    organização inteira (é o que o Kanban e as telas atuais pedem — um
 *    "otimismo" silencioso aqui mudaria o que cada tela enxerga);
 *  - `minhas` = as minhas + as SEM DONO (a coluna é filtro de equipe, não de
 *    propriedade — tarefa órfã é fila da equipe e não pode sumir de quem
 *    olha "só o que é meu").
 *
 * E o parâmetro desconhecido cai em 422 em vez de ser ignorado: silenciar
 * erro de digitação num filtro faria a tela mostrar a organização inteira
 * achando que mostrou só as minhas.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

/** Registro das chamadas de query, para afirmar o que FOI (e o que não foi) filtrado. */
let chamadas: string[];

/**
 * Double encadeável do client Supabase: devolve `this` em todo método da
 * cadeia (select/eq/order/limit/or) e resolve o `await` com lista vazia —
 * assim o handler nunca desce para o join de contatos (que exigiria um
 * segundo double) e a lista de chamadas fica sendo a prova do filtro.
 */
function stubSupabase() {
  chamadas = [];
  const encadeavel: Record<string, unknown> = {};
  const registrar =
    (nome: string) =>
    (...args: unknown[]) => {
      chamadas.push(
        `${nome}(${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(", ")})`,
      );
      return encadeavel;
    };
  for (const m of ["select", "eq", "order", "limit", "or"]) encadeavel[m] = registrar(m);
  encadeavel.then = (onOk: unknown, onErr: unknown) =>
    Promise.resolve({ data: [], error: null }).then(
      onOk as () => void,
      onErr as () => void,
    );
  return {
    from: (tabela: string) => {
      chamadas.push(`from(${tabela})`);
      return encadeavel;
    },
  };
}

function mockAuthzOk() {
  const user: AuthUser = {
    id: USER_ID,
    email: "a@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: "manager" }],
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user,
    org: { orgId: ORG_ID, name: "Org", role: "manager" },
  });
}

function getReq(query = "") {
  return new NextRequest(`http://localhost/api/v1/tarefas${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubSupabase();
  vi.mocked(createClient).mockImplementation(async () => stubSupabase() as never);
});

describe("GET /api/v1/tarefas — responsavel", () => {
  it("sem parâmetro: organização inteira, sem .or() (default preservado)", async () => {
    mockAuthzOk();
    const { GET } = await import("./route");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(chamadas).toContain(`from(commercial_tasks)`);
    expect(chamadas).toContain(`eq(organization_id, ${ORG_ID})`);
    expect(chamadas.filter((c) => c.startsWith("or("))).toEqual([]);
  });

  it("responsavel=minhas: .or() com o id do usuário + sem dono", async () => {
    mockAuthzOk();
    const { GET } = await import("./route");
    const res = await GET(getReq("?responsavel=minhas"));
    expect(res.status).toBe(200);
    expect(chamadas).toContain(
      `or(responsavel_user_id.eq.${USER_ID},responsavel_user_id.is.null)`,
    );
    // A restrição de organização continua lá em todo caso — o filtro novo
    // aperta o escopo, nunca abre.
    expect(chamadas).toContain(`eq(organization_id, ${ORG_ID})`);
  });

  it("status + responsavel convivem: as duas restrições chegam na query", async () => {
    mockAuthzOk();
    const { GET } = await import("./route");
    const res = await GET(getReq("?status=pendente&responsavel=minhas"));
    expect(res.status).toBe(200);
    expect(chamadas).toContain("eq(status, pendente)");
    expect(chamadas).toContain(
      `or(responsavel_user_id.eq.${USER_ID},responsavel_user_id.is.null)`,
    );
  });

  it("responsavel desconhecido → 422 validation_failed (não silencia erro de filtro)", async () => {
    mockAuthzOk();
    const { GET } = await import("./route");
    const res = await GET(getReq("?responsavel=equipe"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_failed");
    // O 422 não pode ter deixado passar uma query pela metade.
    expect(chamadas).toEqual([]);
  });

  it("status desconhecido segue 422 (regressão do filtro pré-existente)", async () => {
    mockAuthzOk();
    const { GET } = await import("./route");
    const res = await GET(getReq("?status=voando"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_failed");
  });
});
