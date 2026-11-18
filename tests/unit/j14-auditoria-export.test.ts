/**
 * J14 — A TRILHA DE AUDITORIA SAI DA TELA EM CSV.
 *
 * `13-jornadas.md` §J14: "a tela de auditoria tem filtros e exportação e o spec
 * de auditoria só verifica que ela abre". A exportação é o artefato que a
 * empresa entrega a auditoria/DPO — se ela sair torta, o erro só aparece na
 * planilha de quem recebeu.
 *
 * O que se prova:
 *
 *   1. cabeçalho e colunas estáveis, CSV com `text/csv` e `attachment`;
 *   2. escape correto de vírgula, aspas e quebra de linha (metadata é JSON —
 *      o campo que mais tem vírgula na vida real);
 *   3. exportação vazia baixa só o cabeçalho — não é erro nem arquivo em branco;
 *   4. filtros da tela (ação, ator, tipo, período) chegam à consulta, sempre
 *      com `organization_id`;
 *   5. viewer não exporta; query inválida é 422; erro do banco é 500 (não um
 *      CSV vazio que pareceria "nada aconteceu").
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const GESTOR = "11111111-1111-4111-8111-111111111111";

const authzOk = {
  ok: true as const,
  user: { id: GESTOR, email: "gestor@j14.test" },
  org: { orgId: ORG, role: "manager" as const, name: "Org J14" },
};

interface Filtro {
  tipo: "eq" | "ilike" | "gte" | "lte";
  coluna: string;
  valor: unknown;
}

function duble(cfg: { linhas?: Record<string, unknown>[]; erro?: { message: string } | null } = {}) {
  const filtros: Filtro[] = [];
  let limite: number | null = null;

  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (coluna: string, valor: unknown) => {
    filtros.push({ tipo: "eq", coluna, valor });
    return q;
  };
  q.ilike = (coluna: string, valor: unknown) => {
    filtros.push({ tipo: "ilike", coluna, valor });
    return q;
  };
  q.gte = (coluna: string, valor: unknown) => {
    filtros.push({ tipo: "gte", coluna, valor });
    return q;
  };
  q.lte = (coluna: string, valor: unknown) => {
    filtros.push({ tipo: "lte", coluna, valor });
    return q;
  };
  q.order = () => q;
  q.limit = (n: number) => {
    limite = n;
    return q;
  };
  q.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data: cfg.linhas ?? [], error: cfg.erro ?? null }).then(resolve);

  return { client: { from: () => q }, filtros, limite: () => limite };
}

function requisicao(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/audit/export${query}`);
}

const LINHA = {
  id: "aud-1",
  created_at: "2026-11-18T12:00:00.000Z",
  actor_user_id: GESTOR,
  action: "contact.created",
  resource_type: "contact",
  resource_id: "c-1",
  request_id: "req-1",
  actor_ip: "127.0.0.1",
  metadata: { nome: "Silva, Maria", obs: 'disse "oi"' },
};

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(createClient).mockReset();
});

describe("GET /audit/export — CSV da trilha", () => {
  it("baixa cabeçalho + linhas como anexo CSV", async () => {
    const { client } = duble({ linhas: [LINHA] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { GET } = await import("@/app/api/v1/audit/export/route");
    const res = await GET(requisicao());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="audit-\d{4}-\d{2}-\d{2}\.csv"$/);

    const linhas = (await res.text()).trimEnd().split("\n");
    expect(linhas[0]).toBe(
      "id,created_at,actor_user_id,action,resource_type,resource_id,request_id,actor_ip,metadata",
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain("aud-1");
    expect(linhas[1]).toContain("contact.created");
  });

  it("escapa vírgula, aspas e quebra de linha", async () => {
    // Um campo com os TRÊS caracteres que quebram CSV de uma vez.
    const { client } = duble({ linhas: [{ ...LINHA, action: 'a,b"c\nd' }] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { GET } = await import("@/app/api/v1/audit/export/route");
    const csv = await (await GET(requisicao())).text();
    // Campo inteiro entre aspas, aspas internas duplicadas, quebra preservada.
    expect(csv).toContain('"a,b""c\nd"');
  });

  it("exportação vazia é só o cabeçalho — não é erro", async () => {
    const { client } = duble({ linhas: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { GET } = await import("@/app/api/v1/audit/export/route");
    const res = await GET(requisicao());
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto.trimEnd().split("\n")).toHaveLength(1);
    expect(texto.startsWith("id,created_at")).toBe(true);
  });

  it("aplica os filtros da tela e sempre a organização ativa", async () => {
    const { client, filtros, limite } = duble({ linhas: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { GET } = await import("@/app/api/v1/audit/export/route");
    await GET(
      requisicao(
        "?action=created&resource_type=contact&actor_id=" +
          GESTOR +
          "&from=2026-11-01T00:00:00.000Z&to=2026-11-30T23:59:59.000Z",
      ),
    );

    expect(filtros).toContainEqual({ tipo: "eq", coluna: "organization_id", valor: ORG });
    expect(filtros).toContainEqual({ tipo: "ilike", coluna: "action", valor: "%created%" });
    expect(filtros).toContainEqual({ tipo: "eq", coluna: "resource_type", valor: "contact" });
    expect(filtros).toContainEqual({ tipo: "eq", coluna: "actor_user_id", valor: GESTOR });
    expect(filtros).toContainEqual({
      tipo: "gte",
      coluna: "created_at",
      valor: "2026-11-01T00:00:00.000Z",
    });
    expect(filtros).toContainEqual({
      tipo: "lte",
      coluna: "created_at",
      valor: "2026-11-30T23:59:59.000Z",
    });
    // A exportação ignora o `limit` do chamador e usa o teto próprio.
    expect(limite()).toBe(10_000);
  });

  it("viewer não exporta — devolve a resposta do guard", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { GET } = await import("@/app/api/v1/audit/export/route");
    const res = await GET(requisicao());
    expect(res.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("query inválida é 422 — data que não é data não vira export completo", async () => {
    const { client } = duble({ linhas: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { GET } = await import("@/app/api/v1/audit/export/route");
    const res = await GET(requisicao("?from=ontem"));
    expect(res.status).toBe(422);
  });

  it("erro do banco é 500 — não baixa CSV vazio como se não houvesse evento", async () => {
    const { client } = duble({ erro: { message: "permission denied" } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { GET } = await import("@/app/api/v1/audit/export/route");
    const res = await GET(requisicao());
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("internal_error");
  });
});
