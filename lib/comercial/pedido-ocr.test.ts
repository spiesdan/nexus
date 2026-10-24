/**
 * DO TEXTO DO OCR ATÉ A PROPOSTA — a parte determinística.
 *
 * O OCR devolve linhas soltas; o pedido é uma lista de "quantidade + produto".
 * Estes testes cobrem as duas decisões que não podem ser "quase":
 *
 *  1. o que é quantidade e o que é TAMANHO ("5x" é quantidade, "5L" é litro);
 *  2. quando o resultado do OCR é bom o bastante para NÃO gastar IA.
 *
 * A foto de referência é `evidence/mercos-ia/pedido-manuscrito.png`; as linhas
 * abaixo são o que o PaddleOCR devolveu dela em 2026-10-24 (medido na VPS).
 */
import { describe, expect, it } from "vitest";

import {
  consertarTamanhosDoOcr,
  itemDaLinha,
  itensDeLinhasOcr,
  lerPedidoComOcr,
  LIMIAR_DE_CONFIANCA,
  separarQuantidade,
} from "@/lib/comercial/pedido-ocr";
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
    updated_at: "2026-10-24T00:00:00.000Z",
    ...parcial,
  };
}

const CATALOGO = [
  produto({ id: "agua-5l", nome: "AGUA SANITARIA BILL 5 L" }),
  produto({ id: "alcool-46", nome: "ALCOOL 46% 1L" }),
  produto({ id: "amaciante-5l", nome: "AMACIANTE BILL 5L" }),
  produto({ id: "anti-mofo-20g", nome: "ANTI MOFO BILL 20GR" }),
  produto({ id: "alvejante-2l", nome: "ALVEJANTE SEM CLORO BILL 2L" }),
];

/**
 * O que o PaddleOCR devolveu da foto manuscrita em 2026-10-24, copiado da
 * resposta do serviço na VPS — texto e confiança, sem arredondar para o que
 * seria conveniente.
 *
 * A terceira linha é o defeito REAL do motor: "1L" volta "IL". Antes de
 * `consertarTamanhosDoOcr` ela caía para confiança baixa e o vendedor tinha de
 * procurar o álcool à mão, com o produto certo no catálogo.
 */
const LINHAS_DA_FOTO = [
  { texto: "Pedido", confianca: 0.9911383986473083 },
  { texto: "2X ÁGUA SANITÁRIA BILL 5L", confianca: 0.9626634120941162 },
  { texto: "3X ÁLCOOL 46% IL", confianca: 0.9153960943222046 },
  { texto: "1X AMACIANTE 5L", confianca: 0.933899462223053 },
  { texto: "4X ANTI MOFO 20Gr", confianca: 0.9017094373703003 },
  { texto: "5X ALVEJANTE SEM CLORO 2L", confianca: 0.9858608841896057 },
];

/** A mesma foto com outra troca do motor: os "o" virando zero. */
const LINHAS_COM_ZERO_NO_LUGAR_DO_O = LINHAS_DA_FOTO.map((linha) =>
  linha.texto.startsWith("3X") ? { ...linha, texto: "3X ÁLC00L 46% 1L" } : linha,
);

describe("separarQuantidade", () => {
  it("'2x' é quantidade; '5L' é tamanho", () => {
    expect(separarQuantidade("2x ÁGUA SANITÁRIA 5L")).toEqual({
      quantidade: 2,
      nome: "ÁGUA SANITÁRIA 5L",
    });
    expect(separarQuantidade("ÁGUA SANITÁRIA 5L")).toEqual({
      quantidade: 1,
      nome: "ÁGUA SANITÁRIA 5L",
    });
  });

  it("unidade de contagem depois do número é quantidade", () => {
    expect(separarQuantidade("3 caixas de agua")).toEqual({
      quantidade: 3,
      nome: "de agua",
    });
    expect(separarQuantidade("2 UN detergente")).toEqual({
      quantidade: 2,
      nome: "detergente",
    });
  });

  it("número solto antes do nome é quantidade", () => {
    expect(separarQuantidade("5 ALVEJANTE SEM CLORO 2L")).toEqual({
      quantidade: 5,
      nome: "ALVEJANTE SEM CLORO 2L",
    });
  });

  it("medida colada ao número NÃO vira quantidade", () => {
    // "500 ml" é o tamanho da embalagem. Tratar como 500 unidades seria um
    // pedido de 500 frascos — o erro mais caro que este parser pode cometer.
    expect(separarQuantidade("500 ml de agua")).toEqual({
      quantidade: 1,
      nome: "500 ml de agua",
    });
    expect(separarQuantidade("20gr ANTI MOFO")).toEqual({
      quantidade: 1,
      nome: "20gr ANTI MOFO",
    });
  });

  it("número escrito por extenso também conta", () => {
    expect(separarQuantidade("duas aguas sanitarias")).toEqual({
      quantidade: 2,
      nome: "aguas sanitarias",
    });
    expect(separarQuantidade("meia dúzia de detergente")).toEqual({
      quantidade: 6,
      nome: "de detergente",
    });
  });
});

