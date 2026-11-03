import { describe, expect, it } from "vitest";

import { ackToStatus } from "@/lib/types/messaging";
import { dispatchWahaEvent, type WahaEnvelope } from "@/lib/waha/ingest";

/**
 * O ACK DO WHATSAPP É A ÚNICA PROVA DE QUE A MENSAGEM SAIU.
 *
 * ─── O defeito, medido em 30/10/2026 ────────────────────────────────────────
 *
 * A campanha mostrou 90 "enviadas" e o celular do cliente tinha recebido 22. O
 * resto não existia: no canal por QR o POST volta com id mesmo quando o
 * WhatsApp recusa depois (erro 463), e o CRM gravava `sent` no aceite do
 * transporte. A tela ficava verde para uma mensagem que nunca chegou — e a
 * única coisa que poderia desmentir isso, o ack negativo, caía no mesmo ramo do
 * zero e virava `sending` para sempre.
 *
 * ─── O que estes casos prendem ──────────────────────────────────────────────
 *
 * Que o degrau do ack vire status (`sent`/`delivered`/`read`); que o ack
 * negativo vire `failed` COM motivo legível; e que um ack positivo depois do
 * erro cure o registro — senão a linha fica "falhou" para sempre com um erro
 * que o próprio canal já desmentiu.
 *
 * ⚠️ O teste entra pelo caminho de produção (`dispatchWahaEvent`), não chamando
 * `handleAck` direto: o que interessa é o que o WEBHOOK REAL faz com o evento.
 */

interface Captura {
  valores: Record<string, unknown>;
  externalIds: string[];
}

/** Um admin de mentira que captura o UPDATE em `messages`. */
function adminQueCaptura(): { admin: unknown; capturas: Captura[] } {
  const capturas: Captura[] = [];
  const admin = {
    from: (tabela: string) => {
      if (tabela !== "messages") throw new Error(`tabela inesperada: ${tabela}`);
      return {
        update: (valores: Record<string, unknown>) => ({
          eq: () => ({
            in: async (_coluna: string, ids: string[]) => {
              capturas.push({ valores, externalIds: ids });
              return { error: null };
            },
          }),
        }),
      };
    },
  };
  return { admin, capturas };
}

const SESSION = { id: "sessao-1", organization_id: "org-1" };

function ack(id: string, valor: number, extra: Record<string, unknown> = {}): WahaEnvelope {
  return {
    event: "message.ack",
    session: "default",
    payload: { id, ack: valor, ...extra },
  };
}

async function despachar(envelope: WahaEnvelope) {
  const { admin, capturas } = adminQueCaptura();
  await dispatchWahaEvent(admin as never, SESSION as never, envelope, "req-1");
  return capturas;
}

describe("ackToStatus — o degrau do WhatsApp vira status", () => {
  it("1, 2 e 3 sobem a escada sent → delivered → read", () => {
    expect(ackToStatus(1)).toBe("sent");
    expect(ackToStatus(2)).toBe("delivered");
    expect(ackToStatus(3)).toBe("read");
    expect(ackToStatus(4)).toBe("read");
  });

  it("0 é pendente, não enviado", () => {
    expect(ackToStatus(0)).toBe("sending");
  });

  it("-1 é FALHA — o ackName ERROR do WhatsApp", () => {
    // Antes caía no mesmo ramo do zero: a mensagem recusada (463) ficava com
    // cara de "a caminho" e a tela não tinha como dizer que ela não saiu.
    expect(ackToStatus(-1)).toBe("failed");
    expect(ackToStatus(-2)).toBe("failed");
  });
});

describe("message.ack no webhook do WAHA", () => {
  it("ack 1 grava sent, ack 1 e não inventa entrega", async () => {
    const [captura] = await despachar(ack("true_5511999@c.us_ABC", 1));

    expect(captura!.valores.status).toBe("sent");
    expect(captura!.valores.ack).toBe(1);
    expect(captura!.valores.delivered_at).toBeUndefined();
    expect(captura!.valores.read_at).toBeUndefined();
  });

  it("ack 2 grava delivered com o instante da entrega", async () => {
    const [captura] = await despachar(ack("true_5511999@c.us_ABC", 2));

    expect(captura!.valores.status).toBe("delivered");
    expect(typeof captura!.valores.delivered_at).toBe("string");
    expect(captura!.valores.read_at).toBeUndefined();
  });

  it("ack 3 grava read com entrega e leitura", async () => {
    const [captura] = await despachar(ack("true_5511999@c.us_ABC", 3));

    expect(captura!.valores.status).toBe("read");
    expect(typeof captura!.valores.delivered_at).toBe("string");
    expect(typeof captura!.valores.read_at).toBe("string");
  });

  it("ack negativo vira failed COM motivo legível", async () => {
    const [captura] = await despachar(
      ack("true_5511999@c.us_ABC", -1, {
        ackName: "ERROR",
        error: "463: account restricted",
      }),
    );

    expect(captura!.valores.status).toBe("failed");
    expect(captura!.valores.error_code).toBe("whatsapp_ack_error");
    expect(String(captura!.valores.error_message)).toContain("ERROR");
    expect(String(captura!.valores.error_message)).toContain("463");
  });

  it("sem ackName, o motivo ainda existe — não fica 'Falhou' sem porquê", async () => {
    const [captura] = await despachar(ack("true_5511999@c.us_ABC", -1));

    expect(captura!.valores.status).toBe("failed");
    expect(String(captura!.valores.error_message)).toContain("ERROR");
  });

  it("ack positivo DEPOIS do erro cura o registro", async () => {
    // Mensagem que saiu atrasada: sem isto, a linha fica "failed" para sempre
    // com um erro que o próprio canal já desmentiu.
    const [captura] = await despachar(ack("true_5511999@c.us_ABC", 2));

    expect(captura!.valores.error_code).toBeNull();
    expect(captura!.valores.error_message).toBeNull();
  });

  it("casa as duas formas do id — bare (NOWEB) e composto (WEBJS)", async () => {
    const [captura] = await despachar(ack("true_5511999@c.us_ABC", 1));

    expect(captura!.externalIds).toEqual(["true_5511999@c.us_ABC", "ABC"]);
  });

  it("id sem composição é procurado como veio", async () => {
    const [captura] = await despachar(ack("ABC", 1));

    expect(captura!.externalIds).toEqual(["ABC"]);
  });

  it("ack sem id não atualiza nada", async () => {
    const capturas = await despachar({
      event: "message.ack",
      session: "default",
      payload: { ack: 1 },
    });

    expect(capturas).toHaveLength(0);
  });
});
