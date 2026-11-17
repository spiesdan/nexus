/**
 * O AJUSTE DE ESTOQUE — compare-and-swap, não read-modify-write.
 *
 * O defeito que isto prende: dois caminhos liam o saldo, calculavam e
 * gravavam o valor absoluto. A segunda gravação apagava a primeira — baixa de
 * pedido e entrada de compra sumiam em concorrência, e o `check (quantidade >=
 * 0)` do banco transformava a corrida em baixa silenciosa.
 *
 * O dublê abaixo aplica a mesma regra do PostgREST: o UPDATE só vale se o
 * saldo ainda for o que foi lido. A primeira tentativa pode falhar de
 * propósito (escrita concorrente) para provar o retry.
 */
import { describe, expect, it } from "vitest";

import { ajustarEstoque } from "@/lib/estoque/ajustar";

function banco(
  inicial: { quantidade: number; controla_estoque: boolean },
  opcoes: { conflitoNaPrimeira?: boolean; existe?: boolean } = {},
) {
  const estado = { ...inicial };
  let tentativasDeUpdate = 0;
  const client = {
    from(tabela: string) {
      if (tabela !== "catalog_products") throw new Error(`tabela inesperada: ${tabela}`);
      let op: "select" | "update" = "select";
      let valores: Record<string, unknown> = {};
      const filtros: Record<string, unknown> = {};
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtros[c] = v;
          return q;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: opcoes.existe === false ? null : { ...estado },
            error: null,
          }),
        update: (v: Record<string, unknown>) => {
          op = "update";
          valores = v;
          return q;
        },
        then: (resolve: (r: unknown) => unknown) => {
          if (op !== "update") return Promise.resolve(resolve({ data: null, error: null }));
          tentativasDeUpdate += 1;
          if (opcoes.conflitoNaPrimeira && tentativasDeUpdate === 1) {
            // Outro processo gravou entre a leitura e a escrita.
            estado.quantidade += 1;
            return Promise.resolve(resolve({ data: [], error: null }));
          }
          if (filtros.quantidade !== estado.quantidade) {
            return Promise.resolve(resolve({ data: [], error: null }));
          }
          estado.quantidade = Number(valores.quantidade);
          return Promise.resolve(resolve({ data: [{ quantidade: estado.quantidade }], error: null }));
        },
      };
      return q;
    },
  };
  return { client: client as never, estado };
}

const ORG = "22222222-2222-4222-8222-222222222222";
const PROD = "44444444-4444-4444-8444-444444444444";

describe("ajustarEstoque", () => {
  it("baixa o saldo", async () => {
    const { client, estado } = banco({ quantidade: 10, controla_estoque: true });
    const r = await ajustarEstoque(client, { organizationId: ORG, productId: PROD, delta: -2 });
    expect(r).toEqual({ ok: true, saldo: 8 });
    expect(estado.quantidade).toBe(8);
  });

  it("recusa deixar o saldo negativo", async () => {
    const { client, estado } = banco({ quantidade: 3, controla_estoque: true });
    const r = await ajustarEstoque(client, { organizationId: ORG, productId: PROD, delta: -10 });
    expect(r).toEqual({ ok: false, motivo: "estoque_insuficiente" });
    expect(estado.quantidade).toBe(3);
  });

  it("produto que não controla estoque é no-op", async () => {
    const { client, estado } = banco({ quantidade: 3, controla_estoque: false });
    const r = await ajustarEstoque(client, { organizationId: ORG, productId: PROD, delta: -10 });
    expect(r).toEqual({ ok: true, saldo: 3 });
    expect(estado.quantidade).toBe(3);
  });

  it("perde a primeira escrita para um concorrente e tenta de novo", async () => {
    // O concorrente somou 1 (10 → 11); a nossa baixa de 2 precisa aplicar
    // sobre 11, não sobre 10. O resultado tem de ser 9, não 8.
    const { client, estado } = banco(
      { quantidade: 10, controla_estoque: true },
      { conflitoNaPrimeira: true },
    );
    const r = await ajustarEstoque(client, { organizationId: ORG, productId: PROD, delta: -2 });
    expect(r).toEqual({ ok: true, saldo: 9 });
    expect(estado.quantidade).toBe(9);
  });

  it("produto inexistente", async () => {
    const { client } = banco({ quantidade: 0, controla_estoque: true }, { existe: false });
    const r = await ajustarEstoque(client, { organizationId: ORG, productId: PROD, delta: 1 });
    expect(r).toEqual({ ok: false, motivo: "nao_encontrado" });
  });
});
