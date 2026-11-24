import { describe, expect, it } from "vitest";

import { isoDoPeriodo, periodoDaAssinatura, vencimentoEfetivo } from "./periodo-assinatura";

describe("vencimento da assinatura em qualquer versão da API do Stripe", () => {
  it("campo só no item: lê 16/12/2026 e diz que veio do item", () => {
    const fimSegundos = Math.floor(Date.UTC(2026, 11, 16) / 1000);
    const inicioSegundos = Math.floor(Date.UTC(2026, 10, 16) / 1000);
    const p = periodoDaAssinatura({
      id: "sub_1", status: "active",
      items: { data: [{ current_period_start: inicioSegundos, current_period_end: fimSegundos }] },
    } as never);
    expect(p.origem).toBe("item");
    expect(isoDoPeriodo(p.fim)).toBe("2026-12-16T00:00:00.000Z");
    expect(p.inicio).toBe(inicioSegundos);
  });

  it("campo no topo continua valendo", () => {
    const p = periodoDaAssinatura({ current_period_end: Math.floor(Date.UTC(2026, 11, 16) / 1000) } as never);
    expect(p.origem).toBe("topo");
  });

  it("ausente em todo lugar devolve null e origem ausente", () => {
    const p = periodoDaAssinatura({ status: "active", items: { data: [{}] } } as never);
    expect(p).toMatchObject({ fim: null, inicio: null, origem: "ausente" });
    expect(isoDoPeriodo(p.fim)).toBeNull();
  });

  it("sem campo em nenhum lugar, o vencimento LOCAL é preservado", () => {
    const local = "2026-12-16T00:00:00.000Z";
    const p = periodoDaAssinatura({ status: "active" } as never);
    expect(vencimentoEfetivo(isoDoPeriodo(p.fim), local)).toBe(local);
    expect(vencimentoEfetivo("2027-01-16T00:00:00.000Z", local)).toBe("2027-01-16T00:00:00.000Z");
  });
});
