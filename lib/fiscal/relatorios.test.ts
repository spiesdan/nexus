import { describe, expect, it } from "vitest";

import {
  estaCancelada,
  mesDaEntrada,
  porFornecedor,
  porMes,
  produtosMaisComprados,
  resumoDoPeriodo,
  type LinhaDeEntrada,
  type LinhaDeItem,
} from "./relatorios";

/**
 * A soma do relatório tem que ser a soma do banco.
 *
 * Massa fixa, valores conhecidos, e a prova explícita de que documento
 * cancelado não entra em "compras" — o erro que faria o dono da empresa ver um
 * gasto que não aconteceu.
 */
function entrada(over: Partial<LinhaDeEntrada> = {}): LinhaDeEntrada {
  return {
    id: over.id ?? "id",
    chave: over.chave ?? "35261012345678000199550010000012341000012345",
    emitente_nome: over.emitente_nome ?? "Fornecedor A",
    emitente_cnpj: over.emitente_cnpj ?? "12345678000199",
    dh_emi: over.dh_emi === undefined ? "2026-10-01T10:00:00-03:00" : over.dh_emi,
    valor_total_cents: over.valor_total_cents ?? 10000,
    situacao_fiscal: over.situacao_fiscal ?? "autorizada",
    conferencia_status: over.conferencia_status ?? "pendente",
    supplier_id: over.supplier_id ?? "sup-a",
    totais_json:
      over.totais_json === undefined
        ? {
            produtos_cents: 9000,
            impostos_cents: 1500,
            icms_cents: 1000,
            ipi_cents: 500,
            pis_cents: 0,
            cofins_cents: 0,
            frete_cents: 1000,
            desconto_cents: 0,
            total_cents: 10000,
          }
        : over.totais_json,
  };
}

describe("resumoDoPeriodo", () => {
  it("soma valor e impostos das notas válidas", () => {
    const r = resumoDoPeriodo([
      entrada({ id: "1" }),
      entrada({ id: "2", valor_total_cents: 25000, totais_json: { impostos_cents: 3000 } }),
    ]);
    expect(r.notas).toBe(2);
    expect(r.notas_validas).toBe(2);
    expect(r.valor_cents).toBe(35000);
    expect(r.impostos_cents).toBe(4500);
  });

  it("cancelada conta na quantidade mas NÃO no valor — compra que não houve", () => {
    const r = resumoDoPeriodo([
      entrada({ id: "1", valor_total_cents: 10000 }),
      entrada({ id: "2", situacao_fiscal: "cancelada", valor_total_cents: 99999 }),
    ]);
    expect(r.notas).toBe(2);
    expect(r.notas_validas).toBe(1);
    expect(r.canceladas).toBe(1);
    expect(r.valor_cents).toBe(10000);
    expect(r.por_situacao.cancelada).toBe(1);
    expect(r.por_situacao.autorizada).toBe(1);
  });

  it("denegada também fica fora do valor", () => {
    const r = resumoDoPeriodo([entrada({ situacao_fiscal: "denegada" })]);
    expect(r.valor_cents).toBe(0);
    expect(r.canceladas).toBe(1);
  });

  it("conta por situação de conferência — o que está pendente aparece", () => {
    const r = resumoDoPeriodo([
      entrada({ id: "1", conferencia_status: "pendente" }),
      entrada({ id: "2", conferencia_status: "aprovada" }),
      entrada({ id: "3", conferencia_status: "pendente" }),
    ]);
    expect(r.por_conferencia).toEqual({ pendente: 2, aprovada: 1 });
  });

  it("período vazio não inventa número", () => {
    const r = resumoDoPeriodo([]);
    expect(r.notas).toBe(0);
    expect(r.valor_cents).toBe(0);
    expect(r.impostos_cents).toBe(0);
  });

  it("resumo sem totais (XML não completo) soma o valor e zero imposto", () => {
    const r = resumoDoPeriodo([entrada({ totais_json: null })]);
    expect(r.valor_cents).toBe(10000);
    expect(r.impostos_cents).toBe(0);
  });
});

