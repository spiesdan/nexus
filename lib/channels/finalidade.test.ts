/**
 * O marcador de finalidade do número — a regra que separa "número que vende" de
 * "número que avisa".
 *
 * O que se mede é a degradação segura: qualquer coisa estranha no `metadata`
 * tem que significar COMERCIAL, nunca o contrário. O desfecho inverso mandaria
 * follow-up e campanha pelo número de aviso, que é exatamente o que o recurso
 * existe para evitar.
 */
import { describe, expect, it } from "vitest";

import {
  comFinalidade,
  eCanalDeExpedicao,
  FINALIDADE_COMERCIAL,
  FINALIDADE_EXPEDICAO,
  finalidadeDoCanal,
} from "@/lib/channels/finalidade";

describe("finalidadeDoCanal", () => {
  it("lê o marcador gravado", () => {
    expect(finalidadeDoCanal({ finalidade: "expedicao" })).toBe("expedicao");
    expect(finalidadeDoCanal({ finalidade: "comercial" })).toBe("comercial");
  });

  it("metadata vazio, nulo ou ausente é comercial — é o padrão histórico", () => {
    expect(finalidadeDoCanal({})).toBe(FINALIDADE_COMERCIAL);
    expect(finalidadeDoCanal(null)).toBe(FINALIDADE_COMERCIAL);
    expect(finalidadeDoCanal(undefined)).toBe(FINALIDADE_COMERCIAL);
  });

  it("valor desconhecido ou de outro tipo cai em comercial, não em expedição", () => {
    expect(finalidadeDoCanal({ finalidade: "suporte" })).toBe(FINALIDADE_COMERCIAL);
    expect(finalidadeDoCanal({ finalidade: 42 })).toBe(FINALIDADE_COMERCIAL);
    expect(finalidadeDoCanal({ finalidade: ["expedicao"] })).toBe(FINALIDADE_COMERCIAL);
    expect(finalidadeDoCanal("expedicao")).toBe(FINALIDADE_COMERCIAL);
  });

  it("eCanalDeExpedicao só responde sim para o marcador exato", () => {
    expect(eCanalDeExpedicao({ finalidade: "expedicao" })).toBe(true);
    expect(eCanalDeExpedicao({ finalidade: "EXPEDICAO" })).toBe(false);
    expect(eCanalDeExpedicao({})).toBe(false);
  });
});

describe("comFinalidade", () => {
  it("preserva o resto do metadata ao marcar expedição", () => {
    expect(comFinalidade({ apelido: "Logística", finalidade: "comercial" }, "expedicao")).toEqual({
      apelido: "Logística",
      finalidade: "expedicao",
    });
  });

  it("comercial APAGA a chave em vez de gravá-la — é o padrão, não um estado", () => {
    expect(comFinalidade({ apelido: "Logística", finalidade: "expedicao" }, "comercial")).toEqual({
      apelido: "Logística",
    });
  });

  it("metadata nulo vira objeto — a coluna é NOT NULL", () => {
    expect(comFinalidade(null, "expedicao")).toEqual({ finalidade: "expedicao" });
    expect(comFinalidade(null, "comercial")).toEqual({});
    expect(comFinalidade([1, 2], "comercial")).toEqual({});
  });

  it("não muta o objeto recebido", () => {
    const original = { finalidade: "comercial" as const };
    comFinalidade(original, FINALIDADE_EXPEDICAO);
    expect(original).toEqual({ finalidade: "comercial" });
  });
});
