/**
 * O parser JSON da classificação (§11) — a defesa em três camadas contra
 * saída de modelo.
 *
 * `interest_level` tem CHECK no banco e vira filtro de tela; o que a pessoa
 * digitou nunca passa reto. Os casos negativos são o motivo deste arquivo
 * existir: modelo comenta, cerca com ```json, valor fora do vocabulário,
 * JSON truncado — tudo tem de virar `null` (aí o worker não classifica, em vez
 * de gravar lixo).
 */
import { describe, expect, it } from "vitest";

import { interpretarClassificacao, systemDoClassificador } from "./classificacao";

describe("interpretarClassificacao — o caminho feliz", () => {
  it("JSON limpo lê direto", () => {
    expect(
      interpretarClassificacao('{"interesse":"alto","oportunidade":true,"necessidade":"orçamento"}'),
    ).toEqual({ interesse: "alto", oportunidade: true, necessidade: "orçamento" });
  });
  it("cercado de ```json (o vício clássico) é removido", () => {
    const bruto = '```json\n{"interesse":"medio","oportunidade":false,"necessidade":null}\n```';
    expect(interpretarClassificacao(bruto)).toEqual({
      interesse: "medio",
      oportunidade: false,
      necessidade: null,
    });
  });
  it("prosa antes/depois do objeto: o primeiro objeto equilibrado é isolado", () => {
    const bruto =
      'Claro! Aqui está: {"interesse":"baixo","oportunidade":false,"necessidade":"reforma"} — espero ter ajudado.';
    expect(interpretarClassificacao(bruto)).toEqual({
      interesse: "baixo",
      oportunidade: false,
      necessidade: "reforma",
    });
  });
  it("MAIÚSCULAS e espaço à volta caem para o vocabulário do repo", () => {
    expect(interpretarClassificacao('{"interesse":"  ALTO ","oportunidade":false}')).toEqual({
      interesse: "alto",
      oportunidade: false,
      necessidade: null,
    });
  });
  it("oportunidade só é true quando é booleano true", () => {
    expect(interpretarClassificacao('{"interesse":"alto","oportunidade":"sim"}')?.oportunidade).toBe(
      false,
    );
  });
  it("necessidade é aparada em 300 caracteres", () => {
    const longa = "x".repeat(500);
    const r = interpretarClassificacao(
      `{"interesse":"medio","oportunidade":false,"necessidade":"${longa}"}`,
    );
    expect(r?.necessidade).toHaveLength(300);
  });
  it("necessidade vazia vira null, não string em branco", () => {
    expect(
      interpretarClassificacao('{"interesse":"medio","oportunidade":false,"necessidade":"   "}')
        ?.necessidade,
    ).toBeNull();
  });
});

describe("interpretarClassificacao — o que NÃO passa", () => {
  it("sem objeto nenhum: null", () => {
    expect(interpretarClassificacao("A pessoa gostou do produto!")).toBeNull();
    expect(interpretarClassificacao("")).toBeNull();
  });
  it("objeto sem fechar (JSON truncado): null", () => {
    expect(interpretarClassificacao('{"interesse":"alto","oportunidade":tru')).toBeNull();
  });
  it("interesse fora do vocabulário: null (o CHECK do banco nunca é a primeira trincheira)", () => {
    expect(
      interpretarClassificacao('{"interesse":"otimo","oportunidade":false,"necessidade":null}'),
    ).toBeNull();
    expect(
      interpretarClassificacao('{"interesse":"QUENTE","oportunidade":false,"necessidade":null}'),
    ).toBeNull();
  });
  it("interesse ausente/não-string: null", () => {
    expect(interpretarClassificacao('{"oportunidade":true}')).toBeNull();
    expect(interpretarClassificacao('{"interesse":42,"oportunidade":true}')).toBeNull();
  });
  it("JSON válido mas não-objeto: null", () => {
    expect(interpretarClassificacao('"alto"')).toBeNull();
    expect(interpretarClassificacao("[1,2,3]")).toBeNull();
  });
  it("chaves dentro de string não fecham o objeto prematuramente", () => {
    const bruto =
      '{"interesse":"alto","oportunidade":false,"necessidade":"disse {que} queria"}';
    expect(interpretarClassificacao(bruto)).toEqual({
      interesse: "alto",
      oportunidade: false,
      necessidade: "disse {que} queria",
    });
  });
});

describe("systemDoClassificador", () => {
  it("pede JSON com os quatro níveis do repo (o contrato do parser)", () => {
    const s = systemDoClassificador();
    for (const nivel of ["alto", "medio", "baixo", "recusou"]) {
      expect(s).toContain(nivel);
    }
    expect(s).toContain('"interesse"');
    expect(s).toContain("Nao invente");
  });
});
