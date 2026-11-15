import { describe, expect, it } from "vitest";

import { destinoPertenceACarga } from "./_pertence";

/**
 * A PERGUNTA É DE EXISTÊNCIA, NÃO DE CARDINALIDADE.
 *
 * Em 0308 um destino passou a ser UM por ENDEREÇO: dois pedidos para o mesmo
 * prédio são uma parada só, com duas linhas em `shipment_orders`. As três rotas
 * de destino checavam pertencimento com `maybeSingle()`, que devolve erro de
 * cardinalidade quando há mais de uma linha — e a rota traduzia esse erro para
 * "Destino não pertence a esta carga" (422). Ou seja: a confirmação do motorista
 * falhava justamente na parada com mais de um pedido, que é o caso comum.
 *
 * O cliente falso devolve exatamente o que o PostgREST devolve nos dois casos —
 * lista de N linhas —, e é isso que separa `limit(1)` + tamanho de
 * `maybeSingle()`.
 */

interface Filtro {
  coluna: string;
  valor: unknown;
}

function fakeSupabase(resposta: { data: unknown; error: unknown }, filtros: Filtro[] = []) {
  const encadeado = {
    select: () => encadeado,
    eq: (coluna: string, valor: unknown) => {
      filtros.push({ coluna, valor });
      return encadeado;
    },
    limit: () => encadeado,
    then: (resolver: (v: unknown) => unknown) => resolver(resposta),
  };
  return { from: () => encadeado } as never;
}

describe("destinoPertenceACarga", () => {
  const ids = { orgId: "org-1", shipmentId: "ship-1", destinationId: "dest-1" };

  it("aceita destino com DOIS pedidos — o caso que o maybeSingle recusava", async () => {
    const filtros: Filtro[] = [];
    const ok = await destinoPertenceACarga(
      fakeSupabase({ data: [{ id: "so-1" }], error: null }, filtros),
      ids,
    );
    expect(ok).toBe(true);
    // A query filtra pelos três campos: sem o de organização, um id adivinhado
    // vazaria existência entre tenants.
    expect(filtros.map((f) => f.coluna)).toEqual([
      "destination_id",
      "shipment_id",
      "organization_id",
    ]);
  });

  it("recusa destino sem pedido nesta carga", async () => {
    expect(await destinoPertenceACarga(fakeSupabase({ data: [], error: null }), ids)).toBe(false);
    expect(await destinoPertenceACarga(fakeSupabase({ data: null, error: null }), ids)).toBe(false);
  });

  it("recusa quando a leitura falha — fail-closed", async () => {
    expect(
      await destinoPertenceACarga(fakeSupabase({ data: null, error: { message: "boom" } }), ids),
    ).toBe(false);
  });
});