describe("agrupamentos", () => {
  it("por fornecedor junta as notas do mesmo CNPJ e ordena pelo valor", () => {
    const linhas = [
      entrada({ id: "1", emitente_nome: "A", supplier_id: "a", valor_total_cents: 100 }),
      entrada({ id: "2", emitente_nome: "A", supplier_id: "a", valor_total_cents: 200 }),
      entrada({ id: "3", emitente_nome: "B", supplier_id: "b", valor_total_cents: 500 }),
    ];
    const r = porFornecedor(linhas);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ chave: "b", notas: 1, valor_cents: 500 });
    expect(r[1]).toMatchObject({ chave: "a", notas: 2, valor_cents: 300 });
  });

  it("por mês usa a data de emissão em UTC e ordena cronologicamente", () => {
    const r = porMes([
      entrada({ id: "1", dh_emi: "2026-10-01T10:00:00-03:00", valor_total_cents: 100 }),
      entrada({ id: "2", dh_emi: "2026-09-30T23:00:00-03:00", valor_total_cents: 200 }),
      entrada({ id: "3", dh_emi: "2026-10-20T10:00:00-03:00", valor_total_cents: 300 }),
    ]);
    // 2026-09-30T23:00-03:00 = 2026-10-01T02:00Z → outubro.
    expect(r.map((l) => l.chave)).toEqual(["2026-10"]);
    expect(r[0]?.valor_cents).toBe(600);
  });

  it("sem data vira 'sem-data', não some do relatório", () => {
    const r = porMes([entrada({ dh_emi: null })]);
    expect(r[0]?.chave).toBe("sem-data");
  });
});

describe("produtosMaisComprados", () => {
  function item(over: Partial<LinhaDeItem> = {}): LinhaDeItem {
    return {
      entrada_id: "e1",
      codigo: "SKU-1",
      descricao: "Produto",
      ncm: "12345678",
      unidade: "UN",
      quantidade: 2,
      valor_total_cents: 1000,
      icms_cents: 100,
      ipi_cents: 0,
      pis_cents: 0,
      cofins_cents: 0,
      ...over,
    };
  }

  it("junta o mesmo código+NCM e soma quantidade/valor/impostos", () => {
    const r = produtosMaisComprados([
      item(),
      item({ quantidade: 3, valor_total_cents: 1500, icms_cents: 150 }),
      item({ codigo: "SKU-2", valor_total_cents: 9000 }),
    ]);
    expect(r[0]).toMatchObject({ codigo: "SKU-2", valor_total_cents: 9000 });
    expect(r[1]).toMatchObject({
      codigo: "SKU-1",
      notas: 2,
      quantidade: 5,
      valor_total_cents: 2500,
      icms_cents: 250,
    });
  });

  it("mesmo código com NCM diferente NÃO é o mesmo produto", () => {
    const r = produtosMaisComprados([
      item({ ncm: "11111111" }),
      item({ ncm: "22222222" }),
    ]);
    expect(r).toHaveLength(2);
  });

  it("sem itens, lista vazia", () => {
    expect(produtosMaisComprados([])).toEqual([]);
  });
});

describe("helpers", () => {
  it("mesDaEntrada devolve YYYY-MM", () => {
    expect(mesDaEntrada("2026-01-05T00:00:00Z")).toBe("2026-01");
    expect(mesDaEntrada("lixo")).toBe("sem-data");
    expect(mesDaEntrada(null)).toBe("sem-data");
  });

  it("estaCancelada cobre cancelada e denegada", () => {
    expect(estaCancelada({ situacao_fiscal: "cancelada" })).toBe(true);
    expect(estaCancelada({ situacao_fiscal: "denegada" })).toBe(true);
    expect(estaCancelada({ situacao_fiscal: "autorizada" })).toBe(false);
    expect(estaCancelada({ situacao_fiscal: "desconhecida" })).toBe(false);
  });
});