describe("itemDaLinha", () => {
  it("cabeçalho, total e preço não viram produto", () => {
    expect(itemDaLinha("Pedido")).toBeNull();
    expect(itemDaLinha("Total R$ 120,00")).toBeNull();
    expect(itemDaLinha("R$ 12,50")).toBeNull();
    expect(itemDaLinha("Cliente: João")).toBeNull();
  });

  it("linha de produto vira item com quantidade", () => {
    expect(itemDaLinha("2x ÁGUA SANITÁRIA BILL 5L")).toEqual({
      nome: "ÁGUA SANITÁRIA BILL 5L",
      quantidade: 2,
    });
  });

  it("preço no fim da linha não entra no nome", () => {
    expect(itemDaLinha("5x ALVEJANTE SEM CLORO 2L 18,90")).toEqual({
      nome: "ALVEJANTE SEM CLORO 2L",
      quantidade: 5,
    });
  });
});

describe("itensDeLinhasOcr", () => {
  it("lê as cinco linhas da foto e ignora o cabeçalho", () => {
    const itens = itensDeLinhasOcr(LINHAS_DA_FOTO);
    expect(itens).toHaveLength(5);
    expect(itens.map((item) => item.quantidade)).toEqual([2, 3, 1, 4, 5]);
    expect(itens[0]?.nome).toBe("ÁGUA SANITÁRIA BILL 5L");
  });
});

describe("lerPedidoComOcr", () => {
  it("foto boa vira proposta casada com o catálogo", () => {
    const leitura = lerPedidoComOcr({ linhas: LINHAS_DA_FOTO }, CATALOGO);
    expect(leitura).not.toBeNull();
    expect(leitura?.total_extraido).toBe(5);
    expect(leitura?.itens.map((item) => item.produto_id)).toEqual([
      "agua-5l",
      "alcool-46",
      "amaciante-5l",
      "anti-mofo-20g",
      "alvejante-2l",
    ]);
    // Com o "IL" consertado, as cinco linhas casam como `alta` — nenhuma fica
    // para o vendedor procurar à mão.
    expect(leitura?.itens.map((item) => item.confianca)).toEqual([
      "alta",
      "alta",
      "alta",
      "alta",
      "alta",
    ]);
  });

  it("o 'o' virando zero ainda casa, como confirmação", () => {
    const leitura = lerPedidoComOcr({ linhas: LINHAS_COM_ZERO_NO_LUGAR_DO_O }, CATALOGO);
    expect(leitura?.itens[1]?.produto_id).toBe("alcool-46");
    // Produto certo, mas a tela pede confirmação em vez de pré-selecionar.
    expect(leitura?.itens[1]?.confianca).toBe("media");
  });

  it("confiança baixa (manuscrito difícil) recusa e deixa a IA ler", () => {
    const leitura = lerPedidoComOcr(
      {
        linhas: LINHAS_DA_FOTO.map((linha) => ({
          ...linha,
          confianca: LIMIAR_DE_CONFIANCA - 0.2,
        })),
      },
      CATALOGO,
    );
    expect(leitura).toBeNull();
  });

  it("texto que não casa com o catálogo não vira proposta", () => {
    const leitura = lerPedidoComOcr(
      { linhas: [{ texto: "2x RABISCO ILEGIVEL", confianca: 0.99 }] },
      CATALOGO,
    );
    expect(leitura).toBeNull();
  });

  it("maioria sem casamento recusa — meia lista é pior que gastar IA", () => {
    const leitura = lerPedidoComOcr(
      {
        linhas: [
          { texto: "2x ÁGUA SANITÁRIA BILL 5L", confianca: 0.98 },
          { texto: "1x RABISCO ILEGIVEL", confianca: 0.98 },
        ],
      },
      CATALOGO,
    );
    expect(leitura).toBeNull();
  });
});

describe("consertarTamanhosDoOcr", () => {
  it("letra confundível colada na unidade volta a ser número", () => {
    expect(consertarTamanhosDoOcr("3X ÁLCOOL 46% IL")).toBe("3X ÁLCOOL 46% 1L");
    expect(consertarTamanhosDoOcr("ÁGUA SANITÁRIA BILL SL")).toBe("ÁGUA SANITÁRIA BILL 5L");
    expect(consertarTamanhosDoOcr("ÁGUA BILL lL")).toBe("ÁGUA BILL 1L");
  });

  it("não inventa texto onde a letra não é unidade", () => {
    expect(consertarTamanhosDoOcr("SOL DA GIRANDO")).toBe("SOL DA GIRANDO");
    expect(consertarTamanhosDoOcr("BILL HIGIENE")).toBe("BILL HIGIENE");
    expect(consertarTamanhosDoOcr("GEL 70%")).toBe("GEL 70%");
  });

  it("tamanho já correto passa intacto", () => {
    expect(consertarTamanhosDoOcr("AMACIANTE 5L")).toBe("AMACIANTE 5L");
    expect(consertarTamanhosDoOcr("ALVEJANTE 2L")).toBe("ALVEJANTE 2L");
  });
});
