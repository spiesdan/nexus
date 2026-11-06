import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  indexarCatalogo,
  normalizarChave,
  resolverProdutoDoItem,
  resolverProdutosDosItens,
  type ItemQuePrecisaDeProduto,
  type ProdutoFiscal,
} from "./produto-do-item";

/**
 * O NCM QUE ESTAVA NO CADASTRO E NÃO CHEGAVA NA NOTA.
 *
 * Medido em 06/11/2026, em produção: `Falta NCM do produto "ESPONJA COM 4 UN"`
 * na nota da HAYLA MORANDI. O produto tinha NCM 68053090 no catálogo; o item do
 * pedido tinha `product_id` nulo. Estas invariantes são o que impede o item de
 * texto livre de voltar a emitir sem NCM — e o que impede a correção de virar
 * chute: NCM diferente entre candidatos NÃO é resolvido.
 */

function produto(over: Partial<ProdutoFiscal> & { id: string }): ProdutoFiscal {
  return {
    codigo: null,
    nome: null,
    ativo: true,
    ncm: null,
    cfop: "5102",
    unidade: "UN",
    ...over,
  };
}

const ESPONJA = produto({
  id: "af540210-a3d9-4b48-89da-75ac89ebaf41",
  codigo: "806",
  nome: "ESPONJA COM 4 UN",
  ncm: "68053090",
});

const catalogo = indexarCatalogo([
  ESPONJA,
  produto({ id: "b0000000-0000-4000-8000-000000000001", codigo: "1", nome: "SACO 15L", ncm: "39232100" }),
  // Mesmo nome, NCM igual: são o mesmo produto fiscal (variantes de cadastro).
  produto({ id: "b0000000-0000-4000-8000-000000000002", codigo: "2", nome: "SACO 15L", ncm: "39232100", ativo: false }),
  // Mesmo nome, NCM DIFERENTE: escolher seria chute.
  produto({ id: "c0000000-0000-4000-8000-000000000001", codigo: "3", nome: "PANO MULTIUSO", ncm: "63071000" }),
  produto({ id: "c0000000-0000-4000-8000-000000000002", codigo: "4", nome: "PANO MULTIUSO", ncm: "63079010" }),
]);

describe("normalizarChave", () => {
  it("é a mesma régua do backfill: maiúsculas e espaços colapsados", () => {
    expect(normalizarChave("  esponja   com 4 un ")).toBe("ESPONJA COM 4 UN");
    expect(normalizarChave(null)).toBe("");
    expect(normalizarChave(undefined)).toBe("");
  });
});

describe("resolverProdutoDoItem", () => {
  it("o vínculo explícito manda, mesmo quando código e nome apontam para outro", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: "b0000000-0000-4000-8000-000000000001",
      produto_codigo: "806",
      produto_nome: "ESPONJA COM 4 UN",
    });
    expect(r?.por).toBe("id");
    expect(r?.produto.id).toBe("b0000000-0000-4000-8000-000000000001");
  });

  it("com product_id nulo, o código acha o produto — era este o buraco", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: null,
      produto_codigo: "806",
      produto_nome: "ESPONJA COM 4 UN",
    });
    expect(r?.por).toBe("codigo");
    expect(r?.produto.ncm).toBe("68053090");
  });

  it("código com espaços/caixa diferentes ainda casa", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: null,
      produto_codigo: " 806 ",
      produto_nome: null,
    });
    expect(r?.produto.id).toBe(ESPONJA.id);
  });

  it("sem código, o nome acha o produto", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: null,
      produto_codigo: null,
      produto_nome: "esponja com 4 un",
    });
    expect(r?.por).toBe("nome");
    expect(r?.produto.ncm).toBe("68053090");
  });

  it("vínculo apontando para produto que sumiu cai para o cadastro", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: "sumiu-0000-4000-8000-000000000000",
      produto_codigo: "806",
      produto_nome: "ESPONJA COM 4 UN",
    });
    expect(r?.por).toBe("codigo");
  });

  it("ambiguidade com o MESMO NCM é aceita, preferindo o ativo", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: null,
      produto_codigo: null,
      produto_nome: "SACO 15L",
    });
    expect(r?.produto.id).toBe("b0000000-0000-4000-8000-000000000001");
    expect(r?.produto.ncm).toBe("39232100");
  });

  it("ambiguidade com NCMs DIFERENTES não é resolvida — não se chuta NCM", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: null,
      produto_codigo: null,
      produto_nome: "PANO MULTIUSO",
    });
    expect(r).toBeNull();
  });

  it("produto inexistente continua sem NCM (a rejeição nomeia o item)", () => {
    const r = resolverProdutoDoItem(catalogo, {
      product_id: null,
      produto_codigo: "9999",
      produto_nome: "PRODUTO QUE NINGUÉM CADASTROU",
    });
    expect(r).toBeNull();
  });
});

