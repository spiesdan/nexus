import { describe, expect, it } from "vitest";

import { chaveDoDia } from "./dia";

describe("chaveDoDia", () => {
  it("lê o dia no fuso pedido, não no fuso do runtime", () => {
    // 01:00Z de 19/10 ainda é 18/10 em São Paulo (UTC−3). Era exatamente este
    // pedido que caía em grupos diferentes no servidor (UTC) e no navegador.
    const instante = new Date("2026-10-19T01:00:00.000Z");
    expect(chaveDoDia(instante, "America/Sao_Paulo")).toBe("2026-10-18");
    expect(chaveDoDia(instante, "UTC")).toBe("2026-10-19");
  });

  it("devolve o dia civil de São Paulo quando o fuso não é informado", () => {
    expect(chaveDoDia(new Date("2026-10-19T01:00:00.000Z"))).toBe("2026-10-18");
  });

  it("degrada para o padrão com fuso inválido, em vez de lançar", () => {
    expect(chaveDoDia(new Date("2026-10-19T01:00:00.000Z"), "Marte/Olympus")).toBe("2026-10-18");
  });

  it("preenche mês e dia com zero à esquerda", () => {
    // A chave é comparada como string e ordenada lexicograficamente: `2026-1-5`
    // quebraria as duas coisas.
    expect(chaveDoDia(new Date("2026-01-05T15:00:00.000Z"))).toBe("2026-01-05");
  });

  it("não muda com o fuso do processo", () => {
    const instante = new Date("2026-10-19T02:30:00.000Z");
    const antes = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const emUtc = chaveDoDia(instante, "America/Sao_Paulo");
      process.env.TZ = "Asia/Tokyo";
      const emToquio = chaveDoDia(instante, "America/Sao_Paulo");
      expect(emUtc).toBe(emToquio);
      expect(emUtc).toBe("2026-10-18");
    } finally {
      if (antes === undefined) delete process.env.TZ;
      else process.env.TZ = antes;
    }
  });
});
