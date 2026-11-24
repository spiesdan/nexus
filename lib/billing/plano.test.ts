import { describe, expect, it } from "vitest";

import { planoEfetivo, type PlanoNoBanco } from "./plano";

const plano: PlanoNoBanco = {
  nome: "Nexus",
  descricao: "Servidor, hospedagem, domínio e inteligência artificial",
  valor_cents: 169900,
  moeda: "BRL",
  intervalo: "mensal",
  stripe_price_id: null,
};

describe("plano lido do banco, não de constante", () => {
  it("sem plano, nada é inventado", () => {
    const r = planoEfetivo(null);
    expect(r.configurado).toBe(false);
    expect(r.valor_cents).toBeNull();
    expect(r.fonte).toBe("nenhum");
  });

  it("sem Price, o banco manda", () => {
    const r = planoEfetivo(plano);
    expect(r).toMatchObject({
      valor_cents: 169900, moeda: "BRL", descricao: plano.descricao, fonte: "banco",
    });
  });

  it("com Price, o Stripe manda valor e descrição", () => {
    const r = planoEfetivo(
      { ...plano, stripe_price_id: "price_123" },
      { unit_amount: 199900, currency: "brl", description: "Plato anual", nickname: null, recurring: { interval: "month" } },
    );
    expect(r).toMatchObject({ valor_cents: 199900, moeda: "BRL", descricao: "Plato anual", fonte: "stripe" });
  });
});
