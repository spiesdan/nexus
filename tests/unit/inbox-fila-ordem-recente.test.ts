import { describe, expect, it } from "vitest";

import { listConversationsHandler } from "@/app/api/v1/conversations/_handler";

/**
 * A Fila também abre pela mensagem mais recente.
 *
 * A ordenação por tempo de espera era intencional, mas o resultado na tela era
 * "mensagem nova embaixo das antigas" — o sintoma que o dono relatou. A Fila
 * continua usando `last_inbound_at` (a última fala do cliente, não a criação
 * da conversa), agora descendente.
 */

function fakeSupabase() {
  const chamadas: { metodo: string; args: unknown[] }[] = [];
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
        }
        return (...args: unknown[]) => {
          chamadas.push({ metodo: String(prop), args });
          return proxy;
        };
      },
    },
  ) as Record<string, unknown>;
  return { client: { from: () => proxy } as never, chamadas };
}

const ctx = {
  organization_id: "org-1",
  requestId: "req-1",
  actor: { type: "user" as const, id: "user-1" },
} as never;

async function ordem(q: Record<string, unknown>) {
  const { client, chamadas } = fakeSupabase();
  await listConversationsHandler(client, ctx, { limit: 50, ...q } as never);
  const chamada = chamadas.find((c) => c.metodo === "order");
  return chamada?.args as [string, { ascending?: boolean }] | undefined;
}

describe("ordem da lista de conversas", () => {
  it("a Fila ordena pela última mensagem do cliente, da mais recente para a mais antiga", async () => {
    expect(await ordem({ comando: ["aguardando"] })).toEqual([
      "last_inbound_at",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("as demais abas continuam por atividade recente", async () => {
    expect(await ordem({})).toEqual([
      "last_message_at",
      { ascending: false, nullsFirst: false },
    ]);
  });
});
