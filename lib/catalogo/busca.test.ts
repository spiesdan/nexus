/**
 * Vocabulário do balcão: apelido vira nome de catálogo na tokenização, então
 * o produto certo pontua em primeiro e o "quis dizer" fantasma nem nasce.
 * Decretado pelo dono em 2026-10-15 ("solupa sempre é solubill, intercap
 * sempre é billcap").
 */
import { describe, expect, it } from "vitest";

import {
  buscarComRelaxamento,
  pontuar,
  tokenizar,
  type ProdutoBuscavel,
} from "@/lib/catalogo/busca";

const SOLUBILL: ProdutoBuscavel[] = [
  { nome: "SOLUBILL 2L", codigo: "385" },
  { nome: "SOLUBILL 5L", codigo: "386" },
  { nome: "SOLUBILL 20L", codigo: "384" },
  { nome: "SOL DA GIRANDO LIMPEZA 500ML", codigo: "900" },
];

describe("sinonimos de balcao", () => {
  it("solupa tokeniza como solubill", () => {
    expect(tokenizar("solupa")).toEqual({ palavras: ["solubill"], numeros: [], codigos: [] });
  });

  it("intercap tokeniza como billcap", () => {
    expect(tokenizar("intercap")).toEqual({ palavras: ["billcap"], numeros: [], codigos: [] });
  });

  it("solupa pontua SOLUBILL acima de girando sol", () => {
    const tokens = tokenizar("solupa");
    const notas = SOLUBILL.map((p) => ({ nome: p.nome, nota: pontuar(p, tokens) }));
    const top = [...notas].sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1))[0];
    expect(top?.nome).toMatch(/SOLUBILL/);
    expect(top?.nota).not.toBeNull();
  });

  it("busca completa por solupa traz solubill em primeiro", () => {
    const r = buscarComRelaxamento(SOLUBILL, "tem solupa?");
    expect(r.achados.length).toBeGreaterThan(0);
    expect(r.achados[0]?.produto.nome).toMatch(/SOLUBILL/);
  });
});

/**
 * CÓDIGO É IDENTIDADE, NÃO ATRIBUTO.
 *
 * Medido na instalação em 2026-10-24: o vendedor pediu "3 codigo 3" (três
 * unidades do código 3) e a tela propôs "LIXEIRA CLICK 3L POLIPROPILENO -
 * VERMELHA COD. 3513" com confiança ALTA. "codigo" casava o "COD." do nome do
 * produto por prefixo e o "3" casava o "3L" pela regra de unidade — o código
 * do catálogo, que era a informação exata da frase, não era consultado.
 */
describe("codigo do catalogo", () => {
  const CATALOGO: ProdutoBuscavel[] = [
    { nome: "ALCOOL EM GEL 70% 430 ML COM PUMP-UP", codigo: "3" },
    { nome: "LIXEIRA CLICK 3L POLIPROPILENO - VERMELHA COD. 3513", codigo: "3513" },
    { nome: "LIXEIRA C/PEDAL E TAMPA BRANCA 15L REF. 3588", codigo: "185" },
  ];

  it("a marca de codigo nao vira palavra de busca", () => {
    expect(tokenizar("3 codigo 3")).toEqual({ palavras: [], numeros: ["3"], codigos: ["3"] });
    expect(tokenizar("cod. 3513")).toEqual({ palavras: [], numeros: [], codigos: ["3513"] });
    expect(tokenizar("ref 3588")).toEqual({ palavras: [], numeros: [], codigos: ["3588"] });
  });

  it("codigo 3 acha o produto de codigo 3, e nao a lixeira de 3 litros", () => {
    const r = buscarComRelaxamento(CATALOGO, "codigo 3");
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]?.produto.nome).toBe("ALCOOL EM GEL 70% 430 ML COM PUMP-UP");
    expect(r.achados[0]?.nota).toBe(1);
    expect(r.achados[0]?.relacao).toBe("direta");
  });

  it("quantidade antes do codigo nao elimina o produto pedido", () => {
    const r = buscarComRelaxamento(CATALOGO, "3 codigo 3");
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]?.produto.codigo).toBe("3");
  });

  it("cod. e ref tambem consultam o campo codigo", () => {
    expect(buscarComRelaxamento(CATALOGO, "cod. 3513").achados[0]?.produto.codigo).toBe("3513");
    expect(buscarComRelaxamento(CATALOGO, "ref 3588").achados[0]?.produto.codigo).toBe("185");
  });

  it("codigo inexistente nao relaxa para um parecido", () => {
    expect(buscarComRelaxamento(CATALOGO, "codigo 999").achados).toEqual([]);
  });

  it("a palavra codigo sozinha nao elege quem tem COD. no nome", () => {
    expect(buscarComRelaxamento(CATALOGO, "codigo").achados).toEqual([]);
  });

  it("zero a esquerda no cadastro nao esconde o produto", () => {
    const comZero = [{ nome: "ALCOOL EM GEL 70%", codigo: "003" }];
    expect(buscarComRelaxamento(comZero, "codigo 3").achados).toHaveLength(1);
  });
});

/**
 * O CÓDIGO NÃO É ATRIBUTO.
 *
 * O número que filtra tamanho ("5L") tem de ser procurado no NOME. Enquanto o
 * campo `codigo` entrava no mesmo texto, um produto de código "5" satisfazia o
 * "5" de "água sanitária 5L" mesmo sendo de 2 litros — e o filtro numérico, que
 * existe para impedir essa troca, deixava passar.
 */
describe("codigo nao serve como atributo", () => {
  const CATALOGO: ProdutoBuscavel[] = [
    { nome: "AGUA SANITARIA 2 L", codigo: "5" },
    { nome: "AGUA SANITARIA 5 L", codigo: "9" },
  ];

  it("o tamanho e procurado no nome, nao no codigo", () => {
    const r = buscarComRelaxamento(CATALOGO, "agua sanitaria 5L");
    expect(r.achados.map((a) => a.produto.codigo)).toEqual(["9"]);
  });

  it("codigo digitado sozinho continua achando o produto", () => {
    // "5" sozinho é ambíguo de propósito: pode ser o código 5 ou o tamanho 5 L.
    // Os dois aparecem — quem escolhe é a pessoa, não a busca.
    const r = buscarComRelaxamento(CATALOGO, "5");
    expect(r.achados.map((a) => a.produto.nome)).toContain("AGUA SANITARIA 2 L");
  });
});
