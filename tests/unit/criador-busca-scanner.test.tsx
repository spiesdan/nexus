/**
 * MATRIZ E · 1 — BUSCA DE CLIENTE E PRODUTO: CÓDIGO, SKU AMBÍGUO E SCANNER.
 *
 * O defeito que estes casos travam foi medido no editor: o `Enter` da busca de
 * produto lançava `filtrados[destaque]` — **o primeiro da lista** — com qualquer
 * termo. Bipar um EAN que não existe, num catálogo onde outro produto casa por
 * trecho, lançava o produto errado; e digitar três letras e teclar Enter
 * vendia o primeiro café do catálogo sem ninguém escolher.
 *
 * A regra que ficou: o Enter do scanner confirma o que é **inequívoco** —
 * código EXATO, ou resultado ÚNICO. Com vários candidatos, quem escolhe é a
 * pessoa (↑↓ ou clique), e a tela diz por que nada foi lançado.
 *
 * EAN mora em `codigo` de propósito: não há coluna `ean` em `catalog_products`
 * e criar uma segunda identidade para o mesmo produto é o "Duplicar" que a
 * doutrina DIRC proíbe. A prova abaixo bipa o código na íntegra, com zeros à
 * esquerda preservados — normalizar EAN é como trocar um produto por outro.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

import { ProductSearch } from "@/app/app/pedidos/novo/_produtos";
import { CustomerSelector } from "@/app/app/pedidos/novo/_cliente";
import type { Produto } from "@/lib/schemas/produtos";
import { apiClient } from "@/lib/api/client";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));

beforeEach(() => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
});

afterEach(() => {
  cleanup();
  vi.mocked(apiClient.get).mockReset();
});

function produto(over: Partial<Produto>): Produto {
  return {
    id: "p1",
    codigo: "P1",
    nome: "Produto um",
    marca: null,
    categoria: null,
    preco_cents: 1000,
    moeda: "BRL",
    custo_cents: null,
    controla_estoque: false,
    quantidade: 0,
    ativo: true,
    unidade: "un",
    multiplo: 1,
    ...over,
  } as unknown as Produto;
}

function montarBusca(produtos: Produto[], aoAdicionar = vi.fn()) {
  render(
    <ProductSearch
      produtos={produtos}
      tabela={null}
      ultimosPrecos={new Map()}
      inputRef={React.createRef<HTMLInputElement>()}
      aoAdicionar={aoAdicionar}
      textos={{ produtos: "Produtos", buscarProduto: "Buscar produto" }}
    />,
  );
  return { campo: screen.getByRole("combobox", { name: "Buscar produto" }) as HTMLInputElement, aoAdicionar };
}

async function digitar(campo: HTMLInputElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } });
  // O componente tem debounce de 150 ms; esperar a lista aparecer é o que
  // garante que o Enter está medindo o estado que a pessoa está vendo.
  await waitFor(() => expect(campo.value).toBe(valor));
  await new Promise((r) => setTimeout(r, 180));
}

describe("acessibilidade da busca", () => {
  it("é combobox de verdade: listbox, options e aria-selected no ↑↓", () => {
    // A lista não é um monte de botões para o leitor de tela: é um listbox de
    // opções, e o ↑↓ move o `aria-activedescendant`/`aria-selected` — é assim
    // que quem não vê a tela sabe qual produto o Enter vai lançar.
    const { campo } = montarBusca([
      produto({ id: "p-1", codigo: "P1", nome: "Produto teste" }),
      produto({ id: "p-2", codigo: "P2", nome: "Produto teste 2" }),
    ]);

    fireEvent.change(campo, { target: { value: "produto" } });

    return waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
      expect(campo.getAttribute("aria-expanded")).toBe("true");
      const opcoes = screen.getAllByRole("option");
      expect(opcoes.length).toBe(2);
      expect(opcoes[0]?.getAttribute("aria-selected")).toBe("true");

      fireEvent.keyDown(campo, { key: "ArrowDown" });
      expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
    });
  });
});

describe("scanner: o código bipado casa o produto", () => {
  it("EAN de 13 dígitos lança 1 unidade do produto certo e limpa a busca", async () => {
    const agua = produto({
      id: "p-agua",
      codigo: "7891234567895",
      nome: "Água sanitária 5 L",
      preco_cents: 1290,
    });
    const { campo, aoAdicionar } = montarBusca([agua, produto({ id: "p-outro", codigo: "X1" })]);

    await digitar(campo, "7891234567895");
    fireEvent.keyDown(campo, { key: "Enter" });

    expect(aoAdicionar).toHaveBeenCalledTimes(1);
    expect(aoAdicionar).toHaveBeenCalledWith(agua, 1);
    expect(campo.value).toBe("");
  });

  it("EAN inexistente não inventa item: a tela diz que não achou e o Enter não lança nada", async () => {
    const { campo, aoAdicionar } = montarBusca([
      produto({ id: "p-agua", codigo: "7891234567895", nome: "Água sanitária 5 L" }),
    ]);

    await digitar(campo, "7890000000000");
    expect(screen.getByText("Nenhum produto encontrado.")).toBeTruthy();

    fireEvent.keyDown(campo, { key: "Enter" });
    expect(aoAdicionar).not.toHaveBeenCalled();
    // A busca não é limpa: quem digitou errado precisa ver o que digitou.
    expect(campo.value).toBe("7890000000000");
  });

  it("código exato vence quem casa por trecho", async () => {
    const exato = produto({ id: "p-123", codigo: "123", nome: "Produto 123" });
    const maior = produto({ id: "p-1234", codigo: "1234", nome: "Produto 1234" });
    const { campo, aoAdicionar } = montarBusca([maior, exato]);

    await digitar(campo, "123");
    fireEvent.keyDown(campo, { key: "Enter" });

    expect(aoAdicionar).toHaveBeenCalledWith(exato, 1);
  });
});

describe("SKU ambíguo não escolhe sozinho", () => {
  const cafe1 = produto({ id: "p-1", codigo: "CAF-1", nome: "Café torrado 500g" });
  const cafe2 = produto({ id: "p-2", codigo: "CAF-2", nome: "Café especial 1kg" });
  const cafe3 = produto({ id: "p-3", codigo: "CAF-3", nome: "Café em grão 5kg" });

  it("Enter com três candidatos não lança nada e explica o motivo", async () => {
    const { campo, aoAdicionar } = montarBusca([cafe1, cafe2, cafe3]);

    await digitar(campo, "caf");
    fireEvent.keyDown(campo, { key: "Enter" });

    expect(aoAdicionar).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Vários produtos encontrados — escolha um na lista/),
    ).toBeTruthy();
  });

  it("clique escolhe o produto clicado", async () => {
    const { campo, aoAdicionar } = montarBusca([cafe1, cafe2, cafe3]);

    await digitar(campo, "caf");
    fireEvent.click(screen.getByText("Café especial 1kg"));

    expect(aoAdicionar).toHaveBeenCalledWith(cafe2, 1);
  });

  it("↓ escolhe explicitamente e o Enter confirma o destacado", async () => {
    const { campo, aoAdicionar } = montarBusca([cafe1, cafe2, cafe3]);

    await digitar(campo, "caf");
    fireEvent.keyDown(campo, { key: "ArrowDown" }); // destaca o segundo
    fireEvent.keyDown(campo, { key: "Enter" });

    expect(aoAdicionar).toHaveBeenCalledWith(cafe2, 1);
  });

  it("zeros à esquerda são identidade, não formatação", async () => {
    // "00123" e "1234" casam com o termo "123" por trecho; nenhum é o código
    // exato. Se o filtro normalizasse zeros, o primeiro viraria "exato" e o
    // scanner passaria a lançar um produto que ninguém bipou.
    const comZero = produto({ id: "p-z", codigo: "00123", nome: "Parafuso 1/2" });
    const semZero = produto({ id: "p-n", codigo: "1234", nome: "Parafuso 3/8" });
    const { campo, aoAdicionar } = montarBusca([comZero, semZero]);

    await digitar(campo, "123");
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(aoAdicionar).not.toHaveBeenCalled();
  });
});

describe("busca de cliente: o nome digitado é a busca, e nada é inventado", () => {
  it("acha por telefone e por nome fantasia na lista local", async () => {
    const contatos = [
      {
        id: "c1",
        fantasia: "Bill Higiene",
        display_name: "BILL COMERCIO DE ESTOPAS LTDA",
        name: "BILL COMERCIO DE ESTOPAS LTDA",
        phone_number: "+5531999990000",
        email: null,
      },
    ];
    const aoEscolher = vi.fn();
    render(
      <CustomerSelector
        contatos={contatos}
        contatoId={null}
        clienteNome=""
        aoEscolher={aoEscolher}
        textos={{ cliente: "Cliente", buscarCliente: "Buscar", clienteAvulso: "avulso" }}
      />,
    );

    const campo = screen.getByLabelText("Cliente");
    fireEvent.change(campo, { target: { value: "3199999" } });
    fireEvent.click(screen.getByRole("button", { name: /Bill Higiene/ }));

    expect(aoEscolher).toHaveBeenCalledWith("c1", "Bill Higiene");
  });

  it("cliente sem cadastro continua avulso — e a tela avisa que nada foi encontrado", () => {
    render(
      <CustomerSelector
        contatos={[]}
        contatoId={null}
        clienteNome=""
        aoEscolher={vi.fn()}
        textos={{ cliente: "Cliente", buscarCliente: "Buscar", clienteAvulso: "avulso" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Cliente Novo" } });
    expect(screen.getByText(/Nenhum contato encontrado/)).toBeTruthy();
  });
});
