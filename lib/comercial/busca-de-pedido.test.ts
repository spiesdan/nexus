/**
 * A BUSCA DO PEDIDO — o termo que a pessoa digita vira filtro.
 *
 * O defeito que este arquivo protege: a lista de Pedidos, a paleta ⌘K e o
 * agente mandam `busca` para a mesma rota, e a rota só olhava nome/documento.
 * Digitar `19405` devolvia zero pedidos sem erro — o pedido "não existia".
 */
import { describe, expect, it } from "vitest";

import { filtroOrDeBuscaDePedido, lerBuscaDePedido } from "./busca-de-pedido";

describe("lerBuscaDePedido", () => {
  it("reconhece o número cru, que é o que se digita", () => {
    expect(lerBuscaDePedido("19405")).toEqual({ texto: "19405", numero: 19405 });
  });

  it("reconhece o formato da tela (`PED-19405`) e o anotado no papel (`#19405`)", () => {
    expect(lerBuscaDePedido("PED-19405").numero).toBe(19405);
    expect(lerBuscaDePedido("ped 19405").numero).toBe(19405);
    expect(lerBuscaDePedido("#19405").numero).toBe(19405);
  });

  it("nome e documento não viram número", () => {
    expect(lerBuscaDePedido("BILL COMERCIO").numero).toBeNull();
    expect(lerBuscaDePedido("35.233.142/0001-83").numero).toBeNull();
  });

  it("número fora da faixa de pedido não vira filtro de número", () => {
    expect(lerBuscaDePedido("0").numero).toBeNull();
    expect(lerBuscaDePedido("99999999999").numero).toBeNull();
  });

  it("tira do texto os caracteres que são sintaxe do PostgREST", () => {
    // `,` e `()` separam filtros dentro de `or=(...)`: crus, quebravam a
    // consulta e a rota respondia 500 em vez de filtrar.
    expect(lerBuscaDePedido("SILVA, MARIA (MATRIZ)").texto).toBe("SILVA MARIA MATRIZ");
    expect(lerBuscaDePedido('  "ASPAS"  ').texto).toBe("ASPAS");
  });
});

describe("filtroOrDeBuscaDePedido", () => {
  it("procura o número exato junto com nome e documento", () => {
    expect(filtroOrDeBuscaDePedido("19405")).toBe(
      "cliente_nome.ilike.%19405%,cliente_documento.ilike.%19405%,numero.eq.19405",
    );
  });

  it("`PED-19405` busca o número e o texto como digitado", () => {
    expect(filtroOrDeBuscaDePedido("PED-19405")).toBe(
      "cliente_nome.ilike.%PED-19405%,cliente_documento.ilike.%PED-19405%,numero.eq.19405",
    );
  });

  it("nome continua procurando só em nome e documento", () => {
    expect(filtroOrDeBuscaDePedido("BILL")).toBe(
      "cliente_nome.ilike.%BILL%,cliente_documento.ilike.%BILL%",
    );
  });

  it("sem nada a filtrar devolve null — `or=` vazio derruba a consulta", () => {
    expect(filtroOrDeBuscaDePedido("   ")).toBeNull();
    expect(filtroOrDeBuscaDePedido(",()")).toBeNull();
  });
});
