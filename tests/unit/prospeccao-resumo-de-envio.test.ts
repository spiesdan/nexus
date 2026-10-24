import { describe, expect, it } from "vitest";

import {
  entregaDoStatus,
  resumirEnvios,
  type EnvioDaCampanha,
} from "@/lib/prospeccao/resumo-de-envio";

/**
 * A conta que a tela de controle mostra.
 *
 * O defeito original não era só visual: a lista de campanhas exibia o funil de
 * descoberta (`encontrados/contatados`) e não tinha o número que o operador usa
 * para decidir — quantas já saíram e quantas faltam. O ledger tem três estados
 * (enviado, reservado sem comprovante e ainda não reservado) e os três precisam
 * aparecer sem se misturar.
 */

function envio(prospect_id: string, message_id: string | null, enviado_em: string | null = null): EnvioDaCampanha {
  return { prospect_id, message_id, enviado_em };
}

describe("resumirEnvios", () => {
  it("conta enviados pelo comprovante, não pela existência da reserva", () => {
    const r = resumirEnvios({
      prospectIds: ["a", "b", "c"],
      sends: [envio("a", "msg-1", "2026-10-22T12:00:00.000Z"), envio("b", null)],
    });

    expect(r.total).toBe(3);
    expect(r.enviados).toBe(1);
    expect(r.pendentes).toBe(2);
    expect(r.sem_confirmacao).toBe(1);
    expect(r.percentual).toBe(33);
    expect(r.ultimo_envio_at).toBe("2026-10-22T12:00:00.000Z");
  });

  it("sem lista fechada, o ledger é o tamanho da fila", () => {
    const r = resumirEnvios({
      sends: [envio("a", "msg-1", "2026-10-22T12:00:00.000Z"), envio("b", "msg-2", "2026-10-22T12:01:00.000Z")],
    });

    expect(r.total).toBe(2);
    expect(r.enviados).toBe(2);
    expect(r.pendentes).toBe(0);
    expect(r.percentual).toBe(100);
    expect(r.ultimo_envio_at).toBe("2026-10-22T12:01:00.000Z");
  });

  it("o público calculado entra como total quando ainda não há lista fechada nem ledger", () => {
    const r = resumirEnvios({ sends: [], totalFallback: 48 });

    expect(r.total).toBe(48);
    expect(r.enviados).toBe(0);
    expect(r.pendentes).toBe(48);
    expect(r.percentual).toBe(0);
  });

  it("não conta a mesma empresa duas vezes se o ledger vier duplicado", () => {
    const r = resumirEnvios({
      prospectIds: ["a", "b"],
      sends: [envio("a", "msg-1"), envio("a", "msg-1"), envio("b", null)],
    });

    expect(r.total).toBe(2);
    expect(r.enviados).toBe(1);
    expect(r.pendentes).toBe(1);
    expect(r.sem_confirmacao).toBe(1);
  });

  it("campanha vazia não divide por zero nem inventa 100%", () => {
    const r = resumirEnvios({ prospectIds: [], sends: [] });

    expect(r.total).toBe(0);
    expect(r.enviados).toBe(0);
    expect(r.pendentes).toBe(0);
    expect(r.percentual).toBe(0);
    expect(r.ultimo_envio_at).toBeNull();
  });
});

describe("o degrau de entrega que o canal confirmou", () => {
  it("conta lido como entregue também — 10 lidas e 3 entregues seria contradição", () => {
    const r = resumirEnvios({
      sends: [
        { prospect_id: "a", message_id: "m1", enviado_em: null, status: "read" },
        { prospect_id: "b", message_id: "m2", enviado_em: null, status: "delivered" },
        { prospect_id: "c", message_id: "m3", enviado_em: null, status: "failed" },
        { prospect_id: "d", message_id: "m4", enviado_em: null, status: "sent" },
      ],
    });

    expect(r.enviados).toBe(4);
    expect(r.entregues).toBe(2);
    expect(r.lidos).toBe(1);
    expect(r.falhas).toBe(1);
  });

  it("reserva sem comprovante não entra em nenhum degrau de entrega", () => {
    const r = resumirEnvios({ sends: [{ prospect_id: "a", message_id: null, enviado_em: null }] });

    expect(r.enviados).toBe(0);
    expect(r.entregues).toBe(0);
    expect(r.lidos).toBe(0);
    expect(r.falhas).toBe(0);
    expect(r.sem_confirmacao).toBe(1);
  });

  it("quem não consultou `messages` não vira falha nem entrega", () => {
    const r = resumirEnvios({ sends: [{ prospect_id: "a", message_id: "m1", enviado_em: null }] });

    expect(r.enviados).toBe(1);
    expect(r.entregues).toBe(0);
    expect(r.lidos).toBe(0);
    expect(r.falhas).toBe(0);
  });
});

describe("entregaDoStatus", () => {
  it.each([
    ["read", "lida"],
    ["delivered", "entregue"],
    ["failed", "falhou"],
    ["sent", "enviada"],
    ["queued", "enviada"],
    ["sending", "enviada"],
  ] as const)("%s → %s", (status, esperado) => {
    expect(entregaDoStatus(status)).toBe(esperado);
  });

  it("status que o produto não conhece devolve null em vez de inventar degrau", () => {
    expect(entregaDoStatus("deleted")).toBeNull();
    expect(entregaDoStatus(null)).toBeNull();
    expect(entregaDoStatus(undefined)).toBeNull();
  });
});
