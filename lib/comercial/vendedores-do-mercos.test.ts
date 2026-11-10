/**
 * A lista de vendedores do Mercos não pode parar na primeira página do
 * PostgREST.
 *
 * ═══ O QUE ESTE ARQUIVO TRAVA ═════════════════════════════════════════════
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição (medido: `limit=20000`
 * devolve 1000). A organização real tem 11.768 pedidos Mercos; uma consulta
 * única ordenada por data trazia 4 dos 9 vendedores. Estes testes travam a
 * varredura completa, a deduplicação e o truncamento declarado.
 */
import { describe, expect, it, vi } from "vitest";

import {
  PAGINA_DE_VENDEDORES,
  TETO_DE_PEDIDOS,
  vendedoresDoMercos,
} from "./vendedores-do-mercos";

function fonte(total: number, nomes: Array<string | null>) {
  const paginas: Array<[number, number]> = [];
  return {
    paginas,
    contar: async () => total,
    pagina: async (de: number, ate: number) => {
      paginas.push([de, ate]);
      return nomes;
    },
  };
}

describe("vendedores do Mercos", () => {
  it("não consulta página quando não há pedido", async () => {
    const f = fonte(0, []);
    const resultado = await vendedoresDoMercos(f);

    expect(resultado).toEqual({ nomes: [], truncado: false, lidos: 0 });
    expect(f.paginas).toEqual([]);
  });

  it("varre todas as páginas — não para nas 1000 primeiras do PostgREST", async () => {
    const total = 11_768;
    const f = fonte(total, ["VENDEDOR JB"]);
    await vendedoresDoMercos(f);

    const esperadas = Math.ceil(total / PAGINA_DE_VENDEDORES);
    expect(f.paginas).toHaveLength(esperadas);
    expect(f.paginas[0]).toEqual([0, PAGINA_DE_VENDEDORES - 1]);
    // A última fatia termina na última linha, não num múltiplo cego.
    expect(f.paginas.at(-1)).toEqual([
      (esperadas - 1) * PAGINA_DE_VENDEDORES,
      total - 1,
    ]);
  });

  it("deduplica, descarta vazio e preserva a ordem da varredura", async () => {
    const f = fonte(3, ["VICTOR", "  JOÃO  ", "VICTOR", null, "   "]);
    const resultado = await vendedoresDoMercos(f);

    expect(resultado.nomes).toEqual(["VICTOR", "JOÃO"]);
    expect(resultado.truncado).toBe(false);
    expect(resultado.lidos).toBe(3);
  });

  it("declara o truncamento quando o teto de segurança corta a lista", async () => {
    const f = fonte(TETO_DE_PEDIDOS + 5_000, ["VENDEDOR JB"]);
    const resultado = await vendedoresDoMercos(f);

    expect(f.paginas).toHaveLength(Math.ceil(TETO_DE_PEDIDOS / PAGINA_DE_VENDEDORES));
    expect(f.paginas.at(-1)?.[1]).toBe(TETO_DE_PEDIDOS - 1);
    expect(resultado.truncado).toBe(true);
    expect(resultado.lidos).toBe(TETO_DE_PEDIDOS);
  });

  it("não inventa nome quando a página vem vazia por erro de leitura", async () => {
    const contar = vi.fn(async () => 5_000);
    const pagina = vi.fn(async () => [] as Array<string | null>);
    const resultado = await vendedoresDoMercos({ contar, pagina });

    expect(resultado.nomes).toEqual([]);
    expect(resultado.lidos).toBe(5_000);
    expect(pagina).toHaveBeenCalledTimes(5);
  });
});
