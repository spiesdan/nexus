import { describe, expect, it } from "vitest";

import {
  entregaDoStatus,
  resumirEnvios,
  type EnvioDaCampanha,
} from "@/lib/prospeccao/resumo-de-envio";

/**
 * A conta que a tela de controle mostra.
 *
 * O defeito medido em 30/10/2026 não era de arredondamento: a campanha exibia
 * "90 enviadas" com 22 confirmações do WhatsApp. As outras 68 tinham apenas o
 * aceite do transporte (`message_id`), gravado antes do desfecho real — e 37
 * delas foram recusadas com o erro 463. A régua aqui separa os quatro degraus
 * do ledger porque só um deles significa "chegou ao celular do cliente".
 */

function envio(
  prospect_id: string,
  message_id: string | null,
  extras: Partial<EnvioDaCampanha> = {},
): EnvioDaCampanha {
  return { prospect_id, message_id, enviado_em: null, ...extras };
}

describe("resumirEnvios", () => {
  it("aceite do transporte não vira 'enviada'", () => {
    const r = resumirEnvios({
      prospectIds: ["a", "b", "c"],
      sends: [
        envio("a", "msg-1", { enviado_em: "2026-10-22T12:00:00.000Z" }),
        envio("b", null),
      ],
    });

    expect(r.total).toBe(3);
    // A linha de "a" foi aceita (tem comprovante) mas ninguém confirmou.
    expect(r.aceitas).toBe(1);
    expect(r.enviados).toBe(0);
    // "a" (aceita sem ack) e "b" (reserva) estão as duas sem confirmação.
    expect(r.sem_confirmacao).toBe(2);
    // "b" é reserva sem comprovante; "c" ainda nem foi reservado.
    expect(r.sem_comprovante).toBe(1);
    expect(r.pendentes).toBe(1);
    expect(r.percentual).toBe(0);
    // O "último envio" é o último CONFIRMADO — nada confirmado, nada a exibir.
    expect(r.ultimo_envio_at).toBeNull();
  });

  it("conta como enviada só o que o WhatsApp confirmou (ack ≥ 1)", () => {
    const r = resumirEnvios({
      sends: [
        envio("a", "m1", { status: "sent", ack: 1 }),
        envio("b", "m2", { status: "delivered", ack: 2 }),
        envio("c", "m3", { status: "read", ack: 3 }),
        envio("d", "m4", { status: "sent", ack: 0 }),
        envio("e", "m5", { status: "sending", ack: 0 }),
        envio("f", "m6", { status: "failed", ack: -1 }),
      ],
    });

    expect(r.total).toBe(6);
    expect(r.aceitas).toBe(6);
    expect(r.enviados).toBe(3);
    expect(r.entregues).toBe(2); // delivered + read
    expect(r.lidos).toBe(1);
    expect(r.falhas).toBe(1);
    expect(r.sem_confirmacao).toBe(2); // ack 0 dos dois
    expect(r.percentual).toBe(50);
  });

  it("o ack manda mais que o status: sent com ack negativo é falha (o 463)", () => {
    const r = resumirEnvios({
      sends: [envio("a", "m1", { status: "sent", ack: -1 })],
    });

    expect(r.enviados).toBe(0);
    expect(r.falhas).toBe(1);
    expect(r.sem_confirmacao).toBe(0);
  });

  it("campanha inteira confirmada fecha em 100%", () => {
    const r = resumirEnvios({
      prospectIds: ["a", "b"],
      sends: [
        envio("a", "m1", { status: "delivered", ack: 2, enviado_em: "2026-10-22T12:00:00.000Z" }),
        envio("b", "m2", { status: "read", ack: 3, enviado_em: "2026-10-22T12:01:00.000Z" }),
      ],
    });

    expect(r.enviados).toBe(2);
    expect(r.pendentes).toBe(0);
    expect(r.sem_confirmacao).toBe(0);
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
      sends: [
        envio("a", "msg-1", { status: "delivered", ack: 2 }),
        envio("a", "msg-1", { status: "delivered", ack: 2 }),
        envio("b", null),
      ],
    });

    expect(r.total).toBe(2);
    expect(r.aceitas).toBe(1);
    expect(r.enviados).toBe(1);
    expect(r.sem_confirmacao).toBe(1);
    expect(r.pendentes).toBe(0);
  });

  it("campanha vazia não divide por zero nem inventa 100%", () => {
    const r = resumirEnvios({ prospectIds: [], sends: [] });

    expect(r.total).toBe(0);
    expect(r.enviados).toBe(0);
    expect(r.pendentes).toBe(0);
    expect(r.percentual).toBe(0);
    expect(r.ultimo_envio_at).toBeNull();
  });

  it("as contas fecham: ninguém fica sem degrau", () => {
    const r = resumirEnvios({
      prospectIds: ["a", "b", "c", "d", "e"],
      sends: [
        envio("a", "m1", { status: "read", ack: 3 }),
        envio("b", "m2", { status: "sent", ack: 0 }),
        envio("c", "m3", { status: "failed", ack: -1 }),
        envio("d", null),
      ],
    });

    // Toda empresa da lista está num e só num degrau do trabalho...
    expect(r.total).toBe(r.pendentes + r.aceitas + r.sem_comprovante);
    // ...e "sem confirmação" junta aceita-sem-ack e reserva sem comprovante.
    expect(r.total).toBe(r.pendentes + r.enviados + r.sem_confirmacao + r.falhas);
  });

  /**
   * Medido em 10/11/2026: 113 mensagens recusadas com `131042` (pagamento
   * pendente na Meta) ficaram presas no ledger depois que a fatura foi paga.
   * O total de recusas sozinho não dizia quais ainda podiam sair; a tela agora
   * separa as retentáveis das definitivas.
   */
  it("separa a recusa por pagamento das recusas definitivas", () => {
    const r = resumirEnvios({
      prospectIds: ["a", "b", "c", "d"],
      sends: [
        envio("a", "m1", { status: "failed", ack: 0, error_code: "131042" }),
        envio("b", "m2", { status: "failed", ack: 0, error_code: "131042" }),
        envio("c", "m3", { status: "failed", ack: 0, error_code: "131026" }),
        envio("d", "m4", { status: "delivered", ack: 2 }),
      ],
    });

    // Pagamento é SUBCONJUNTO das recusas: continua contando em `falhas`.
    expect(r.falhas).toBe(3);
    expect(r.falhas_de_pagamento).toBe(2);
    // 1 confirmada de 4 — e as 3 recusadas não entram em "pendentes".
    expect(r.enviados).toBe(1);
    expect(r.pendentes).toBe(0);
    expect(r.percentual).toBe(25);
  });

  it("sem código (ou com código novo da Meta) não vira reenvio por pagamento", () => {
    const r = resumirEnvios({
      sends: [
        envio("a", "m1", { status: "failed", ack: 0 }),
        envio("b", "m2", { status: "failed", ack: 0, error_code: "131999" }),
        // Recusa antiga, mas o status atual é `sent`: o desfecho atual manda.
        envio("c", "m3", { status: "sent", ack: 0, error_code: "131042" }),
      ],
    });

    expect(r.falhas).toBe(2);
    expect(r.falhas_de_pagamento).toBe(0);
  });
});

describe("entregaDoStatus", () => {
  it.each([
    ["read", 3, "lida"],
    ["delivered", 2, "entregue"],
    ["sent", 1, "enviada"],
    ["sent", 0, "pendente"],
    ["sending", 0, "pendente"],
    ["queued", null, "pendente"],
    ["failed", -1, "falhou"],
    ["sent", -1, "falhou"],
  ] as const)("%s com ack %s → %s", (status, ack, esperado) => {
    expect(entregaDoStatus(status, ack)).toBe(esperado);
  });

  it("o ack sozinho já dá o degrau quando o status local está atrasado", () => {
    expect(entregaDoStatus("sent", 2)).toBe("entregue");
    expect(entregaDoStatus("sent", 3)).toBe("lida");
  });

  it("status que o produto não conhece devolve null em vez de inventar degrau", () => {
    expect(entregaDoStatus("deleted")).toBeNull();
    expect(entregaDoStatus(null)).toBeNull();
    expect(entregaDoStatus(undefined)).toBeNull();
  });
});
