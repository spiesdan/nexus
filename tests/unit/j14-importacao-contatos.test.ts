// @vitest-environment node
/**
 * J14 — A IMPORTAÇÃO DE CONTATOS: o lote NÃO morre pela linha 7.
 *
 * `13-jornadas.md` §J14 nomeia a lacuna: "14 rotas e 6 telas com botão e zero
 * teste; o caminho de arquivo inválido, de cabeçalho errado e de importação
 * parcial não é exercitado em lugar nenhum". A regra de produto do arquivo é
 * explícita no cabeçalho da rota: desfecho POR LINHA — linha inválida é pulada
 * com motivo, duplicado é contado, o resto entra.
 *
 * O que se prova:
 *
 *   1. sem arquivo / formato errado / cabeçalho sem telefone nem e-mail: 422
 *      com instrução, antes de qualquer escrita;
 *   2. CSV válido: insere com `organization_id` da sessão, fonte `import_csv`,
 *      emite `contact.created` e audita `contacts.imported`;
 *   3. importação PARCIAL: a linha inválida volta com número e motivo, a boa
 *      entra — o lote não é tudo-ou-nada;
 *   4. permissão negada devolve o guard e nem lê o arquivo.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ATENDENTE = "11111111-1111-4111-8111-111111111111";

const authzOk = {
  ok: true as const,
  user: { id: ATENDENTE, email: "agent@j14.test" },
  org: { orgId: ORG, role: "agent" as const, name: "Org J14" },
};

function duble() {
  const inserts: Record<string, unknown>[] = [];
  const rpc: Array<{ nome: string; args: Record<string, unknown> }> = [];

  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.not = () => q;
  q.in = () => q;
  q.insert = (linha: Record<string, unknown>) => {
    inserts.push(linha);
    return q;
  };
  q.single = async () => ({ data: { id: `contato-${inserts.length}` }, error: null });
  q.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);

  return {
    client: {
      from: () => q,
      rpc: (nome: string, args: Record<string, unknown>) => {
        rpc.push({ nome, args });
        return Promise.resolve({ data: null, error: null });
      },
    },
    inserts,
    rpc,
  };
}

function requisicao(arquivo: File | null): NextRequest {
  const form = new FormData();
  if (arquivo) form.set("file", arquivo);
  return new NextRequest("http://localhost/api/v1/contacts/import", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(authzOk as never);
  vi.mocked(createClient).mockReset();
  vi.mocked(audit).mockClear();
});

describe("POST /contacts/import — planilha de contatos", () => {
  it("sem arquivo é 422 com a instrução do campo", async () => {
    const { client } = duble();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/contacts/import/route");
    const res = await POST(requisicao(null));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("multipart/form-data");
  });

  it("XLSX é recusado com instrução de salvar como CSV", async () => {
    const { client } = duble();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/contacts/import/route");
    const res = await POST(
      requisicao(
        new File(["binario"], "contatos.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      ),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("Formato não suportado");
  });

  it("cabeçalho sem telefone nem e-mail é 422 — nada é escrito", async () => {
    const { client, inserts } = duble();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/contacts/import/route");
    const res = await POST(
      requisicao(new File(["nome,cidade\nMaria,Ribeirão Preto\n"], "contatos.csv", { type: "text/csv" })),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("Cabeçalho inválido");
    expect(inserts).toEqual([]);
  });

  it("CSV válido insere com a organização da sessão, fonte import_csv e audita", async () => {
    const { client, inserts, rpc } = duble();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/contacts/import/route");
    const res = await POST(
      requisicao(
        new File(
          ["nome,telefone,email\nMaria Silva,+5511999998888,maria@exemplo.com\n"],
          "contatos.csv",
          { type: "text/csv" },
        ),
      ),
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { total_linhas: number; imported: number; errors: unknown[] };
    };
    expect(corpo.data).toMatchObject({ total_linhas: 1, imported: 1, errors: [] });

    expect(inserts[0]).toMatchObject({
      organization_id: ORG,
      source: "import_csv",
      name: "Maria Silva",
      phone_number: "+5511999998888",
    });
    expect(rpc.map((r) => r.nome)).toContain("emit_event");
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "contacts.imported", organizationId: ORG }),
    );
  });

  it("importação parcial: linha 2 inválida volta com motivo e a linha 3 entra", async () => {
    const { client, inserts } = duble();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/contacts/import/route");
    const res = await POST(
      requisicao(
        new File(
          [
            [
              "nome,telefone\n",
              "Telefone Ruim,123\n",
              "João Bom,+5511988887777\n",
            ].join(""),
          ],
          "contatos.csv",
          { type: "text/csv" },
        ),
      ),
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { total_linhas: number; imported: number; errors: Array<{ linha: number; motivo: string }> };
    };
    // O lote não morre pela linha ruim.
    expect(corpo.data.total_linhas).toBe(2);
    expect(corpo.data.imported).toBe(1);
    expect(corpo.data.errors).toHaveLength(1);
    expect(corpo.data.errors[0]?.linha).toBe(2);
    expect(corpo.data.errors[0]?.motivo).toMatch(/telefone inválido/i);
    expect(inserts).toHaveLength(1);
  });

  it("todas as linhas inválidas: 200 com erros nominais, nada escrito", async () => {
    const { client, inserts } = duble();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("@/app/api/v1/contacts/import/route");
    const res = await POST(
      requisicao(new File(["nome,telefone\nA,123\nB,456\n"], "contatos.csv", { type: "text/csv" })),
    );
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { imported: number; errors: unknown[] } };
    expect(corpo.data.imported).toBe(0);
    expect(corpo.data.errors).toHaveLength(2);
    expect(inserts).toEqual([]);
  });

  it("viewer não importa — devolve o guard e não escreve", async () => {
    const { client, inserts } = duble();
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { POST } = await import("@/app/api/v1/contacts/import/route");
    const res = await POST(
      requisicao(new File(["nome,telefone\nA,+5511999998888\n"], "contatos.csv", { type: "text/csv" })),
    );
    expect(res.status).toBe(403);
    expect(inserts).toEqual([]);
  });
});
