/**
 * A DECISÃO DO CATÁLOGO DO MERCOS, EXERCITADA — sem navegador e sem banco.
 *
 * O que este arquivo prova:
 *
 *  - **coluna vem do cabeçalho**, não da posição. É o que impede preço virar
 *    nome quando o ERP reordena a grade — o modo de falha silencioso do extrator
 *    legado (`docs/legacy/mercos-scrape/extrair-catalogo.ts`, que lê 2/3/7 fixo);
 *  - **preço em BRL** vira centavos inteiros, com milhar e decimal nos dois
 *    formatos (`1.234,56` e `1,234.56`);
 *  - **o relatório separa** criados / atualizados / divergentes / sem código, e
 *    divergente de nome preserva o nome do banco;
 *  - **o pareamento histórico casa só por código.** Nome é candidato; nome com
 *    mais de um produto é ambíguo e NÃO entra como candidato — o caso dos dois
 *    "ESPONJA COM 4 UN" (códigos 806 e 8147) que a produção mediu.
 */
import { describe, expect, it } from "vitest";

import {
  chaveSemZeros,
  classificarLinhas,
  COLUNAS_LEGADO,
  indexarCatalogo,
  mapearColunas,
  normalizarCodigo,
  normalizarNome,
  planejarPareamento,
  planejarUpsert,
  precoParaCents,
} from "../../workers/mercos/catalogo-logica.mjs";

describe("cabeçalho manda nas colunas", () => {
  it("mapeia pelo texto, em qualquer ordem", () => {
    const { mapa, completo } = mapearColunas(["Preço", "Produto", "Código", "Un."]);
    expect(completo).toBe(true);
    expect(mapa.preco).toBe(0);
    expect(mapa.nome).toBe(1);
    expect(mapa.codigo).toBe(2);
    expect(mapa.unidade).toBe(3);
  });

  it("aceita os cabeçalhos como o ERP escreve de fato", () => {
    const { mapa, completo } = mapearColunas([
      "Foto",
      "Cód.",
      "Descrição",
      "IPI",
      "Unidade",
      "Comissão",
      "Preço de venda",
    ]);
    expect(completo).toBe(true);
    expect(mapa.codigo).toBe(1);
    expect(mapa.nome).toBe(2);
    expect(mapa.preco).toBe(6);
  });

  it("sem código ou sem nome, o lote é recusado e diz o que faltou", () => {
    const { completo, faltando, mapa } = mapearColunas(["Produto", "Preço"]);
    expect(completo).toBe(false);
    expect(faltando).toEqual(["codigo"]);
    expect(mapa.nome).toBe(0);
  });

  it("o plano B do legado continua declarado", () => {
    // Se um dia a grade não tiver `<thead>` legível, é esta a posição usada —
    // e cada linha sai marcada com `cabecalho_lido: false`.
    expect(COLUNAS_LEGADO).toEqual({ codigo: 2, nome: 3, ipi: 4, unidade: 5, comissao: 6, preco: 7 });
  });
});

describe("preço do ERP vira centavos", () => {
  it.each([
    ["R$ 1.234,56", 123456],
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1,234.56", 123456],
    ["49,90", 4990],
    ["49.90", 4990],
    ["1.234", 123400], // 3 dígitos depois do ponto = milhar
    ["0,05", 5],
  ])("%s → %i", (entrada, esperado) => {
    expect(precoParaCents(entrada)).toBe(esperado);
  });

  it("valor sem número é null, não zero", () => {
    // Zero silencioso viraria preço grátis no catálogo — pior que recusar.
    expect(precoParaCents("—")).toBeNull();
    expect(precoParaCents("")).toBeNull();
    expect(precoParaCents(null)).toBeNull();
  });
});

describe("classificação do lote", () => {
  it("separa válidas, divergentes e sem código", () => {
    const { validas, divergentes, semCodigo } = classificarLinhas([
      { codigo: " 411 ", nome: "TOALHINHA 5KG", preco: "R$ 12,50", unidade: "UN" },
      { codigo: "806", nome: "", preco: "10,00" },
      { codigo: "8147", nome: "ESPONJA COM 4 UN", preco: "—" },
      { codigo: "", nome: "SEM CÓDIGO NENHUM", preco: "1,00" },
      { codigo: null, nome: null, preco: null },
    ]);

    expect(validas).toHaveLength(1);
    expect(validas[0].codigo).toBe("411");
    expect(divergentes.map((d) => d.motivo)).toEqual(["sem nome", "preço ilegível"]);
    expect(semCodigo).toHaveLength(2);
  });

  it("código repetido no lote vence o último e vira divergência reportada", () => {
    const { validas, divergentes } = classificarLinhas([
      { codigo: "411", nome: "TOALHINHA 5KG", preco: "10,00" },
      { codigo: "411", nome: "TOALHINHA 5KG", preco: "11,00" },
    ]);
    expect(validas).toHaveLength(1);
    expect(validas[0].preco_cents).toBe(1100);
    expect(divergentes[0].motivo).toContain("código repetido");
  });
});

