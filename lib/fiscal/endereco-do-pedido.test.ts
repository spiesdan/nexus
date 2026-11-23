import { describe, expect, it } from "vitest";

import { enderecoDoPedido } from "./endereco-do-pedido";

describe("enderecoDoPedido — formatos reais do Mercos", () => {
  it("FAZ BATATAIS: S/N é número, bairro vem depois do travessão", () => {
    expect(
      enderecoDoPedido("FAZ BATATAIS, S/N — BELA VISTA DO SUL, MAFRA/SC, 89300001"),
    ).toEqual({
      logradouro: "FAZ BATATAIS",
      numero: "S/N",
      bairro: "BELA VISTA DO SUL",
      cidade: "MAFRA",
      uf: "SC",
      cep: "89300001",
    });
  });

  it("BR-280 tem vírgulas internas: meio vira complemento, não número", () => {
    expect(
      enderecoDoPedido(
        "BR-280, 1421, DE 1180 A 1998 LADO PAR, 1421 — CAMPO DA ÁGUA VERDE, Canoinhas/SC, 89466218",
      ),
    ).toEqual({
      logradouro: "BR-280",
      numero: "1421",
      complemento: "DE 1180 A 1998 LADO PAR",
      bairro: "CAMPO DA ÁGUA VERDE",
      cidade: "Canoinhas",
      uf: "SC",
      cep: "89466218",
    });
  });
});

describe("enderecoDoPedido — conservador", () => {
  it.each([
    null,
    "",
    "FAZ BATATAIS, S/N, MAFRA/SC, 89300001", // sem travessão
    "FAZ BATATAIS, S/N — BELA VISTA, MAFRA, 89300001", // sem UF
    "FAZ BATATAIS, S/N — BELA VISTA, MAFRA/SC, 8930", // CEP curto
    "FAZ BATATAIS, SEM NUMERO — BELA VISTA, MAFRA/SC, 89300001", // número não é número
    "FAZ BATATAIS — BELA VISTA, MAFRA/SC, 89300001", // sem como separar rua/número
  ])("texto ambíguo %s devolve null", (texto) => {
    expect(enderecoDoPedido(texto)).toBeNull();
  });
});
