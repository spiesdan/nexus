import { describe, expect, it } from "vitest";

import { etapasPendentes } from "./notices";

const vencimento = new Date("2026-12-10T12:00:00.000Z");

describe("avisos D-3/D-2/D-1", () => {
  it("três dias antes dispara só D-3", () => {
    expect(etapasPendentes(vencimento, new Date("2026-12-07T08:00:00Z"), new Set())).toEqual([3]);
  });

  it("dois e um dia antes disparam a etapa exata", () => {
    expect(etapasPendentes(vencimento, new Date("2026-12-08T08:00:00Z"), new Set())).toEqual([2]);
    expect(etapasPendentes(vencimento, new Date("2026-12-09T08:00:00Z"), new Set())).toEqual([1]);
  });

  it("cobrança criada com menos de 3 dias NÃO dispara retroativo em sequência", () => {
    const hoje = new Date("2026-12-09T23:00:00Z");
    expect(etapasPendentes(vencimento, hoje, new Set())).toEqual([1]);
  });

  it("worker repetido não reenvia etapa já enviada", () => {
    expect(etapasPendentes(vencimento, new Date("2026-12-07T08:00:00Z"), new Set([3]))).toEqual([]);
  });

  it("após o vencimento nada é enviado (a suspensão é o próximo passo)", () => {
    expect(etapasPendentes(vencimento, new Date("2026-12-12T08:00:00Z"), new Set())).toEqual([]);
  });
});
