import { describe, expect, it } from "vitest";

import {
  agruparProdutos,
  chaveDaCategoria,
  ordenarChaves,
  pendenciasDaSelecao,
  podeGerar,
  rotuloDaSecao,
  type CategoriaDoCatalogo,
  type ProdutoDoCatalogo,
} from "./agrupamento";
import { diagramarCatalogo } from "./pdf/paginacao";

const categorias: CategoriaDoCatalogo[] = [
  { id: "c-beb", nome: "Bebidas", parent_id: null, posicao: 1, ativo: true },
  { id: "c-out", nome: "Outros", parent_id: null, posicao: 2, ativo: true },
];

function produto(id: string, categoria: string | null, extras: Partial<ProdutoDoCatalogo> = {}): ProdutoDoCatalogo {
  return {
    id,
    codigo: `COD-${id}`,
    nome: `Produto ${id}`,
    categoria,
    fotoCapa: `fotos/${id}.jpg`,
    ...extras,
  };
}

describe("agrupamento por texto normalizado", () => {
  it("Bebidas, bebidas e BEBIDAS produzem UMA seção e um número de página só", () => {
    const secoes = agruparProdutos(
      [produto("1", "Bebidas"), produto("2", "bebidas"), produto("3", "BEBIDAS")],
      categorias,
    );
    expect(secoes).toHaveLength(1);
    expect(secoes[0]?.rotulo).toBe("Bebidas");
    expect(secoes[0]?.produtos).toHaveLength(3);
    expect(secoes[0]?.categoriaId).toBe("c-beb");

    const diagramacao = diagramarCatalogo(secoes);
    const entradas = diagramacao.sumario.filter((e) => e.chave === "bebidas");
    expect(entradas).toHaveLength(1);
    expect(entradas[0]?.pagina).toBe(2 + diagramacao.paginasDeSumario);
  });

  it("normaliza acento, caixa e espaços repetidos", () => {
    expect(chaveDaCategoria("  Posto de  Combustível ")).toBe("posto de combustivel");
    expect(chaveDaCategoria("POSTO DE COMBUSTIVEL")).toBe("posto de combustivel");
  });

  it("rótulo mais frequente vence; empate prefere o melhor escrito", () => {
    expect(rotuloDaSecao(["bebidas", "Bebidas", "Bebidas"])).toBe("Bebidas");
    expect(rotuloDaSecao(["BEBIDAS", "Bebidas"])).toBe("Bebidas");
  });
});

describe("categoria válida x sem categoria", () => {
  it("texto que não casa com product_categories bloqueia com a lista do que falta", () => {
    const pendencias = pendenciasDaSelecao(
      [produto("1", "Outros"), produto("2", "Laticínios"), produto("3", null)],
      categorias,
    );
    // "Outros" existe na tabela; os outros dois não.
    expect(pendencias.semCategoria.map((p) => p.produtoId)).toEqual(["2", "3"]);
    expect(podeGerar(pendencias)).toBe(false);
  });

  it("sem nome/código/foto também bloqueia e nomeia o motivo", () => {
    const pendencias = pendenciasDaSelecao(
      [produto("1", "Bebidas", { nome: "", codigo: null, fotoCapa: null })],
      categorias,
    );
    expect(pendencias.semDados[0]?.motivos).toEqual(["sem nome", "sem código", "sem foto"]);
    expect(podeGerar(pendencias)).toBe(false);
  });

  it("seleção completa pode gerar", () => {
    expect(podeGerar(pendenciasDaSelecao([produto("1", "Bebidas")], categorias))).toBe(true);
  });
});

describe("ordem das categorias", () => {
  it("usa posição da tabela; o que não casa vai depois, em alfabético", () => {
    const ordem = ordenarChaves(["laticinios", "bebidas", "outros"], categorias, null);
    expect(ordem).toEqual(["bebidas", "outros", "laticinios"]);
  });

  it("a ordem revisada pelo operador é a que vale", () => {
    const ordem = ordenarChaves(["laticinios", "bebidas"], categorias, ["laticinios", "bebidas"]);
    expect(ordem).toEqual(["laticinios", "bebidas"]);
  });
});

describe("paginação", () => {
  it("quebra em 4 produtos por página e repete o índice da seção na continuação", () => {
    const secoes = agruparProdutos(
      [1, 2, 3, 4, 5, 6].map((n) => produto(String(n), "Bebidas")),
      categorias,
    );
    const d = diagramarCatalogo(secoes, { contracapa: true });
    expect(d.paginas).toHaveLength(2);
    expect(d.paginas[0]?.primeiraDaSecao).toBe(true);
    expect(d.paginas[1]?.primeiraDaSecao).toBe(false);
    expect(d.paginas[1]?.indiceSecao).toBe(1);
    expect(d.paginas[0]?.numero).toBe(d.sumario[0]?.pagina);
    expect(d.numeroDaContracapa).toBe(d.totalDePaginas);
  });

  it("muitas seções: o sumário cresce e empurra a numeração das páginas", () => {
    const muitas = Array.from({ length: 45 }, (_, i) => ({
      id: `cat-${i}`,
      nome: `Categoria ${String(i).padStart(2, "0")}`,
      parent_id: null,
      posicao: i,
      ativo: true,
    }));
    const secoes = agruparProdutos(
      muitas.map((c, i) => produto(String(i), c.nome)),
      muitas,
    );
    const d = diagramarCatalogo(secoes);
    expect(d.paginasDeSumario).toBe(3);
    expect(d.sumario[0]?.pagina).toBe(5);
    expect(new Set(d.sumario.map((e) => e.pagina)).size).toBe(45);
  });
});
