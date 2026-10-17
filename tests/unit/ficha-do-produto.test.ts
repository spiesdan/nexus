/**
 * FICHA DO PRODUTO — o estudo determinístico sobre o catálogo.
 *
 * Os nomes aqui são REAIS, medidos no catálogo da org em 2026-10-16 (1137
 * produtos ativos, 1137 sem descrição cadastrada). A fixture prova a função;
 * nome verdadeiro prova o produto: é o "PÁ COM COLETOR + VASSOURA" que voltou
 * como resposta para quem pediu vassoura, e o "CABO DE VASSOURA AVULSO" que
 * voltou antes dele.
 */
import { describe, expect, it } from "vitest";

import {
  componentesEntreParenteses,
  descricaoParaGravar,
  fichaDoProduto,
  medidaDoNome,
  partesDoConjunto,
  quantidadeDeEmbalagem,
} from "@/lib/catalogo/ficha-do-produto";

describe("medidaDoNome", () => {
  it.each([
    ["AGUA SANITARIA 2L", "2 L"],
    ["ALCOOL EM GEL 5l", "5 L"],
    ["ALCOOL 80 GEL ACEN.10KG BALDE", "10 KG"],
    ["ALCOOL PERF FLOR SILVESTRE 500ML", "500 ML"],
    ["BALDE 13,5LREFORÇADO", "13.5 L"],
    ["CABO EXTENSOR 4,50 MT REF 066", "4.50 M"],
    ["CABO DE VASSOURA AVULSO", null],
    ["VASSOURA", null],
  ])("%s → %s", (nome, esperado) => {
    expect(medidaDoNome(nome)).toBe(esperado);
  });

  it("número colado em letra é de código, não é medida", () => {
    // "500M0L" é erro de digitação na origem do catálogo; sem esta guarda ele
    // virava "Medida: 0 L" — que é afirmar medida zero ao cliente.
    expect(medidaDoNome("DISPENSER MINI 500M0L BRANCO")).toBeNull();
    expect(medidaDoNome("SUPORTE KD8040")).toBeNull();
  });

  it("multiplicador: 2X5L são duas caixas de cinco", () => {
    expect(medidaDoNome("SABONETE 2X5L")).toBe("2 x 5 L");
    expect(medidaDoNome("PANO 5X10 UN")).toBe("5 x 10 UN");
  });

  it("concentração vem separada da medida — 46% não é 46 L", () => {
    expect(medidaDoNome("ALCOOL 46% 1L")).toBe("1 L");
    expect(fichaDoProduto({ nome: "ALCOOL 46% 1L" }).concentracao).toBe("46%");
    expect(fichaDoProduto({ nome: "AGUA SANITARIA 2L" }).concentracao).toBeNull();
  });
});

describe("partesDoConjunto — o + é do conjunto, o + do código não é", () => {
  it("' + ' com espaço dos dois lados declara conjunto", () => {
    expect(partesDoConjunto("PÁ COM COLETOR + VASSOURA")).toEqual(["PÁ COM COLETOR", "VASSOURA"]);
    expect(partesDoConjunto("SUPORTE + PANO MULTIUSO 300 MT")).toEqual([
      "SUPORTE",
      "PANO MULTIUSO 300 MT",
    ]);
  });

  it("'C/AP+01' é CÓDIGO: dizer que o gel são dois produtos seria mentira", () => {
    expect(partesDoConjunto("GEL ADES C/AP+01 REF GOTA LIMPA FRESH 41G")).toEqual([]);
    expect(fichaDoProduto({ nome: "GEL ADES C/AP+01 REF GOTA LIMPA FRESH 41G" }).tipo).toBe("simples");
  });

  it("⭐ ' com ' NÃO é conjunto: produto que vem com peça é UM produto", () => {
    // O erro espelhado: dizer que uma coisa só são duas.
    expect(partesDoConjunto("VASSOURA DE PELO COM CABO DE MADEIRA")).toEqual([]);
    expect(fichaDoProduto({ nome: "VASSOURA DE PELO COM CABO DE MADEIRA" }).tipo).toBe("simples");
  });

  it("barra e vírgula nunca declaram conjunto (faixa de medida e decimal)", () => {
    expect(partesDoConjunto("DISPENSER DE COPO 180/200ML PRETO")).toEqual([]);
    expect(partesDoConjunto("CESTO INOX C/ARO 15L REF. 3533")).toEqual([]);
    expect(fichaDoProduto({ nome: "DISPENSER DE COPO 180/200ML PRETO" }).tipo).toBe("simples");
  });

  it("nome que começa por KIT/CONJUNTO declara conjunto mesmo sem '+'", () => {
    expect(partesDoConjunto("KIT DE RALO INOX P/ PIA")).toEqual(["DE RALO INOX P/ PIA"]);
    expect(fichaDoProduto({ nome: "KIT DE RALO INOX P/ PIA" }).tipo).toBe("kit");
  });
});

