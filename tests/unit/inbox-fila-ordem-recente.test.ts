import { describe, expect, it } from "vitest";

import { listConversationsHandler } from "@/app/api/v1/conversations/_handler";

/**
 * A LISTA É ORDENADA PELO RELÓGIO QUE ELA MOSTRA.
 *
 * ─── O defeito que este arquivo guarda ──────────────────────────────────────
 *
 * A linha da conversa imprime `conversations.last_message_at`. A aba Fila
 * ordenava por `last_inbound_at`. São dois relógios: a resposta do atendente
 * adianta o primeiro e não mexe no segundo. Na tela, isso vira um item com
 * "14:32" ACIMA de outro com "14:35" — a lista parece fora de ordem sem estar.
 * Relato do dono: "as mensagens não estão em ordem de tempo".
 *
 * A regra passou a ser uma só, em TODAS as abas: `last_message_at` desc. A
 * Fila continua sabendo quem espera há mais tempo (o rótulo "Aguardando há…"
 * mora na linha); o que ela não faz mais é usar outro relógio para POSICIONAR.
 *
 * ⚠️ O teste da Fila DISCRIMINA: com `last_inbound_at` como chave ele fica
 * vermelho. Sem isso ele passaria nos dois mundos e não provaria nada.
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

async function todasAsOrdens(q: Record<string, unknown>) {
  const { client, chamadas } = fakeSupabase();
  await listConversationsHandler(client, ctx, { limit: 50, ...q } as never);
  return chamadas
    .filter((c) => c.metodo === "order")
    .map((c) => c.args as [string, { ascending?: boolean }]);
}

describe("ordem da lista de conversas", () => {
  it("[DISCRIMINA] a Fila ordena pela ÚLTIMA MENSAGEM, e não pela última do cliente", async () => {
    expect(await ordem({ comando: ["aguardando"] })).toEqual([
      "last_message_at",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("as demais abas usam o mesmo relógio", async () => {
    expect(await ordem({})).toEqual([
      "last_message_at",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("Minhas e Automático não divergem da Fila", async () => {
    // A divergência entre abas era o modo de falha: uma ordenava por um
    // relógio, a outra por outro, e a mesma conversa mudava de posição ao
    // trocar de aba. Três asserções, um só contrato.
    for (const filtro of [{ assigned_to: "me" }, { comando: ["automatico"] }]) {
      expect(await ordem(filtro)).toEqual([
        "last_message_at",
        { ascending: false, nullsFirst: false },
      ]);
    }
  });

  it("[DISCRIMINA] o desempate é `id` desc — a ordem que a lista do cliente repete", async () => {
    // Sem o desempate, duas conversas do mesmo instante trocam de posição a
    // cada refetch. E o cursor também depende dele: `(last_message_at, id)` é a
    // chave que anda sem pular nem repetir linha.
    expect(await todasAsOrdens({})).toEqual([
      ["last_message_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
  });
});
