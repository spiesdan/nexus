import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ROTA do webhook aplicando o status de entrega em `messages`.
 *
 * Prova o que a unidade não prova: que a transição monotônica chega ao `update`
 * (`.in("status", …)`) e que um evento sem linha correspondente não fica mudo.
 *
 * O mock de admin é um encadeamento só — `update().eq().eq().in().select()` —,
 * porque é exatamente a forma que a rota usa. Ele guarda o patch e a lista de
 * estados permitidos para as asserções.
 */

const SESSAO = { id: "sess-1", organizationId: "org-1", wabaId: "2434045433735175" };
const APP_SECRET = "app-secret-de-teste";

interface Captura {
  patch: Record<string, unknown> | null;
  permitidos: readonly string[] | null;
}

const captura: Captura = { patch: null, permitidos: null };
let linhasAtualizadas: { id: string }[] = [{ id: "m1" }];

vi.mock("@/lib/channels/meta/session", () => ({
  metaSessionByWebhookToken: async () => SESSAO,
}));

vi.mock("@/lib/channels/meta/ingest", () => ({
  ingestMetaInbound: async () => ({ status: "ingested" }),
}));

vi.mock("@/lib/supabase/admin", () => {
  const cadeia = {
    update(patch: Record<string, unknown>) {
      captura.patch = patch;
      return cadeia;
    },
    eq() {
      return cadeia;
    },
    in(_coluna: string, valores: readonly string[]) {
      captura.permitidos = valores;
      return cadeia;
    },
    select() {
      return Promise.resolve({ data: linhasAtualizadas, error: null });
    },
  };
  return { createAdminClient: () => ({ from: () => cadeia }) };
});

import { POST } from "@/app/api/v1/webhooks/meta/[token]/route";

const pedido = (corpo: unknown) => {
  const cru = JSON.stringify(corpo);
  return {
    text: async () => cru,
    headers: new Headers({
      "x-hub-signature-256": `sha256=${createHmac("sha256", APP_SECRET).update(cru, "utf8").digest("hex")}`,
    }),
  } as never;
};

const ctx = { params: Promise.resolve({ token: "token-de-teste" }) } as never;

function envelopeDeStatus(status: string, extra: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: SESSAO.wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5531989666398", phone_number_id: "123" },
              statuses: [
                {
                  id: "wamid.HBgMNTUzMTk4OTY2NjM5OBUCABIYFj",
                  status,
                  timestamp: "1750000000",
                  recipient_id: "5531999999999",
                  ...extra,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  captura.patch = null;
  captura.permitidos = null;
  linhasAtualizadas = [{ id: "m1" }];
});

describe("a rota grava o degrau que a Meta confirmou", () => {
  it("`delivered` vira status + delivered_at, e só avança de quem já saiu", async () => {
    const res = await POST(pedido(envelopeDeStatus("delivered")), ctx);

    expect(res.status).toBe(200);
    expect(captura.patch).toMatchObject({ status: "delivered" });
    expect(captura.patch?.delivered_at).toBeTypeOf("string");
    expect(captura.permitidos).toEqual(["queued", "sending", "sent"]);
    expect(await res.json()).toMatchObject({ data: { outcomes: ["status_delivered"] } });
  });

  it("`read` grava read_at e não parte de um estado já lido", async () => {
    const res = await POST(pedido(envelopeDeStatus("read")), ctx);

    expect(captura.patch).toMatchObject({ status: "read" });
    expect(captura.patch?.read_at).toBeTypeOf("string");
    expect(captura.permitidos).toEqual(["queued", "sending", "sent", "delivered"]);
    expect(await res.json()).toMatchObject({ data: { outcomes: ["status_read"] } });
  });

  it("`failed` leva o código da Meta para error_code", async () => {
    const res = await POST(
      pedido(
        envelopeDeStatus("failed", {
          errors: [{ code: 131047, title: "Re-engagement message" }],
        }),
      ),
      ctx,
    );

    expect(captura.patch).toMatchObject({
      status: "failed",
      error_code: "131047",
      error_message: "Re-engagement message",
    });
    expect(await res.json()).toMatchObject({ data: { outcomes: ["status_failed"] } });
  });

  it("status desconhecido NÃO escreve e aparece no desfecho", async () => {
    const res = await POST(pedido(envelopeDeStatus("deleted")), ctx);

    expect(res.status).toBe(200);
    expect(captura.patch).toBeNull();
    expect(await res.json()).toMatchObject({ data: { outcomes: ["status_desconhecido"] } });
  });

  it("sem linha correspondente o desfecho diz isso — não fica mudo", async () => {
    linhasAtualizadas = [];
    const res = await POST(pedido(envelopeDeStatus("delivered")), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { outcomes: ["status_sem_linha"] } });
  });
});
