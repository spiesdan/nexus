/**
 * A URL DOS FILTROS NÃO PODE LEVAR A OUTRA ROTA NEM APAGAR O QUE É DE OUTRA TELA.
 *
 * ─── O DEFEITO, MEDIDO (F-27, 17/11/2026) ────────────────────────────────
 *
 * Na tela de Empresas, o efeito que sincroniza filtros com a URL montava a query
 * do zero e escrevia caminho fixo: `router.replace("/app/prospeccao?...")`. Mas
 * `/app/prospeccao` é alias que redireciona para
 * `/app/campanhas?subtela=prospeccao`. Medido no navegador: clicar na aba
 * "Empresas" selecionava, e **500 ms depois voltava para "Campanhas"**; o nó do
 * `tablist` era substituído (marca posta no DOM desaparecia) — remontagem
 * causada pela navegação para o alias. O mapa nunca aparecia, porque a aba que
 * o contém nunca ficava aberta.
 *
 * Estes casos são a mesma coisa em forma de teste: a URL final tem de
 *   (a) continuar na rota de quem chamou (nada de alias),
 *   (b) preservar `subtela`/`aba` e qualquer chave de outro dono,
 *   (c) trocar só as chaves de filtro,
 *   (d) ser idempotente — sem isso o efeito dispara `replace` em laço.
 */
import { describe, expect, it } from "vitest";

import { CHAVES_DOS_FILTROS, montarUrlDosFiltros } from "@/lib/prospeccao/url-dos-filtros";

const VAZIO = {
  buscaId: null,
  busca: "",
  categorias: [],
  cidade: "",
  estado: "",
  status: "",
  notaMin: "",
  comTelefone: false,
  comWebsite: false,
  comWhatsapp: false,
  soSemCliente: false,
  minhaFila: false,
  ordem: "relevancia",
  selecionadoId: null,
};

const params = (busca: string) => new URLSearchParams(busca);

describe("montarUrlDosFiltros", () => {
  it("mantém a rota real — o alias é o defeito medido", () => {
    const url = montarUrlDosFiltros(
      "/app/campanhas",
      params("subtela=prospeccao&aba=empresas"),
      VAZIO,
    );

    expect(url.startsWith("/app/campanhas?")).toBe(true);
    expect(url).not.toContain("/app/prospeccao");
  });

  it("preserva as chaves que não são dos filtros", () => {
    const url = montarUrlDosFiltros(
      "/app/campanhas",
      params("subtela=prospeccao&aba=empresas&utm=discord"),
      VAZIO,
    );
    const qs = new URLSearchParams(url.split("?")[1]);

    expect(qs.get("subtela")).toBe("prospeccao");
    expect(qs.get("aba")).toBe("empresas");
    expect(qs.get("utm")).toBe("discord");
  });

  it("escreve os filtros preenchidos e omite os vazios", () => {
    const url = montarUrlDosFiltros(
      "/app/campanhas",
      params("subtela=prospeccao"),
      {
        ...VAZIO,
        busca: "  padaria  ",
        categorias: ["Restaurante", "Mercado"],
        cidade: "Videira",
        estado: "sc",
        status: "nova",
        notaMin: "4",
        comTelefone: true,
        comWhatsapp: true,
        soSemCliente: true,
        minhaFila: true,
        ordem: "nota",
        selecionadoId: "abc-123",
      },
    );
    const qs = new URLSearchParams(url.split("?")[1]);

    expect(qs.get("busca")).toBe("padaria");
    expect(qs.getAll("categoria")).toEqual(["Restaurante", "Mercado"]);
    expect(qs.get("cidade")).toBe("Videira");
    expect(qs.get("estado")).toBe("sc");
    expect(qs.get("status")).toBe("nova");
    expect(qs.get("nota_min")).toBe("4");
    expect(qs.get("com_telefone")).toBe("true");
    expect(qs.get("com_whatsapp")).toBe("true");
    expect(qs.get("so_sem_cliente")).toBe("true");
    expect(qs.get("minha_fila")).toBe("true");
    expect(qs.get("ordem")).toBe("nota");
    expect(qs.get("empresa")).toBe("abc-123");
  });

  it("limpar o filtro TIRA a chave da URL (não deixa `?busca=`)", () => {
    const comFiltro = params("subtela=prospeccao&busca=padaria&cidade=Videira&empresa=x");
    const url = montarUrlDosFiltros("/app/campanhas", comFiltro, VAZIO);
    const qs = new URLSearchParams(url.split("?")[1]);

    for (const chave of CHAVES_DOS_FILTROS) expect(qs.has(chave), chave).toBe(false);
    expect(qs.get("subtela")).toBe("prospeccao");
  });

  it("é idempotente: aplicar duas vezes dá a MESMA string", () => {
    const recorte = { ...VAZIO, cidade: "Videira", categorias: ["Padaria"] };
    const uma = montarUrlDosFiltros("/app/campanhas", params("subtela=prospeccao"), recorte);
    const duas = montarUrlDosFiltros(
      "/app/campanhas",
      new URLSearchParams(uma.split("?")[1]),
      recorte,
    );

    // Se isto quebrar, o efeito da tela dispara `router.replace` a cada render.
    expect(duas).toBe(uma);
  });

  it("sem query nenhuma, devolve só o caminho", () => {
    expect(montarUrlDosFiltros("/app/campanhas", params(""), VAZIO)).toBe("/app/campanhas");
  });
});
