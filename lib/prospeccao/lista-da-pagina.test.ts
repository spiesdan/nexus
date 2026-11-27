import { describe, expect, it } from "vitest";

import { listaDeBuscasDaPagina } from "./lista-da-pagina";

describe("lista da página de buscas", () => {
  it("erro de query NÃO devolve lista vazia silenciosa", () => {
    expect(listaDeBuscasDaPagina(null, { message: "PGRST204" })).toEqual({
      buscas: [],
      erro: true,
    });
  });

  it("sucesso devolve as linhas", () => {
    expect(listaDeBuscasDaPagina([{ id: "b1" }], null)).toEqual({
      buscas: [{ id: "b1" }],
      erro: false,
    });
  });

  it("sucesso vazio é ausência real de buscas", () => {
    expect(listaDeBuscasDaPagina(null, null)).toEqual({ buscas: [], erro: false });
  });
});
