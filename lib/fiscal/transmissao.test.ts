import { describe, expect, it } from "vitest";

import { desfechoDaInutilizacao } from "./transmissao";

/**
 * O DESFECHO DE UMA INUTILIZAÇÃO.
 *
 * Medido em 05/11/2026, nas três primeiras inutilizações reais desta
 * instalação: a SEFAZ homologou (cStat 102) e o sidecar só conhecia 1002 — a
 * tela mostrava "Erro" para número inutilizado de verdade. O reenvio devolveu
 * 563 ("já existe pedido"), que é a prova da homologação e também precisa
 * encerrar o caso.
 */

describe("desfechoDaInutilizacao", () => {
  it("102 homologado vira transmitida, com protocolo", () => {
    expect(
      desfechoDaInutilizacao(
        { ok: true, cstat: "102", protocolo: "142260000000001" },
        null,
      ),
    ).toEqual({
      status: "transmitida",
      protocolo: "142260000000001",
      sucesso: true,
      xmotivo: null,
    });
  });

  it("563 (já existe pedido) também encerra: a faixa está homologada", () => {
    const d = desfechoDaInutilizacao(
      { ok: false, cstat: "563", protocolo: null },
      "Rejeicao: Ja existe pedido de Inutilizacao com a mesma faixa de inutilizacao",
    );
    expect(d.status).toBe("transmitida");
    expect(d.sucesso).toBe(true);
    expect(d.xmotivo).toContain("563");
    expect(d.xmotivo).toContain("já homologada");
  });

  it("recusa de verdade continua erro, com o motivo da SEFAZ", () => {
    const d = desfechoDaInutilizacao(
      { ok: false, cstat: "241", protocolo: null },
      "Um número de NF-e já foi utilizado",
    );
    expect(d.status).toBe("erro");
    expect(d.sucesso).toBe(false);
    expect(d.xmotivo).toContain("241");
  });

  it("sem cStat (sidecar fora do ar) não vira sucesso", () => {
    const d = desfechoDaInutilizacao(
      { ok: false, cstat: null, protocolo: null },
      "Sidecar respondeu fora do contrato (não-JSON).",
    );
    expect(d.status).toBe("erro");
    expect(d.sucesso).toBe(false);
  });
});
