import { describe, expect, it } from "vitest";

import { cidadeSemEstado, enderecoDaRua, enderecoEmLinha } from "./endereco-em-linha";

describe("enderecoEmLinha", () => {
  it("monta o endereço completo", () => {
    expect(
      enderecoEmLinha({
        logradouro: "Rua Antônio Liller",
        numero_end: "585",
        bairro: "Alto das Palmeiras",
        cidade: "Canoinhas",
        uf: "sc",
        cep: "89460-000",
      }),
    ).toBe("Rua Antônio Liller, 585 — Alto das Palmeiras, Canoinhas/SC, 89460-000");
  });

  it("rua sem número não deixa vírgula solta", () => {
    expect(enderecoEmLinha({ logradouro: "RUA JACOB RANK S/N", cidade: "Mafra", uf: "SC" })).toBe(
      "RUA JACOB RANK S/N — Mafra/SC",
    );
  });

  it("só cidade sai sozinha, sem traço nem vírgula", () => {
    expect(enderecoEmLinha({ cidade: "Irati", uf: "PR" })).toBe("Irati/PR");
  });

  it("complemento entra na primeira parte", () => {
    expect(
      enderecoEmLinha({ logradouro: "Av. X", numero_end: "10", complemento: "Sala 2", cidade: "Canoinhas", uf: "SC" }),
    ).toBe("Av. X, 10 — Sala 2 — Canoinhas/SC");
  });

  it("não duplica o número que já veio colado no logradouro (dado do WP)", () => {
    expect(
      enderecoEmLinha({
        logradouro: "RUA OROCIMBO CAETANO DA SILVA, 65",
        numero_end: "65",
        bairro: "VILA NOSSA SENHORA APARECIDA",
        cidade: "Curitibanos",
        uf: "SC",
        cep: "89520000",
      }),
    ).toBe("RUA OROCIMBO CAETANO DA SILVA, 65 — VILA NOSSA SENHORA APARECIDA, Curitibanos/SC, 89520000");
  });

  it("nada vira string vazia (o literal de ausência é da tela)", () => {
    expect(enderecoEmLinha(null)).toBe("");
    expect(enderecoEmLinha({})).toBe("");
    expect(enderecoEmLinha({ logradouro: "  " })).toBe("");
  });
});

describe("o NULL do export não chega à tela", () => {
  it("some da rua, do complemento e do bairro", () => {
    const linha = enderecoEmLinha({
      logradouro: "RUA BRASIL, 183, NULL",
      numero_end: "183",
      bairro: "NULL",
      cidade: "Mafra",
      uf: "SC",
      cep: "89300001",
    });
    expect(linha).not.toMatch(/NULL/i);
    expect(linha).toContain("RUA BRASIL");
    expect(linha).toContain("Mafra/SC");
  });

  it("não come número repetido nem vírgula solta", () => {
    const linha = enderecoEmLinha({ logradouro: "R JACOB SCHEUER, 132, NULL", numero_end: "132", cidade: "Canoinhas", uf: "SC" });
    expect(linha).toBe("R JACOB SCHEUER, 132 — Canoinhas/SC");
  });
});

describe("enderecoDaRua (o campo Endereço do impresso)", () => {
  it("imprime rua, número e complemento — sem bairro, cidade, UF nem CEP", () => {
    // Caso real do pedido 19513: o Mercos imprime "RUA MATOS COSTA 502 ********"
    // e o resto do endereço nos campos de baixo.
    expect(
      enderecoDaRua({
        logradouro: "RUA MATOS COSTA, 502, ********",
        numero_end: "502",
        bairro: "CENTRO",
        cidade: "Porto União, Santa Catarina",
        uf: "SC",
        cep: "89400000",
      }),
    ).toBe("RUA MATOS COSTA 502 ********");
  });

  it("não duplica o número quando ele já veio dentro do logradouro", () => {
    expect(enderecoDaRua({ logradouro: "RUA CHACKEL RUTHENBERG, 533, BRCAO", numero_end: "533" })).toBe(
      "RUA CHACKEL RUTHENBERG 533 BRCAO",
    );
  });

  it("acrescenta número e complemento quando o logradouro vem só com a rua", () => {
    expect(enderecoDaRua({ logradouro: "RUA LEUCLIDES VIANNA", numero_end: "217" })).toBe(
      "RUA LEUCLIDES VIANNA 217",
    );
    expect(
      enderecoDaRua({ logradouro: "Av. X", numero_end: "10", complemento: "Sala 2" }),
    ).toBe("Av. X 10 Sala 2");
  });

  it("vazio de verdade devolve string vazia", () => {
    expect(enderecoDaRua(null)).toBe("");
    expect(enderecoDaRua({})).toBe("");
    expect(enderecoDaRua({ logradouro: "  " })).toBe("");
  });
});

describe("cidadeSemEstado", () => {
  it("tira o estado que veio colado na cidade", () => {
    expect(cidadeSemEstado("Porto União, Santa Catarina", "SC")).toBe("Porto União");
    expect(cidadeSemEstado("SAO MATEUS DO SUL, Paraná", "PR")).toBe("SAO MATEUS DO SUL");
    expect(cidadeSemEstado("Canoinhas, SC", "SC")).toBe("Canoinhas");
  });

  it("não mexe em cidade sem estado nem em sufixo que não é o estado", () => {
    expect(cidadeSemEstado("Canoinhas", "SC")).toBe("Canoinhas");
    expect(cidadeSemEstado("Porto União, Centro", "SC")).toBe("Porto União, Centro");
  });

  it("sufixo de OUTRO estado fica (não inventa que é o mesmo)", () => {
    expect(cidadeSemEstado("Porto União, Paraná", "SC")).toBe("Porto União, Paraná");
  });
});
