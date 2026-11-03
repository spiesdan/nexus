import { describe, expect, it } from "vitest";

import type { DocumentoSefaz } from "./entrada";
import {
  cnpjDigitos,
  nsuSeguro,
  ordenarPorNsu,
  preservarAssociacoes,
  promocaoDoDocumento,
  tipoDoEvento,
  totaisDoDocumento,
} from "./entrada-sync";

/**
 * As decisões PURAS da sincronização — o que decide se o cursor pode andar e
 * se um resumo pode sobrescrever um XML completo.
 *
 * A orquestração (lease, banco, sidecar) é provada em `pnpm test:db` e no e2e;
 * aqui ficam as regras que, se erradas, perdem nota em silêncio — que é o
 * defeito que esta etapa existe para corrigir.
 */
function doc(over: Partial<DocumentoSefaz> = {}): DocumentoSefaz {
  return {
    nsu: "10",
    tipo: "resumo",
    chave: "35261012345678000199550010000012341000012345",
    emitente_cnpj: "12345678000199",
    emitente_nome: "Fornecedor",
    emitente_ie: null,
    numero: 1,
    serie: "1",
    dh_emi: "2026-10-01T10:00:00-03:00",
    valor_cents: 1000,
    xml: null,
    itens: [],
    cobranca: [],
    ...over,
  };
}

describe("cnpjDigitos", () => {
  it("aceita CNPJ formatado e cru", () => {
    expect(cnpjDigitos("12.345.678/0001-99")).toBe("12345678000199");
    expect(cnpjDigitos("12345678000199")).toBe("12345678000199");
    expect(cnpjDigitos(null)).toBe("");
  });
});

describe("ordenarPorNsu", () => {
  it("persiste na ordem do NSU, mesmo quando a SEFAZ entrega fora de ordem", () => {
    const ordenado = ordenarPorNsu([{ nsu: "30" }, { nsu: "10" }, { nsu: 20 }]);
    expect(ordenado.map((d) => Number(d.nsu))).toEqual([10, 20, 30]);
  });

  it("não muta o array de entrada", () => {
    const entrada = [{ nsu: "2" }, { nsu: "1" }];
    ordenarPorNsu(entrada);
    expect(entrada.map((d) => d.nsu)).toEqual(["2", "1"]);
  });
});

describe("nsuSeguro — o cursor só anda até o que foi persistido", () => {
  it("rodada sem falha pode ir até o ultNSU da resposta", () => {
    expect(nsuSeguro({ ultNsu: 150, nsuInicial: 100, persistidos: [110, 120], falhou: false })).toBe(
      150,
    );
  });

  it("lote vazio sem falha também avança (não há documento perdido entre os NSUs)", () => {
    expect(nsuSeguro({ ultNsu: 150, nsuInicial: 100, persistidos: [], falhou: false })).toBe(150);
  });

  it("falha para no maior NSU persistido — o que falhou será re-tentado", () => {
    expect(nsuSeguro({ ultNsu: 150, nsuInicial: 100, persistidos: [110, 120], falhou: true })).toBe(
      120,
    );
  });

  it("falhou no PRIMEIRO documento: cursor não anda", () => {
    expect(nsuSeguro({ ultNsu: 150, nsuInicial: 100, persistidos: [], falhou: true })).toBe(100);
  });

  it("nunca anda para trás, nem com resposta inconsistente", () => {
    expect(nsuSeguro({ ultNsu: 90, nsuInicial: 100, persistidos: [], falhou: false })).toBe(100);
    expect(nsuSeguro({ ultNsu: 150, nsuInicial: 100, persistidos: [120], falhou: true })).toBe(120);
  });
});

describe("tipoDoEvento", () => {
  it("110111 é cancelamento e 110110 é carta de correção", () => {
    expect(tipoDoEvento("110111").tipo).toBe("cancelamento");
    expect(tipoDoEvento("110110").tipo).toBe("carta_correcao");
  });

  it("os quatro códigos de manifestação caem no mesmo tipo", () => {
    for (const codigo of ["210200", "210210", "210220", "210240"]) {
      expect(tipoDoEvento(codigo).tipo).toBe("manifestacao");
    }
  });

  it("código desconhecido não vira cancelamento por acidente", () => {
    expect(tipoDoEvento("999999").tipo).toBe("outro");
    expect(tipoDoEvento(null).tipo).toBe("outro");
  });
});

