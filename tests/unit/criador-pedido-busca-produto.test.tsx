/**
 * CATÁLOGO GRANDE: A BUSCA DO PEDIDO PERGUNTA AO SERVIDOR.
 *
 * A página carrega no máximo 2.000 produtos; acima disso o produto existe no
 * banco e não existe na tela. A busca remota (`/api/v1/products?busca=`) entra
 * como reforço: a lista local responde primeiro e o servidor cobre o que ficou
 * fora do lote. Inativo não entra no pedido, mesmo que o endpoint o devolva.
 */
import * as React from "react";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductSearch } from "@/app/app/pedidos/novo/_produtos";
import type { Produto } from "@/lib/schemas/produtos";
import { apiClient } from "@/lib/api/client";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.mocked(apiClient.get).mockReset();
});

function produto(over: Partial<Produto>): Produto {
  return {
    id: "p1",
    codigo: "CAFE-1",
    nome: "Café torrado 500g",
    marca: "Marca",
    preco_cents: 1990,
    controla_estoque: false,
    quantidade: 0,
    ativo: true,
    ...over,
  } as unknown as Produto;
}

describe("ProductSearch — busca no servidor", () => {
  it("acha produto fora do lote carregado e esconde inativo", async () => {
    const foraDoLote = produto({ id: "fora", codigo: "CAFE-999", nome: "Café Especial 1kg" });
    const inativo = produto({ id: "inativo", codigo: "CAFE-X", nome: "Café Inativo", ativo: false });
    vi.mocked(apiClient.get).mockResolvedValue({ data: [foraDoLote, inativo] } as never);

    render(
      <ProductSearch
        produtos={[]}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={vi.fn()}
        textos={{ produtos: "Produtos", buscarProduto: "Buscar produto" }}
      />,
    );

    // O nome acessível do campo é o que ele FAZ ("Buscar produto"), não a
    // seção ("Produtos") — ver `criador-acessivel.test.tsx`.
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar produto" }), {
      target: { value: "café" },
    });

    await waitFor(() => expect(screen.getByText("Café Especial 1kg")).toBeTruthy());
    expect(screen.queryByText("Café Inativo")).toBeNull();
    expect(vi.mocked(apiClient.get).mock.calls[0]?.[0]).toContain("/api/v1/products?busca=");
  });
});
