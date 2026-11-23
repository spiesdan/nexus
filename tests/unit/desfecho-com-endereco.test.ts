/**
 * P0-2 da auditoria 72: a cabine deixava "Entregue" habilitada enquanto o
 * mapa dizia "Nenhuma parada no mapa" e a folha dizia "Sem endereço
 * cadastrado". Nenhum dos três avisos tinha ação; o desfecho positivo, sim.
 */
import { describe, expect, it } from "vitest";

import { enderecoEhConhecido, podeRegistrarDesfecho } from "@/lib/entregas/desfecho-com-endereco";

describe("desfecho exige endereço conhecido", () => {
  it.each([
    [null, false],
    [undefined, false],
    ["", false],
    ["   ", false],
    ["Rua das Flores, 10", true],
    ["Rua das Flores, s/n — ao lado da padaria", true],
  ])("endereco %s → conhecido=%s", (endereco, esperado) => {
    expect(enderecoEhConhecido(endereco)).toBe(esperado);
  });

  it("sem parada não há desfecho", () => {
    expect(podeRegistrarDesfecho(null)).toBe(false);
    expect(podeRegistrarDesfecho(undefined)).toBe(false);
  });

  it("parada sem endereço trava a baixa, mesmo com coordenada no mapa", () => {
    expect(
      podeRegistrarDesfecho({ endereco: null }),
    ).toBe(false);
    expect(
      podeRegistrarDesfecho({ endereco: "Rua A, 1" }),
    ).toBe(true);
  });
});