describe("quantidadeDeEmbalagem — C/100 é caixa fechada, não kit", () => {
  it.each([
    ["COPO DESCARTÁVEL 300 ML C/100", 100],
    ["CAIXA DE GUARDANAPO 22X23 96 PC C/ 50 UN.", 50],
    ["BOBINA FUNDO RETO 40X60 - FD C/ 8 ROLOS", 8],
    ["COLCHETE TRADER PRESSAO 1 CART/3DZ", null],
    ["AGUA SANITARIA 2L", null],
  ])("%s → %s", (nome, esperado) => {
    expect(quantidadeDeEmbalagem(nome)).toBe(esperado);
  });
});

describe("componentesEntreParenteses — a lista do conjunto", () => {
  it("tira código de referência e medida, fica com as peças", () => {
    expect(
      componentesEntreParenteses(
        "Conjunto super mop po 40cm. microfibra (cabo alum.telescopico 1,40m./sup./refil, KD-8040) - Nobre",
      ),
    ).toEqual(["cabo alum telescopico", "sup", "refil"]);
  });

  it("sem parênteses, nada é inventado", () => {
    expect(componentesEntreParenteses("PÁ COM COLETOR + VASSOURA")).toEqual([]);
  });
});

describe("fichaDoProduto — o caso que motivou tudo", () => {
  it("⭐ combo é KIT com os itens, nunca vassoura", () => {
    const f = fichaDoProduto({ nome: "PÁ COM COLETOR + VASSOURA" });
    expect(f.tipo).toBe("kit");
    expect(f.itens).toEqual(["pa", "vassoura"]);
    expect(f.descricao).toContain("KIT com 2 itens: pa + vassoura");
  });

  it("⭐ o outro combo real do catálogo também", () => {
    const f = fichaDoProduto({ nome: "PÁ ROBUSTINHA + VASSOURA" });
    expect(f.tipo).toBe("kit");
    expect(f.itens).toEqual(["pa", "vassoura"]);
  });

  it("vassoura pura é produto único", () => {
    expect(fichaDoProduto({ nome: "VASSOURA DE PELO" }).tipo).toBe("simples");
  });

  it("⭐ cabo avulso é acessório — nunca a vassoura que a pessoa pediu", () => {
    const f = fichaDoProduto({ nome: "CABO DE VASSOURA AVULSO" });
    expect(f.tipo).toBe("acessorio");
    expect(f.itens).toEqual([]);
    expect(f.descricao).toContain("Peça de reposição/acessório");
  });

  it("categoria de acessório decide mesmo com nome neutro", () => {
    expect(fichaDoProduto({ nome: "ITEM 123", categoria: "Acessorios" }).tipo).toBe("acessorio");
  });

  it("refil e reposição são acessório", () => {
    expect(fichaDoProduto({ nome: "REFIL DE RODO 40 CM" }).tipo).toBe("acessorio");
    expect(fichaDoProduto({ nome: "REPOSICAO FILTRO" }).tipo).toBe("acessorio");
  });

  it("kit com lista entre parênteses usa a lista, não o nome inteiro", () => {
    const f = fichaDoProduto({
      nome: "Conjunto super mop po 40cm. microfibra (cabo alum.telescopico 1,40m./sup./refil, KD-8040) - Nobre",
    });
    expect(f.tipo).toBe("kit");
    expect(f.itens).toEqual(["cabo alum telescopico", "sup", "refil"]);
  });
});

describe("descrição gerada — nada inventado, só o que o cadastro tem", () => {
  it("produto simples ganha medida, que é a pergunta seguinte do cliente", () => {
    expect(fichaDoProduto({ nome: "ALCOOL EM GEL 5l" }).descricao).toBe("Produto único. Medida: 5 L.");
  });

  it("⭐ nenhum produto fica sem descrição alguma", () => {
    // Medido em 1137 produtos do catálogo real: a versão anterior deixava 340
    // sem nenhuma informação. Agora a categoria entra, e é dado da loja.
    const f = fichaDoProduto({ nome: "VASSOURA", categoria: "Vassouras" });
    expect(f.descricao).toBe("Produto único. Categoria: Vassouras.");
  });

  it("sem NENHUM dado além do nome, não inventa frase", () => {
    expect(fichaDoProduto({ nome: "VASSOURA" }).descricao).toBeNull();
  });

  it("embalagem entra na descrição — é o que o cliente pergunta depois do preço", () => {
    const f = fichaDoProduto({ nome: "COPO DESCARTÁVEL 300 ML C/100" });
    expect(f.tipo).toBe("simples");
    expect(f.descricao).toBe("Produto único. Medida: 300 ML. Embalagem com 100 unidades.");
  });

  it("marca da loja entra", () => {
    expect(fichaDoProduto({ nome: "DETERGENTE", marca: "Bill" }).descricao).toContain("Marca: Bill.");
  });
});

describe("descricaoParaGravar — o backfill não pisa na palavra da loja", () => {
  it("produto COM descrição cadastrada não gera nada", () => {
    expect(
      descricaoParaGravar({ nome: "VASSOURA", descricao: "Vassoura de pelo sintetico" }),
    ).toBeNull();
    expect(descricaoParaGravar({ nome: "AGUA SANITARIA 2L", descricao: "   " })).not.toBeNull();
  });

  it("produto SEM descrição recebe a gerada", () => {
    expect(descricaoParaGravar({ nome: "CABO DE VASSOURA AVULSO" })).toBe(
      "Peça de reposição/acessório.",
    );
  });
});
