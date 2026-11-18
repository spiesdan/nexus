/**
 * Dois defeitos medidos na auditoria 5.3, no coração do cadastro de contatos:
 *
 * 1. **Duplicata manual virava 500.** Os índices únicos parciais da organização
 *    (telefone, e-mail, CPF) recusavam o INSERT com `23505`, e o handler
 *    traduzia tudo para `internal_error`. Quem digitou um telefone que já
 *    existia lia "erro interno" — e tentava de novo.
 * 2. **A lista mostrava mesclados e anonimizados.** Mesclado é ponteiro para a
 *    pessoa canônica; anonimizado é o que a LGPD mandou apagar. Os dois
 *    apareciam como contatos normais, duplicando gente e oferecendo ficha morta.
 *
 * O stub grava as cláusulas emitidas: o que se prova aqui é o SQL que a rota
 * MANDA, não o resultado que o Postgres devolveria.
 */
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

import { createContactHandler, listContactsHandler } from "./_handler";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: () => false }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ctx = {
  organization_id: ORG,
  actor: { type: "user", id: "11111111-1111-4111-8111-111111111111" } as const,
  requestId: "req-teste",
};

type Registro = {
  tabela: string;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
  ilike: Array<[string, unknown]>;
  insert: Record<string, unknown> | null;
};

function stub(opts: { erro?: { code: string; message: string }; linhas?: unknown[] } = {}) {
  const consultas: Registro[] = [];
  const criar = (tabela: string) => {
    const r: Registro = { tabela, eq: [], is: [], ilike: [], insert: null };
    consultas.push(r);
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => {
        r.eq.push([c, v]);
        return b;
      },
      is: (c: string, v: unknown) => {
        r.is.push([c, v]);
        return b;
      },
      ilike: (c: string, v: unknown) => {
        r.ilike.push([c, v]);
        return b;
      },
      or: () => b,
      order: () => b,
      limit: () => b,
      insert: (linha: Record<string, unknown>) => {
        r.insert = linha;
        return b;
      },
      single: async () => ({ data: opts.erro ? null : (opts.linhas?.[0] ?? null), error: opts.erro ?? null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: opts.linhas ?? [], error: null }),
    };
    return b;
  };
  return { consultas, client: { from: criar } };
}

describe("createContactHandler", () => {
  it("duplicata (23505) responde 409 com código próprio, não 500", async () => {
    const { client } = stub({ erro: { code: "23505", message: "duplicate key value" } });

    await expect(
      createContactHandler(client as never, ctx, {
        name: "Maria",
        phone_number: "+5541999998888",
        source: "manual",
      } as never),
    ).rejects.toMatchObject({ status: 409, code: "contato_duplicado" });
  });

  it("erro que não é duplicata continua 500", async () => {
    const { client } = stub({ erro: { code: "XX000", message: "boom" } });

    const erro = await createContactHandler(client as never, ctx, {
      name: "Maria",
      source: "manual",
    } as never).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(500);
  });
});

describe("listContactsHandler", () => {
  it("esconde mesclados e anonimizados na consulta, não no filtro da tela", async () => {
    const { consultas, client } = stub();
    await listContactsHandler(client as never, ctx, {});

    const lista = consultas.find((c) => c.tabela === "contacts");
    expect(lista).toBeDefined();
    expect(lista!.is).toContainEqual(["is_merged_into", null]);
    expect(lista!.eq).toContainEqual(["is_anonymized", false]);
  });
});


describe("listContactsHandler — filtro por cidade", () => {
  it("manda ilike (case-insensitive) com o valor trimado e a organização explícita", async () => {
    const { client, consultas } = stub({ linhas: [] });

    await listContactsHandler(client as never, ctx, { cidade: "  Ribeirão Preto  " } as never);

    const q = consultas.find((c) => c.tabela === "contacts");
    expect(q?.eq).toContainEqual(["organization_id", ORG]);
    expect(q?.ilike).toEqual([["cidade", "Ribeirão Preto"]]);
  });

  it("curinga do LIKE na cidade é escapado, não vira 'todos'", async () => {
    // Uma cidade chamada "100%" (ou um valor manipulado na URL) não pode casar
    // com a base inteira: `%` e `_` são operadores do ILIKE.
    const { client, consultas } = stub({ linhas: [] });

    await listContactsHandler(client as never, ctx, { cidade: "100%_oeste" } as never);

    const q = consultas.find((c) => c.tabela === "contacts");
    expect(q?.ilike).toEqual([["cidade", "100\\%\\_oeste"]]);
  });

  it("sem cidade, nenhum ilike é emitido", async () => {
    const { client, consultas } = stub({ linhas: [] });
    await listContactsHandler(client as never, ctx, {} as never);
    expect(consultas.find((c) => c.tabela === "contacts")?.ilike).toEqual([]);
  });
});