/** Stub mínimo do client Supabase: só a cadeia que o resolvedor usa. */
function clienteFalso(produtos: ProdutoFiscal[]): {
  client: SupabaseClient;
  chamadas: string[];
} {
  const chamadas: string[] = [];
  const client = {
    from(tabela: string) {
      chamadas.push(`from:${tabela}`);
      let ids: string[] | null = null;
      let de = 0;
      let ate = Number.MAX_SAFE_INTEGER;
      const consulta = {
        select(colunas: string) {
          chamadas.push(`select:${colunas}`);
          return consulta;
        },
        eq() {
          return consulta;
        },
        order() {
          return consulta;
        },
        in(_coluna: string, valores: string[]) {
          ids = valores;
          chamadas.push(`in:${valores.length}`);
          return consulta;
        },
        range(inicio: number, fim: number) {
          de = inicio;
          ate = fim;
          chamadas.push(`range:${inicio}`);
          return consulta;
        },
        then(resolve: (v: unknown) => unknown) {
          const linhas = (ids ? produtos.filter((p) => ids!.includes(p.id)) : produtos).slice(
            de,
            ate === Number.MAX_SAFE_INTEGER ? undefined : ate + 1,
          );
          return Promise.resolve({ data: linhas, error: null }).then(resolve);
        },
      };
      return consulta;
    },
  };
  return { client: client as unknown as SupabaseClient, chamadas };
}

describe("resolverProdutosDosItens", () => {
  const item = (over: Partial<ItemQuePrecisaDeProduto>): ItemQuePrecisaDeProduto => ({
    product_id: null,
    produto_codigo: null,
    produto_nome: null,
    ...over,
  });

  it("sem itens, não consulta nada", async () => {
    const { client, chamadas } = clienteFalso([]);
    await expect(resolverProdutosDosItens(client, "org", [])).resolves.toEqual([]);
    expect(chamadas).toEqual([]);
  });

  it("todos vinculados: uma query pelos ids e nenhuma varredura do catálogo", async () => {
    const { client, chamadas } = clienteFalso([ESPONJA]);
    const r = await resolverProdutosDosItens(client, "org", [
      item({ product_id: ESPONJA.id }),
      item({ product_id: ESPONJA.id }),
    ]);
    expect(r.map((p) => p?.ncm)).toEqual(["68053090", "68053090"]);
    expect(chamadas.some((c) => c.startsWith("range:"))).toBe(false);
  });

  it("um item sem vínculo basta para varrer o catálogo — e resolve os dois", async () => {
    const { client, chamadas } = clienteFalso([ESPONJA]);
    const r = await resolverProdutosDosItens(client, "org", [
      item({ product_id: ESPONJA.id }),
      item({ produto_codigo: "806", produto_nome: "ESPONJA COM 4 UN" }),
    ]);
    expect(r[0]?.id).toBe(ESPONJA.id);
    expect(r[1]?.id).toBe(ESPONJA.id);
    expect(chamadas.some((c) => c.startsWith("range:0"))).toBe(true);
  });

  it("catálogo maior que a página do PostgREST é lido até o fim", async () => {
    // 1005 produtos: o item procurado mora na SEGUNDA página. Sem paginar,
    // ele continuaria "sem NCM" — o mesmo erro, só que silencioso.
    const grande: ProdutoFiscal[] = Array.from({ length: 1004 }, (_, i) =>
      produto({
        id: `d${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`,
        codigo: `X${i}`,
        nome: `PRODUTO ${i}`,
        ncm: "39232100",
      }),
    );
    grande.push(ESPONJA);
    const { client, chamadas } = clienteFalso(grande);

    const r = await resolverProdutosDosItens(client, "org", [item({ produto_codigo: "806" })]);
    expect(r[0]?.ncm).toBe("68053090");
    expect(chamadas.filter((c) => c.startsWith("range:")).length).toBe(2);
  });
});