describe("upsert: criados, atualizados e nome divergente", () => {
  const existentes = new Map([
    ["411", { id: "p-411", codigo: "411", nome: "Toalhinha 5kg", preco_cents: 1000 }],
  ]);

  it("classifica e PRESERVA o nome do banco quando divergir", () => {
    const { criados, atualizados, divergentes } = planejarUpsert(
      [
        { codigo: "411", nome: "TOALHINHA 5 KG PREMIUM", preco_cents: 1250, unidade: "UN" },
        { codigo: "900", nome: "PRODUTO NOVO", preco_cents: 500, unidade: "CX" },
      ],
      existentes,
    );

    expect(criados.map((p) => p.codigo)).toEqual(["900"]);
    expect(atualizados).toHaveLength(1);
    // O nome que vai para o upsert é o do BANCO, não o do ERP.
    expect(atualizados[0].nome).toBe("Toalhinha 5kg");
    expect(divergentes).toEqual([
      expect.objectContaining({
        codigo: "411",
        nome_no_banco: "Toalhinha 5kg",
        nome_no_mercos: "TOALHINHA 5 KG PREMIUM",
      }),
    ]);
  });
});

describe("pareamento histórico: código exato, nome só como candidato", () => {
  const catalogo = indexarCatalogo([
    { id: "p-411", codigo: "411", nome: "TOALHINHA 5KG" },
    { id: "p-806", codigo: "806", nome: "ESPONJA COM 4 UN" },
    { id: "p-8147", codigo: "8147", nome: "ESPONJA COM 4 UN" },
    { id: "p-0411", codigo: "0411", nome: "TOALHA DE BANHO" },
    { id: "p-77", codigo: "77", nome: "SABONETE" },
  ]);

  it("casa por código exato — o caso 411", () => {
    const { porCodigo } = planejarPareamento(
      [{ id: "i1", produto_codigo: " 411 ", produto_nome: "TOALHINHA 5KG" }],
      catalogo,
    );
    expect(porCodigo).toEqual([{ itemId: "i1", codigo: "411", produtoId: "p-411" }]);
  });

  it("NÃO casa por nome quando há dois produtos com o mesmo nome — 806 × 8147", () => {
    const plano = planejarPareamento(
      [{ id: "i2", produto_codigo: null, produto_nome: "ESPONJA COM 4 UN" }],
      catalogo,
    );
    expect(plano.porNome).toEqual([]);
    expect(plano.ambiguos).toEqual([
      { itemId: "i2", nome: "ESPONJA COM 4 UN", candidatos: ["806", "8147"] },
    ]);
  });

  it("nome único vira CANDIDATO, nunca aplicação", () => {
    const plano = planejarPareamento(
      [{ id: "i3", produto_codigo: null, produto_nome: "sabonete" }],
      catalogo,
    );
    expect(plano.porNome).toEqual([
      { itemId: "i3", nome: "SABONETE", produtoId: "p-77", produtoCodigo: "77" },
    ]);
    // O conjunto aplicável continua vazio: este item não entra em porCodigo.
    expect(plano.porCodigo).toEqual([]);
  });

  it("código que só casa sem zeros à esquerda é candidato, não pareamento", () => {
    const plano = planejarPareamento(
      [{ id: "i4", produto_codigo: "411", produto_nome: "TOALHA DE BANHO" }],
      catalogo,
    );
    // `411` casa exato (p-411); o candidato por zero é para o código que NÃO existe.
    expect(plano.porCodigo).toHaveLength(1);
    const soZero = planejarPareamento(
      [{ id: "i5", produto_codigo: "", produto_nome: "TOALHA DE BANHO" }],
      catalogo,
    );
    expect(soZero.porZero).toEqual([]);
    expect(soZero.porNome).toEqual([
      { itemId: "i5", nome: "TOALHA DE BANHO", produtoId: "p-0411", produtoCodigo: "0411" },
    ]);
  });

  it("sem código e sem nome, vai para `sem_produto` — a lista de compras da coleta", () => {
    const plano = planejarPareamento(
      [{ id: "i6", produto_codigo: "12345", produto_nome: "PRODUTO QUE NÃO EXISTE" }],
      catalogo,
    );
    expect(plano.semProduto).toEqual([
      { itemId: "i6", codigo: "12345", nome: "PRODUTO QUE NÃO EXISTE" },
    ]);
  });
});

describe("normalização", () => {
  it("código: trim e nada mais", () => {
    expect(normalizarCodigo("  411\u00a0")).toBe("411");
    expect(normalizarCodigo("   ")).toBeNull();
  });

  it("nome: upper + espaços colapsados, igual ao resto do repositório", () => {
    expect(normalizarNome("  Esponja   com 4 un ")).toBe("ESPONJA COM 4 UN");
  });

  it("chave sem zeros só existe para código numérico", () => {
    expect(chaveSemZeros("0411")).toBe("411");
    expect(chaveSemZeros("000")).toBe("0");
    expect(chaveSemZeros("A0411")).toBeNull();
  });
});