describe("promocaoDoDocumento — resumo não apaga XML completo", () => {
  const completo = doc({ tipo: "completa", xml: "<nfe/>", valor_cents: 5000 });

  it("primeira vez é insert", () => {
    expect(promocaoDoDocumento(null, completo)).toBe("inserir");
    expect(promocaoDoDocumento(null, doc())).toBe("inserir");
  });

  it("resumo depois de completo é ignorado", () => {
    expect(promocaoDoDocumento({ xml: "<nfe/>", situacao_fiscal: "autorizada", valor_total_cents: 5000 }, doc())).toBe(
      "sem_mudanca",
    );
  });

  it("completo depois de resumo promove a linha", () => {
    expect(
      promocaoDoDocumento({ xml: null, situacao_fiscal: "desconhecida", valor_total_cents: 1000 }, completo),
    ).toBe("promover");
  });

  it("completo repetido é sem mudança", () => {
    expect(
      promocaoDoDocumento({ xml: "<nfe/>", situacao_fiscal: "autorizada", valor_total_cents: 5000 }, completo),
    ).toBe("sem_mudanca");
  });
});

describe("totaisDoDocumento", () => {
  it("soma os impostos quando o XML não traz o total pronto", () => {
    const t = totaisDoDocumento(
      doc({
        tipo: "completa",
        xml: "<nfe/>",
        valor_cents: 10000,
        totais: { icms_cents: 1800, ipi_cents: 500, pis_cents: 165, cofins_cents: 760 },
      }),
    );
    expect(t.impostos_cents).toBe(3225);
    expect(t.total_cents).toBe(10000);
  });

  it("respeita o total de impostos quando veio do XML", () => {
    const t = totaisDoDocumento(doc({ totais: { impostos_cents: 9999, icms_cents: 1 } }));
    expect(t.impostos_cents).toBe(9999);
  });

  it("resumo (sem totais) não inventa imposto", () => {
    const t = totaisDoDocumento(doc());
    expect(t.impostos_cents).toBe(0);
    expect(t.total_cents).toBe(1000);
  });
});

describe("preservarAssociacoes — ressincronizar não desfaz a conferência", () => {
  it("devolve produto e autor à linha de mesmo numero_item", () => {
    const linhas = [
      { numero_item: 1, codigo: "A" },
      { numero_item: 2, codigo: "B" },
    ];
    preservarAssociacoes(linhas, [
      {
        numero_item: 2,
        produto_id: "prod-2",
        associado_por: "user-1",
        associado_em: "2026-11-02T10:00:00Z",
      },
    ]);
    expect(linhas[0]).toEqual({ numero_item: 1, codigo: "A" });
    expect(linhas[1]).toMatchObject({
      produto_id: "prod-2",
      associado_por: "user-1",
      associado_em: "2026-11-02T10:00:00Z",
    });
  });

  it("item novo no XML não herda associação de outro item", () => {
    const linhas = [{ numero_item: 3, codigo: "C" }];
    preservarAssociacoes(linhas, [
      {
        numero_item: 1,
        produto_id: "prod-1",
        associado_por: "user-1",
        associado_em: "2026-11-02T10:00:00Z",
      },
    ]);
    expect(linhas[0]).toEqual({ numero_item: 3, codigo: "C" });
  });

  it("associação removida (produto_id null) não volta no replay", () => {
    const linhas = [{ numero_item: 1, codigo: "A" }];
    preservarAssociacoes(linhas, [
      { numero_item: 1, produto_id: null, associado_por: null, associado_em: null },
    ]);
    expect(linhas[0]).toMatchObject({ produto_id: null, associado_por: null, associado_em: null });
  });
});
