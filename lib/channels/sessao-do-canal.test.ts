/**
 * A sessão de canal lida do BANCO, com o recorte certo.
 *
 * O onboarding dava o passo por cumprido com o que o clique dizia, e o efeito
 * era um número nunca pareado recebendo atendimento. A verificação agora lê a
 * linha de `channel_sessions` que o polling mantém atualizada — e o que este
 * teste protege é o RECORTE: organização + nome da sessão + não arquivada.
 * Sem qualquer um dos três, a resposta pode ser de outra organização, de outra
 * sessão ou de um canal que o usuário excluiu.
 */
import { describe, expect, it, vi } from "vitest";

import { lerSessaoDoCanal } from "./sessao-do-canal";

type Registro = {
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
};

function stub(resultado: { data: unknown; error: { message: string } | null }) {
  const registro: Registro = { eq: [], is: [] };
  const builder = {
    select: () => builder,
    eq: (coluna: string, valor: unknown) => {
      registro.eq.push([coluna, valor]);
      return builder;
    },
    is: (coluna: string, valor: unknown) => {
      registro.is.push([coluna, valor]);
      return builder;
    },
    maybeSingle: async () => resultado,
  };
  return { registro, client: { from: () => builder } };
}

const ORG = "22222222-2222-4222-8222-222222222222";

describe("lerSessaoDoCanal", () => {
  it("recorta organização, nome da sessão e ignora arquivada", async () => {
    const { registro, client } = stub({
      data: { id: "s1", status: "WORKING" },
      error: null,
    });

    const r = await lerSessaoDoCanal(client as never, ORG, "org_abcd1234");

    expect(r.sessao).toEqual({ id: "s1", status: "WORKING" });
    expect(registro.eq).toContainEqual(["organization_id", ORG]);
    expect(registro.eq).toContainEqual(["waha_session_name", "org_abcd1234"]);
    expect(registro.is).toContainEqual(["archived_at", null]);
  });

  it("sem linha devolve null — não inventa sessão", async () => {
    const { client } = stub({ data: null, error: null });
    const r = await lerSessaoDoCanal(client as never, ORG, "org_abcd1234");
    expect(r.sessao).toBeNull();
  });

  it("erro de leitura SOBE — quem chama não pode tratar falha como 'desconectado'", async () => {
    const { client } = stub({ data: null, error: { message: "boom" } });
    await expect(lerSessaoDoCanal(client as never, ORG, "org_abcd1234")).rejects.toThrow("boom");
  });
});
