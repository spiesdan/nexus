import { describe, expect, it } from "vitest";

import { primeiraMensagemDeCampo } from "./mensagem-de-validacao";

const ROTULOS = { display_name: "Nome de exibição", cnpj: "CNPJ" };

describe("primeiraMensagemDeCampo", () => {
  it("mostra o campo e a mensagem, não 'Dados inválidos'", () => {
    const msg = primeiraMensagemDeCampo(
      { fieldErrors: { display_name: ["Informe ao menos 2 caracteres."] } },
      ROTULOS,
      "Dados inválidos.",
    );
    expect(msg).toBe("Nome de exibição: Informe ao menos 2 caracteres.");
  });

  it("usa o nome do campo quando não há rótulo e pula erro vazio", () => {
    const msg = primeiraMensagemDeCampo(
      { fieldErrors: { cnpj: ["", "CNPJ inválido."], outro: ["x"] } },
      ROTULOS,
      "Dados inválidos.",
    );
    expect(msg).toBe("CNPJ: CNPJ inválido.");
  });

  it("cai no erro geral e, sem nada, no padrão", () => {
    expect(
      primeiraMensagemDeCampo({ formErrors: ["A empresa precisa de um nome."] }, ROTULOS, "x"),
    ).toBe("A empresa precisa de um nome.");
    expect(primeiraMensagemDeCampo(null, ROTULOS, "Dados inválidos.")).toBe("Dados inválidos.");
    expect(primeiraMensagemDeCampo({ fieldErrors: {} }, ROTULOS, "Dados inválidos.")).toBe(
      "Dados inválidos.",
    );
  });
});
