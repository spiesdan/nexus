import { describe, expect, it } from "vitest";

import { lerEmPaginas, PAGINA_DO_POSTGREST } from "./paginas";

/**
 * O fake REPRODUZ o corte do PostgREST: sem `range` ele devolve no máximo 1000
 * linhas. É o defeito que o helper existe para cobrir, não um detalhe do mock.
 */
function tabelaFalsa(total: number, falharNaPagina?: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidos: Array<{ de: number; ate: number }> = [];
  return {
    linhas,
    pedidos,
    consulta: (de: number, ate: number) => {
      pedidos.push({ de, ate });
      if (falharNaPagina !== undefined && pedidos.length === falharNaPagina) {
        return Promise.resolve({ data: null, error: { message: "indisponível" } });
      }
      const fatia = ate - de + 1 > PAGINA_DO_POSTGREST
        ? linhas.slice(de, de + PAGINA_DO_POSTGREST)
        : linhas.slice(de, ate + 1);
      return Promise.resolve({ data: fatia, error: null });
    },
  };
}

describe("lerEmPaginas", () => {
  it("lê além da primeira página do PostgREST", async () => {
    const t = tabelaFalsa(1002);
    const { linhas, erro } = await lerEmPaginas<{ id: number }>(t.consulta);

    expect(erro).toBeNull();
    expect(linhas).toHaveLength(1002);
    // A última linha só existe se a segunda página foi pedida.
    expect(linhas.at(-1)).toEqual({ id: 1001 });
    expect(t.pedidos).toEqual([
      { de: 0, ate: 999 },
      { de: 1000, ate: 1999 },
    ]);
  });

  it("múltiplo exato da página fecha na resposta vazia, sem duplicar", async () => {
    const t = tabelaFalsa(2000);
    const { linhas, erro } = await lerEmPaginas<{ id: number }>(t.consulta);

    expect(erro).toBeNull();
    expect(linhas).toHaveLength(2000);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(2000);
    // Duas cheias + uma vazia: é a vazia que prova o fim.
    expect(t.pedidos).toHaveLength(3);
  });

  it("erro numa página devolve o que leu e o erro — nunca metade como se fosse o todo", async () => {
    const t = tabelaFalsa(1500, 2);
    const { linhas, erro } = await lerEmPaginas<{ id: number }>(t.consulta);

    expect(erro).toEqual({ message: "indisponível" });
    expect(linhas).toHaveLength(1000);
  });

  it("tabela vazia faz uma única consulta", async () => {
    const t = tabelaFalsa(0);
    const { linhas, erro } = await lerEmPaginas<{ id: number }>(t.consulta);

    expect(erro).toBeNull();
    expect(linhas).toEqual([]);
    expect(t.pedidos).toHaveLength(1);
  });

  it("teto de memória para com erro em vez de entregar um recorte silencioso", async () => {
    const t = tabelaFalsa(2500);
    const { linhas, erro } = await lerEmPaginas<{ id: number }>(t.consulta, { teto: 2000 });

    expect(erro).toEqual({ message: "acima de 2000 linhas" });
    // O chamador (o motor) transforma o erro em `ledger_indisponivel`; o que
    // não pode acontecer é voltar 2000 linhas como se fossem o ledger inteiro.
    expect(linhas.length).toBeGreaterThan(2000);
  });
});
