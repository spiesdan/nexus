import { describe, expect, it } from "vitest";

import {
  dividirLinhaCsv,
  impostoAproximadoCents,
  lerCsvIbpt,
  lerDataIbpt,
  lerPercentual,
  percentualTotal,
} from "./ibpt";

/** Amostra fiel do CSV oficial (espelha TabelaIBPTaxSP.csv, conferido em 2026-10-04). */
const CABECALHO =
  "codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;estadual;municipal;vigenciainicio;vigenciafim;chave;versao;fonte";

const CSV = [
  CABECALHO,
  '00000000;;0;"PRODUTO NAO ESPECIFICADO NA LISTA DE NCM";13.45;15.45;18.00;0.00;20/09/2026;31/10/2026;C44399;26.2.B;IBPT/empresometro.com.br',
  '01022110;;0;"Bovinos reprodutores,de raca pura,prenhe ou com cria ao pe";13.45;15.45;12.00;0.00;20/09/2026;31/10/2026;C44399;26.2.B;IBPT/empresometro.com.br',
].join("\n");

describe("CSV do IBPT", () => {
  it("lê o formato real: aspas com ponto-e-vírgula dentro, ponto decimal e data em dd/mm/aaaa", () => {
    const r = lerCsvIbpt(CSV);
    expect(r.valido).toBe(true);
    expect(r.lidas).toBe(2);
    expect(r.ignoradas).toBe(0);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toEqual({
      codigo: "00000000",
      ex: "",
      descricao: "PRODUTO NAO ESPECIFICADO NA LISTA DE NCM",
      nacional_federal: 13.45,
      importados_federal: 15.45,
      estadual: 18.00,
      municipal: 0.00,
      vigencia_inicio: "2026-09-20",
      vigencia_fim: "2026-10-31",
      chave: "C44399",
      versao: "26.2.B",
      fonte: "IBPT/empresometro.com.br",
    });
    // a descrição com vírgula não é separador — só `;` divide campo
    expect(r.linhas[1]!.codigo).toBe("01022110");
    expect(r.linhas[1]!.estadual).toBe(12);
  });

  it("descreição com ponto-e-vírgula entre aspas vira um campo só", () => {
    const campos = dividirLinhaCsv('abc;"tem; ponto-e-vírgula";13.45;fim');
    expect(campos).toEqual(["abc", "tem; ponto-e-vírgula", "13.45", "fim"]);
  });

  it("aspas escapadas (\"\") voltam a ser uma aspa", () => {
    expect(dividirLinhaCsv('a;"diz ""oi""";b')).toEqual(["a", 'diz "oi"', "b"]);
  });

  it("cabeçalho que não é o do IBPT é recusado, com lista vazia", () => {
    const r = lerCsvIbpt("id,nome,valor\n1,lapis,2.5\n");
    expect(r.valido).toBe(false);
    expect(r.linhas).toEqual([]);
    expect(r.lidas).toBe(0);
  });

  it("linha malformada conta como ignorada sem derrubar as boas", () => {
    const csv = [
      CABECALHO,
      '01012100;;0;"Cavalos";13.45;15.45;18.00;0.00;20/09/2026;31/10/2026;C44399;26.2.B;IBPT',
      "CODIGO_NAO_NUMERICO;;0;\"x\";13.45;15.45;18.00;0.00;20/09/2026;31/10/2026;C;1;IBPT",
      '01022190;;0;"Outros";13.45;15.45;12.00;0.00;31/02/2026;31/10/2026;C;1;IBPT',
    ].join("\n");
    const r = lerCsvIbpt(csv);
    expect(r.valido).toBe(true);
    expect(r.lidas).toBe(3);
    expect(r.ignoradas).toBe(2);
    expect(r.linhas.map((l) => l.codigo)).toEqual(["01012100"]);
  });

  it("linha sem fim de vigência fica com vigencia_fim nula (a consulta ainda encontra)", () => {
    const csv = [CABECALHO, '01012100;;0;"x";13.45;15.45;18.00;0.00;20/09/2026;;C;1;IBPT'].join("\n");
    expect(lerCsvIbpt(csv).linhas[0]!.vigencia_fim).toBeNull();
  });
});

describe("percentuais e datas do IBPT", () => {
  it("aceita ponto e vírgula decimal, recusa fora de 0..100", () => {
    expect(lerPercentual("13.45")).toBe(13.45);
    expect(lerPercentual("13,45")).toBe(13.45);
    expect(lerPercentual("0")).toBe(0);
    expect(lerPercentual("101")).toBeNull();
    expect(lerPercentual("-1")).toBeNull();
    expect(lerPercentual("abc")).toBeNull();
    expect(lerPercentual("")).toBeNull();
  });

  it("lê dd/mm/aaaa e yyyy-mm-dd; mês impossível é null", () => {
    expect(lerDataIbpt("20/09/2026")).toBe("2026-09-20");
    expect(lerDataIbpt("2026-09-20")).toBe("2026-09-20");
    expect(lerDataIbpt("31/02/2026")).toBeNull();
    expect(lerDataIbpt("13/13/2026")).toBeNull();
    expect(lerDataIbpt("")).toBeNull();
  });

  it("o total soma federal da ORIGEM escolhida + estadual + municipal", () => {
    const linha = { nacional_federal: 13.45, importados_federal: 15.45, estadual: 18, municipal: 4 };
    expect(percentualTotal(linha, "nacional")).toBeCloseTo(35.45);
    expect(percentualTotal(linha, "importado")).toBeCloseTo(37.45);
  });

  it("imposto aproximado em centavos arredonda para o mais próximo", () => {
    expect(impostoAproximadoCents(10_000, 35.45)).toBe(3545);
    expect(impostoAproximadoCents(1_999, 13.45)).toBe(269); // 268.866 → 269
    expect(impostoAproximadoCents(0, 18)).toBe(0);
  });
});
