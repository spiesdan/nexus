/**
 * O SELETOR DE CIDADE NÃO PODE TER DUPLICATA NEM OPÇÃO VAZIA.
 *
 * `contacts.cidade` é texto livre desde sempre. Numa base real a mesma cidade
 * aparece como "São Paulo", "são paulo" e " São Paulo " — um `distinct` cru
 * ofereceria três opções para a mesma escolha, e a terceira filtraria por uma
 * string que o usuário não reconhece.
 *
 * As propriedades travadas aqui:
 *  1. chave de deduplicação = `lower(trim())` e espaços internos colapsados;
 *  2. o texto exibido é o da PRIMEIRA ocorrência (o banco entrega ordenado);
 *  3. vazio, só-espaços e null não viram opção;
 *  4. ordem alfabética pt-BR, com acento no lugar certo ("Água" antes de "Ave");
 *  5. acento NÃO é ignorado na comparação de valor: "sao paulo" não é
 *     "São Paulo" — o filtro é case-insensitive, não accent-insensitive.
 */
import { describe, expect, it } from "vitest";

import { cidadesUnicas } from "@/lib/contacts/cidades";

describe("cidadesUnicas", () => {
  it("deduplica por caixa e espaço, mantendo o casing da primeira ocorrência", () => {
    expect(
      cidadesUnicas([
        { cidade: "São Paulo" },
        { cidade: "são paulo" },
        { cidade: "  SÃO   PAULO  " },
        { cidade: "Rio de Janeiro" },
      ]),
    ).toEqual(["Rio de Janeiro", "São Paulo"]);
  });

  it("não inventa cidade a partir de vazio, espaço ou null", () => {
    expect(cidadesUnicas([{ cidade: null }, { cidade: "" }, { cidade: "   " }])).toEqual([]);
    expect(cidadesUnicas([])).toEqual([]);
  });

  it("ordena em pt-BR: acento não joga a palavra para depois do Z", () => {
    expect(
      cidadesUnicas([
        { cidade: "Zé Doca" },
        { cidade: "Ave" },
        { cidade: "Água Branca" },
        { cidade: "Salvador" },
        { cidade: "São Paulo" },
      ]),
    ).toEqual(["Água Branca", "Ave", "Salvador", "São Paulo", "Zé Doca"]);
  });

  it("acento ainda separa cidades diferentes (só a caixa é ignorada)", () => {
    // "sao paulo" e "São Paulo" são grafias da mesma cidade na cabeça de quem
    // lê — mas um filtro accent-insensitive não está no escopo desta fatia, e
    // fingir que estão iguais juntaria "Açaí" com "Acai" no mesmo balde.
    expect(cidadesUnicas([{ cidade: "Sao Paulo" }, { cidade: "São Paulo" }])).toEqual([
      "Sao Paulo",
      "São Paulo",
    ]);
  });
});
