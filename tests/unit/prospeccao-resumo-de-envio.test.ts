import { describe, expect, it } from "vitest";

import { resumirEnvios, type EnvioDaCampanha } from "@/lib/prospeccao/resumo-de-envio";

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
