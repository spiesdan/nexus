/**
 * O CASAMENTO DO PEDIDO POR IA — a parte que não pode ser "quase".
 *
 * A rota gasta uma chamada de modelo para ler o pedido, mas quem decide qual
 * produto entra é esta função. Os três desfechos que importam:
 *
 *  - nome exato -> pré-seleciona, com confiança alta;
 *  - empate/parcial -> mostra os candidatos e NÃO escolhe sozinho;
 *  - nada -> não inventa.
 *
 * Os testes usam o catálogo de uma instalação real (produtos BILL) porque o
 * defeito que se quer impedir é o do mundo real: "5 L" não pode casar com
 * "500 ml", e "2 caixas" não pode fazer a busca desistir do produto.
 */
import { describe, expect, it } from "vitest";

import { casarItensComCatalogo, LIMITE_DE_ITENS } from "@/lib/comercial/importar-ia";
import type { Produto } from "@/lib/schemas/produtos";

function produto(parcial: Partial<Produto> & Pick<Produto, "id" | "nome">): Produto {
  return {
    codigo: parcial.id.toUpperCase(),
    descricao: null,
    marca: "BILL",
    categoria: "LIMPEZA",
    preco_cents: 1000,
    moeda: "BRL",
    custo_cents: null,
    controla_estoque: true,
    quantidade: 10,
    ativo: true,
    origem: "mercos",
    imagem_url: null,
    ncm: null,
    ncm_origem: null,
    unidade: "UN",
    cfop: null,
    destaque: false,
    preco_promocional_cents: null,
    promocao_ate: null,
    ipi_pct: null,
    comissao_pct: null,
    multiplo: 1,
    observacoes: null,
    peso_bruto_kg: null,
    largura_cm: null,
    altura_cm: null,
    comprimento_cm: null,
    caixa_peso_bruto_kg: null,
    caixa_largura_cm: null,
    caixa_altura_cm: null,
    caixa_comprimento_cm: null,
    variacoes: null,
    updated_at: "2026-10-23T00:00:00.000Z",
    ...parcial,
  };
}

const CATALOGO: Produto[] = [
  produto({ id: "agua-5l", nome: "AGUA SANITARIA BILL 5 L", preco_cents: 1290 }),
  produto({ id: "agua-2l", nome: "AGUA SANITARIA BILL 2 L", preco_cents: 890 }),
  produto({ id: "alcool-46", nome: "ALCOOL 46% 1L", preco_cents: 990 }),
  produto({ id: "alcool-70", nome: "ALCOOL 70% 1L", preco_cents: 1090 }),
  produto({ id: "amaciante", nome: "AMACIANTE 5 L", preco_cents: 1890 }),
  produto({ id: "cabo", nome: "CABO DE VASSOURA AVULSO", preco_cents: 500 }),
  produto({ id: "vassoura", nome: "VASSOURA DE NYLON", preco_cents: 2490 }),
];

describe("casarItensComCatalogo", () => {
  it("nome exato pré-seleciona com confiança alta", () => {
    const item = casarItensComCatalogo(
      [{ nome: "AGUA SANITARIA BILL 5 L", quantidade: 2 }],
      CATALOGO,
    )[0]!;
    expect(item.confianca).toBe("alta");
    expect(item.produto_id).toBe("agua-5l");
    expect(item.quantidade).toBe(2);
    expect(item.candidatos[0]?.produto.id).toBe("agua-5l");
    expect(item.numeros_ignorados).toEqual([]);
  });

  it("empate próximo não escolhe sozinho — devolve candidatos para conferência", () => {
    const item = casarItensComCatalogo(
      [{ nome: "AGUA SANITARIA BILL", quantidade: 1 }],
      CATALOGO,
    )[0]!;
    expect(item.confianca).not.toBe("alta");
    expect(item.candidatos.length).toBeGreaterThanOrEqual(2);
    expect(item.produto_id).toBeNull();
  });

  it("número que o catálogo não conhece é ignorado, mas fica registrado", () => {
    const item = casarItensComCatalogo(
      [{ nome: "AGUA SANITARIA BILL 7 CAIXAS", quantidade: 1 }],
      CATALOGO,
    )[0]!;
    // O "7" de "7 caixas" não existe como litragem no catálogo; a busca não
    // pode desistir por isso, mas também não pode fingir que a consulta foi
    // exata.
    expect(item.numeros_ignorados).toContain("7");
    expect(item.candidatos.length).toBeGreaterThan(0);
  });

  it("produto acessório não é pré-selecionado no lugar do produto principal", () => {
    const item = casarItensComCatalogo(
      [{ nome: "VASSOURA DE NYLON", quantidade: 1 }],
      CATALOGO,
    )[0]!;
    expect(item.produto_id).toBe("vassoura");
    const itemRelacionado = casarItensComCatalogo(
      [{ nome: "VASSOURA", quantidade: 1 }],
      CATALOGO,
    )[0]!;
    expect(itemRelacionado.candidatos[0]?.relacao).toBe("direta");
  });

  it("sem produto no catálogo não inventa item", () => {
    const item = casarItensComCatalogo(
      [{ nome: "PRODUTO QUE NÃO EXISTE EM LUGAR NENHUM", quantidade: 1 }],
      CATALOGO,
    )[0]!;
    expect(item.confianca).toBe("nenhuma");
    expect(item.produto_id).toBeNull();
    expect(item.candidatos).toEqual([]);
  });

  it("quantidade é sempre inteira e positiva", () => {
    const itens = casarItensComCatalogo(
      [
        { nome: "ALCOOL 46% 1L", quantidade: 2.7 },
        { nome: "ALCOOL 46% 1L", quantidade: 0 },
        { nome: "ALCOOL 46% 1L", quantidade: -4 },
      ],
      CATALOGO,
    );
    expect(itens.map((i) => i.quantidade)).toEqual([3, 1, 1]);
  });

  it("preserva a ordem do que foi lido e mantém linhas repetidas", () => {
    const itens = casarItensComCatalogo(
      [
        { nome: "AMACIANTE 5 L", quantidade: 1 },
        { nome: "AGUA SANITARIA BILL 5 L", quantidade: 2 },
        { nome: "AMACIANTE 5 L", quantidade: 3 },
      ],
      CATALOGO,
    );
    expect(itens.map((i) => i.descricao)).toEqual([
      "AMACIANTE 5 L",
      "AGUA SANITARIA BILL 5 L",
      "AMACIANTE 5 L",
    ]);
    expect(itens.map((i) => i.quantidade)).toEqual([1, 2, 3]);
    expect(itens[0]?.chave).not.toBe(itens[2]?.chave);
  });

  it("o teto de itens é declarado e não depende do modelo", () => {
    expect(LIMITE_DE_ITENS).toBeGreaterThan(0);
    const muitos = Array.from({ length: LIMITE_DE_ITENS }, (_, i) => ({
      nome: `PRODUTO ${i}`,
      quantidade: 1,
    }));
    expect(casarItensComCatalogo(muitos, CATALOGO)).toHaveLength(LIMITE_DE_ITENS);
  });
});
