/**
 * Cobrem `lib/catalogo/paginacao.ts`: a tela do catálogo pagina 50 por vez com
 * o número na URL, e a busca filtra no SERVIDOR — o caso que motiva tudo é
 * "saco de lixo" nas posições 904–958 de 1141: sem paginação + filtro no
 * banco, a tela respondia vazio para produto que existe.
 */
import { describe, expect, it } from "vitest";

import {
  POR_PAGINA_DO_CATALOGO,
  faixaDaPagina,
  janelaDePaginas,
  lerPagina,
  sanitizarBuscaParaIlike,
  totalDePaginas,
  urlDoCatalogo,
} from "@/lib/catalogo/paginacao";

describe("paginacao do catalogo", () => {
  it("pede 50 por pagina", () => {
    expect(POR_PAGINA_DO_CATALOGO).toBe(50);
  });

  it("lerPagina: inteiro >= 1 passa, resto vira 1", () => {
    expect(lerPagina("3")).toBe(3);
    expect(lerPagina("1")).toBe(1);
    expect(lerPagina("0")).toBe(1);
    expect(lerPagina("-2")).toBe(1);
    expect(lerPagina("abc")).toBe(1);
    expect(lerPagina("")).toBe(1);
    expect(lerPagina(undefined)).toBe(1);
    expect(lerPagina(null)).toBe(1);
  });

  it("totalDePaginas: 1141 itens em 50 dao 23 paginas; 0 itens da 1", () => {
    expect(totalDePaginas(1141, 50)).toBe(23);
    expect(totalDePaginas(50, 50)).toBe(1);
    expect(totalDePaginas(51, 50)).toBe(2);
    expect(totalDePaginas(0, 50)).toBe(1);
  });

  it("totalDePaginas: sem count nao ha total — null, nunca chute", () => {
    expect(totalDePaginas(null, 50)).toBeNull();
  });

  it("faixaDaPagina: pagina 1 comeca em 0, pagina 23 termina em 1149", () => {
    expect(faixaDaPagina(1, 50)).toEqual({ de: 0, ate: 49 });
    expect(faixaDaPagina(23, 50)).toEqual({ de: 1100, ate: 1149 });
  });

  it("janelaDePaginas: poucas paginas mostra todas", () => {
    expect(janelaDePaginas(1, 1)).toEqual([1]);
    expect(janelaDePaginas(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("janelaDePaginas: muitas paginas mostra bordas + vizinhas", () => {
    expect(janelaDePaginas(1, 23)).toEqual([1, 2, "…", 22, 23]);
    expect(janelaDePaginas(12, 23)).toEqual([1, 2, "…", 11, 12, 13, "…", 22, 23]);
    expect(janelaDePaginas(23, 23)).toEqual([1, 2, "…", 22, 23]);
  });

  it("sanitizarBuscaParaIlike: virgula e barra viram espaco, resto passa", () => {
    expect(sanitizarBuscaParaIlike("saco de lixo")).toBe("saco de lixo");
    expect(sanitizarBuscaParaIlike("a,b\\c")).toBe("a b c");
    expect(sanitizarBuscaParaIlike("  muito   espaco  ")).toBe("muito espaco");
    expect(sanitizarBuscaParaIlike("")).toBe("");
  });

  it("urlDoCatalogo: sem filtro é a URL limpa; página 1 é omitida", () => {
    expect(urlDoCatalogo({})).toBe("/app/products");
    expect(urlDoCatalogo({ pagina: 1 })).toBe("/app/products");
    expect(urlDoCatalogo({ busca: "saco" })).toBe("/app/products?busca=saco");
    expect(urlDoCatalogo({ semFoto: true })).toBe("/app/products?sem_foto=1");
    expect(urlDoCatalogo({ pagina: 3 })).toBe("/app/products?pagina=3");
  });

  it("urlDoCatalogo: trocar de página preserva busca e aba", () => {
    expect(urlDoCatalogo({ busca: "saco de lixo", semFoto: true, pagina: 2 })).toBe(
      "/app/products?busca=saco+de+lixo&sem_foto=1&pagina=2",
    );
  });
});
