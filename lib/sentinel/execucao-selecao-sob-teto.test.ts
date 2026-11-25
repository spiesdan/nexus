/**
 * O TETO DE OCORRÊNCIAS NÃO PODE ESCONDER UMA REGRA INTEIRA.
 *
 * Caso real, 25/11/2026: `limite_ocorrencias` = 500 e
 * `fiscal.cliente_sem_endereco_fiscal` produziu 524 achados. A execução gravou
 * `achados: 500`, `truncado: true` — e **nenhuma** ocorrência de
 * `operacao.mercos_importacao_falhou`, embora a importação do Mercos tivesse
 * terminado com erro 11 h antes e a regra tivesse achado. A importação quebrada
 * ficou invisível porque outra regra ocupou o teto.
 *
 * O mecanismo que existia (`regrasComAchadoForaDoTeto`) evitava ENCERRAR a
 * ocorrência de uma regra cortada. Nunca a criava. O resultado é o pior estado
 * possível: nem registrada, nem encerrada, nem visível.
 */
import { describe, expect, it } from "vitest";

import { selecionarSobTeto } from "./execucao";

const achado = (regra: string, id: number) => ({ regra, id });

describe("seleção sob o teto de ocorrências", () => {
  it("abaixo do teto, nada muda e a ordem é preservada", () => {
    const entrada = [achado("a", 1), achado("b", 2), achado("a", 3)];
    expect(selecionarSobTeto(entrada, 10)).toEqual(entrada);
  });

  it("uma regra com 500 achados NÃO come o teto inteiro", () => {
    const entrada = [
      ...Array.from({ length: 100 }, (_, i) => achado("fiscal.sem_endereco", i)),
      achado("operacao.mercos_importacao_falhou", 999),
    ];
    const saida = selecionarSobTeto(entrada, 5);
    expect(saida).toHaveLength(5);
    expect(saida.map((a) => a.regra)).toContain("operacao.mercos_importacao_falhou");
  });

  it("cada regra que achou algo aparece pelo menos uma vez", () => {
    const entrada = [
      ...Array.from({ length: 50 }, (_, i) => achado("a", i)),
      achado("b", 100),
      ...Array.from({ length: 50 }, (_, i) => achado("c", 200 + i)),
      achado("d", 300),
    ];
    const regras = new Set(selecionarSobTeto(entrada, 10).map((a) => a.regra));
    expect([...regras].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("o representante de cada regra é o PRIMEIRO achado dela, não um qualquer", () => {
    const entrada = [achado("a", 1), achado("a", 2), achado("b", 3)];
    const saida = selecionarSobTeto(entrada, 2);
    expect(saida).toEqual([achado("a", 1), achado("b", 3)]);
  });

  it("o teto continua sendo o teto", () => {
    const entrada = Array.from({ length: 40 }, (_, i) => achado(`r${i % 7}`, i));
    expect(selecionarSobTeto(entrada, 12)).toHaveLength(12);
  });

  it("mais regras do que teto: as primeiras entram, e a decisão é determinística", () => {
    const entrada = Array.from({ length: 30 }, (_, i) => achado(`r${i}`, i));
    const primeira = selecionarSobTeto(entrada, 5);
    const segunda = selecionarSobTeto(entrada, 5);
    expect(primeira).toEqual(segunda);
    expect(primeira.map((a) => a.regra)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
  });

  it("teto zero devolve nada, em vez de vazar um achado", () => {
    expect(selecionarSobTeto([achado("a", 1)], 0)).toEqual([]);
  });
});
