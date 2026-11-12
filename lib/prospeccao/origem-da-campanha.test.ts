/**
 * CAMPANHA POR REGIÃO ≠ PROSPECÇÃO — o que este teste prende.
 *
 * A aba Campanha é de "quem já comprou nesta cidade". A tabela é a mesma da
 * prospecção, então a distinção tem de ser explícita:
 *   - prospecção (`publico: "prospects"`) NUNCA entra, mesmo com `cidades`
 *     preenchidas — lá `cidades` é onde procurar empresa;
 *   - recuperação (`publico: "contatos"` sem `cidades`) não entra — é conversa
 *     parada, não recorte geográfico;
 *   - região (`publico: "contatos"` com `cidades`) entra.
 */
import { describe, expect, it } from "vitest";

import { ehCampanhaPorRegiao } from "./origem-da-campanha";

describe("ehCampanhaPorRegiao", () => {
  it("contatos + cidades = campanha por região", () => {
    expect(
      ehCampanhaPorRegiao({
        publico: "contatos",
        cidades: [{ cidade: "Canoinhas", estado: "SC" }],
      }),
    ).toBe(true);
  });

  it("prospecção não entra, mesmo com cidades preenchidas", () => {
    // É o caso real das duas campanhas de 09 e 10/11: `publico: "prospects"`,
    // oito cidades no recorte e 241/251 empresas garimpadas.
    expect(
      ehCampanhaPorRegiao({
        publico: "prospects",
        cidades: Array.from({ length: 8 }, (_, i) => ({ cidade: `Cidade ${i}` })),
      }),
    ).toBe(false);
  });

  it("recuperação não entra: contatos sem recorte geográfico", () => {
    expect(ehCampanhaPorRegiao({ publico: "contatos", cidades: [] })).toBe(false);
    expect(ehCampanhaPorRegiao({ publico: "contatos" })).toBe(false);
  });

  it("cidades em formato antigo (lista de strings) também classifica", () => {
    expect(ehCampanhaPorRegiao({ publico: "contatos", cidades: ["Canoinhas/SC"] })).toBe(true);
  });

  it("sem `publico` ou com valor desconhecido, não é região", () => {
    expect(ehCampanhaPorRegiao({ cidades: [{ cidade: "Canoinhas" }] })).toBe(false);
    expect(ehCampanhaPorRegiao({ publico: null, cidades: ["Canoinhas"] })).toBe(false);
    expect(ehCampanhaPorRegiao({ publico: "outro", cidades: ["Canoinhas"] })).toBe(false);
  });
});
