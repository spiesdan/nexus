/**
 * MATRIZ E · 2 — ESCALA: 500+ contatos e 500+ produtos.
 *
 * Duas perguntas diferentes, e as duas precisam de prova:
 *
 *  1. **A busca responde?** A lista local é filtrada a cada tecla; com 600
 *     itens isso não pode travar o campo. Aqui se mede o tempo de uma rajada de
 *     teclas e se confere que a lista exibida continua curta (8).
 *  2. **O catálogo inteiro vai para o browser?** Vai um LOTE limitado (2.000
 *     produtos, 500 contatos) — o resto é coberto pela busca no servidor. O
 *     teste lê a página para prender o teto: sem ele, "catálogo grande" volta a
 *     ser um carregamento único que ninguém mediu.
 *
 * O teto de 2.000 não é decorativo: a instalação real tinha 635 produtos e o
 * `.limit(500)` fixo escondia 135 deles (`tests/unit/products-limite.test.ts`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

import { ProductSearch, filtrarProdutos } from "@/app/app/pedidos/novo/_produtos";
import { CustomerSelector, filtrarContatos } from "@/app/app/pedidos/novo/_cliente";
import type { Produto } from "@/lib/schemas/produtos";
import { apiClient } from "@/lib/api/client";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));

const QUANTOS = 600;

function catalogo(): Produto[] {
  return Array.from({ length: QUANTOS }, (_, i) => ({
    id: `p-${i}`,
    codigo: `AGUA-${String(i).padStart(4, "0")}`,
    nome: `Água sanitária ${i} L`,
    marca: "Marca",
    categoria: "Limpeza",
    preco_cents: 1000 + i,
    moeda: "BRL",
    custo_cents: null,
    controla_estoque: false,
    quantidade: 0,
    ativo: true,
    unidade: "un",
    multiplo: 1,
  })) as unknown as Produto[];
}

function carteira() {
  return Array.from({ length: QUANTOS }, (_, i) => ({
    id: `c-${i}`,
    fantasia: `Cliente ${i}`,
    display_name: `CLIENTE ${i} LTDA`,
    name: `CLIENTE ${i} LTDA`,
    phone_number: `+55319${String(i).padStart(7, "0")}`,
    email: null,
  }));
}

beforeEach(() => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
});

afterEach(() => {
  cleanup();
  vi.mocked(apiClient.get).mockReset();
});

describe("600 produtos: a busca continua respondendo", () => {
  it("uma rajada de teclas filtra sem travar e a lista nunca passa de 8", async () => {
    render(
      <ProductSearch
        produtos={catalogo()}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={vi.fn()}
        textos={{ produtos: "Produtos", buscarProduto: "Buscar produto" }}
      />,
    );
    const campo = screen.getByLabelText("Produtos");

    for (const termo of ["a", "ág", "águ", "água", "água ", "água s", "água sa"]) {
      fireEvent.change(campo, { target: { value: termo } });
    }
    // O resultado da busca é `option` dentro do combobox (nome acessível de
    // gente), não `button`: a régua é a mesma, o papel é o correto.
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));

    // 8 é o teto de linhas exibidas: um catálogo grande não pode virar uma
    // lista de 600 opções na tela do celular do vendedor.
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(8);

    // O TEMPO é medido na função que a tela chama, sem `waitFor`/React no meio:
    // cronometrar o render fazia a régua medir a carga da máquina (3 s num run
    // com outros builds) em vez do algoritmo. 50 buscas em 600 produtos —
    // ~2,5 mil buscas por segundo é o piso; 500 ms é folga larga.
    const produtos = catalogo();
    const inicio = performance.now();
    for (let i = 0; i < 50; i++) filtrarProdutos(produtos, "água sa");
    expect(performance.now() - inicio).toBeLessThan(500);
  });

  it("a rajada vira UMA consulta ao servidor, não uma por tecla", async () => {
    render(
      <ProductSearch
        produtos={catalogo()}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={vi.fn()}
        textos={{ produtos: "Produtos", buscarProduto: "Buscar produto" }}
      />,
    );
    const campo = screen.getByLabelText("Produtos");
    const get = vi.mocked(apiClient.get);
    get.mockClear();

    for (const termo of ["ag", "agu", "agua", "agua s", "agua sa"]) {
      fireEvent.change(campo, { target: { value: termo } });
    }
    await waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 400));

    expect(get).toHaveBeenCalledTimes(1);
    expect(String(get.mock.calls[0]?.[0])).toContain("limite=12");
  });

  it("scanner: código exato FORA do lote carregado entra pelo servidor", async () => {
    // O bip chega e o Enter vem antes dos 150 ms do debounce remoto. Sem a
    // leitura por chave no Enter, um produto que existe mas não está nos 2.000
    // carregados responderia "não encontrado" — e o vendedor cadastraria de
    // novo, duplicando o catálogo.
    const fora = {
      id: "p-fora-scanner",
      codigo: "7899999999999",
      nome: "Produto fora do lote (scanner)",
      marca: null,
      categoria: null,
      preco_cents: 1290,
      moeda: "BRL",
      controla_estoque: false,
      quantidade: 0,
      ativo: true,
      unidade: "un",
      multiplo: 1,
    } as unknown as Produto;
    vi.mocked(apiClient.get).mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes("7899999999999")
          ? { data: [fora] }
          : { data: [] },
      ) as never,
    );

    const aoAdicionar = vi.fn();
    render(
      <ProductSearch
        produtos={catalogo()}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={aoAdicionar}
        textos={{ produtos: "Produtos", buscarProduto: "Buscar produto" }}
      />,
    );
    const campo = screen.getByLabelText("Produtos");

    fireEvent.change(campo, { target: { value: "7899999999999" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    await waitFor(() => expect(aoAdicionar).toHaveBeenCalledWith(fora, 1));
    expect(aoAdicionar).toHaveBeenCalledTimes(1);
  });

  it("produto fora do lote carregado é achado pela busca remota", async () => {
    // O caso que a página não pode resolver sozinha: o produto existe no banco
    // e não está entre os 2.000 carregados.
    const fora = {
      id: "p-fora",
      codigo: "7891234567895",
      nome: "Água sanitária 5 L (fora do lote)",
      marca: null,
      preco_cents: 1290,
      moeda: "BRL",
      controla_estoque: false,
      quantidade: 0,
      ativo: true,
      unidade: "un",
      multiplo: 1,
    } as unknown as Produto;
    vi.mocked(apiClient.get).mockResolvedValue({ data: [fora] } as never);

    render(
      <ProductSearch
        produtos={catalogo()}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={vi.fn()}
        textos={{ produtos: "Produtos", buscarProduto: "Buscar produto" }}
      />,
    );
    const campo = screen.getByLabelText("Produtos");

    fireEvent.change(campo, { target: { value: "7891234567895" } });
    await waitFor(() => expect(screen.getByText("Água sanitária 5 L (fora do lote)")).toBeTruthy());
  });
});

describe("600 contatos: o seletor continua respondendo", () => {
  it("filtra a carteira a cada tecla e mostra no máximo 8 opções", async () => {
    render(
      <CustomerSelector
        contatos={carteira()}
        contatoId={null}
        clienteNome=""
        aoEscolher={vi.fn()}
        textos={{ cliente: "Cliente", buscarCliente: "Buscar", clienteAvulso: "avulso" }}
      />,
    );
    const campo = screen.getByLabelText("Cliente");

    for (const termo of ["c", "cl", "cli", "clie", "client", "cliente 5", "cliente 599"]) {
      fireEvent.change(campo, { target: { value: termo } });
    }

    // "cliente 599" é um só; a lista não pode ter 600 botões.
    const opcoes = screen.getAllByRole("button").filter((b) => /Cliente \d/.test(b.textContent ?? ""));
    expect(opcoes.length).toBeLessThanOrEqual(8);
    expect(opcoes.length).toBeGreaterThan(0);

    const carteiraLocal = carteira();
    const inicio = performance.now();
    for (let i = 0; i < 50; i++) filtrarContatos(carteiraLocal, [], "cliente 599");
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});

describe("o browser não recebe o catálogo inteiro", () => {
  it("a página pede lote limitado e a busca do produto pergunta ao servidor o resto", () => {
    const raiz = process.cwd();
    const pagina = readFileSync(path.join(raiz, "app/app/pedidos/novo/page.tsx"), "utf8");
    const busca = readFileSync(path.join(raiz, "app/app/pedidos/novo/_produtos.tsx"), "utf8");

    // Tetos explícitos. Se alguém trocar por um carregamento sem limite, este
    // teste reprova antes de a tela de um cliente com 20 mil produtos cair.
    expect(pagina).toContain(".limit(2000)");
    expect(pagina).toContain(".limit(500)");
    // ... e o que ficou fora do lote chega por aqui.
    expect(busca).toContain("/api/v1/products?busca=");
    expect(busca).toContain("limite=12");
  });
});
