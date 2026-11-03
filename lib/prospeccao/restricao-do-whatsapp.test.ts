import { describe, expect, it } from "vitest";

import { restricaoAtingeO, textoDaRestricao } from "./restricao-do-whatsapp";

describe("restricaoAtingeO", () => {
  it("atinge prospecção (conversa nova)", () => {
    expect(restricaoAtingeO("prospects")).toBe(true);
  });

  it("NÃO atinge recuperação — quem já conversa com a empresa continua recebendo", () => {
    expect(restricaoAtingeO("contatos")).toBe(false);
  });

  it("coluna nula é prospecção: o default do produto", () => {
    expect(restricaoAtingeO("")).toBe(true);
  });
});

describe("textoDaRestricao", () => {
  it("diz o prazo no fuso da organização e que a campanha volta sozinha", () => {
    const texto = textoDaRestricao(
      { tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: "2026-10-30T19:50:02.000Z" },
      "16:50",
    );
    expect(texto).toContain("até 16:50");
    expect(texto).toContain("volta sozinha");
    expect(texto).toContain("RESTRICT_ALL_COMPANIONS");
  });

  it("sem prazo, diz que não há prazo — em vez de inventar um", () => {
    const texto = textoDaRestricao({ tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: null }, null);
    expect(texto).toContain("sem prazo informado");
    expect(texto).not.toContain("até null");
  });
});
