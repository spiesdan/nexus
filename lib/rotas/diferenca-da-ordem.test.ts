/**
 * O QUE MUDOU DEPOIS DE PUBLICADO — e por que isso importa.
 *
 * O app do motorista só aplica a sequência nova **com confirmação**. O banner
 * do operador diz o que ele vai receber; se a conta estiver errada, um dos dois
 * lados mente.
 */
import { describe, expect, it } from "vitest";

import { diferencaDaOrdem } from "./diferenca-da-ordem";

describe("diferença entre a ordem editada e a publicada", () => {
  it("ordem idêntica não é mudança", () => {
    expect(diferencaDaOrdem(["a", "b", "c"], ["a", "b", "c"])).toEqual({
      moveram: 0,
      novas: 0,
      sairam: 0,
      mudou: false,
    });
  });

  it("trocar duas de lugar conta as duas", () => {
    const d = diferencaDaOrdem(["b", "a", "c"], ["a", "b", "c"]);
    expect(d.moveram).toBe(2);
    expect(d.mudou).toBe(true);
  });

  it("parada nova é 'nova', não 'moveu'", () => {
    const d = diferencaDaOrdem(["a", "b", "c", "d"], ["a", "b", "c"]);
    expect(d.novas).toBe(1);
    expect(d.moveram).toBe(0);
    expect(d.mudou).toBe(true);
  });

  it("parada removida conta em 'sairam'", () => {
    const d = diferencaDaOrdem(["a", "c"], ["a", "b", "c"]);
    expect(d.sairam).toBe(1);
    expect(d.mudou).toBe(true);
  });

  it("sem publicação ainda (lista vazia), tudo é nova", () => {
    const d = diferencaDaOrdem(["a", "b"], []);
    expect(d.novas).toBe(2);
    expect(d.sairam).toBe(0);
    expect(d.mudou).toBe(true);
  });

  it("renumerar sem mudar ninguém de lugar não é mudança", () => {
    // Mesmas chaves, mesma ordem — só o array foi reconstruído.
    expect(diferencaDaOrdem(["a", "b"], ["a", "b"]).mudou).toBe(false);
  });
});
