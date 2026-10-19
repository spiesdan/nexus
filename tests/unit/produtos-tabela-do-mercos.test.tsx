/**
 * A TABELA DE PRODUTOS É A DO MERCOS.
 *
 * A tela deixou de ser cartões e virou a grade de lá: uma linha por produto,
 * com Fotos · Código · Nome · IPI · Unidade · Comissão · Preço de Tabela.
 *
 * O que este arquivo cerca — e que é fácil quebrar sem ninguém notar:
 *
 *  1. As SETE colunas aparecem com o nome do Mercos.
 *  2. Campo vazio vira `---`, e não `0`/`0,00 %`: "sem IPI informado" não é
 *     "isento", e a diferença é fiscal.
 *  3. Percentual preenchido sai como `70,00 %`.
 *  4. O rodapé diz "Resultados 1 - 2 de 2" sempre — é ele que responde
 *     "quantos produtos existem" sem somar páginas.
 *  5. O olho da primeira coluna ativa/inativa, e o nome abre a ficha.
 */
import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/app/app/products/_fotos", () => ({ FotosDoProduto: () => null }));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => async () => true,
}));

import type { Produto } from "@/lib/schemas/produtos";

import { ProdutosClient } from "@/app/app/products/_client";

function produto(over: Partial<Produto>): Produto {
  return {
    id: `id-${over.codigo ?? "x"}`,
    codigo: "X",
    nome: "Produto",
    descricao: null,
    marca: null,
    categoria: null,
    preco_cents: 0,
    moeda: "BRL",
    custo_cents: null,
    controla_estoque: true,
    quantidade: 0,
    ativo: true,
    origem: "manual",
    imagem_url: null,
    ncm: null,
    ncm_origem: null,
    unidade: null,
    cfop: null,
    destaque: false,
    preco_promocional_cents: null,
    promocao_ate: null,
    ipi_pct: null,
    comissao_pct: null,
    multiplo: 1,
    observacoes: null,
    peso_bruto_kg: null,
    largura_cm: null,
    altura_cm: null,
    comprimento_cm: null,
    caixa_peso_bruto_kg: null,
    caixa_largura_cm: null,
    caixa_altura_cm: null,
    caixa_comprimento_cm: null,
    variacoes: null,
    updated_at: "2026-10-19T12:00:00Z",
    ...over,
  };
}

function montar(inicial: Produto[], total = inicial.length) {
  return render(
    <ProdutosClient
      inicial={inicial}
      podeEditar
      textos={{ titulo: "Produtos", subtitulo: "", vazio: "Vazio", vazioDica: "" }}
      total={total}
      pagina={1}
      porPagina={50}
      tabelas={[]}
      categorias={[]}
    />,
  );
}

describe("a grade de produtos", () => {
  const agua = produto({
    codigo: "2",
    nome: "AGUA SANITARIA BILL 5 L",
    preco_cents: 1600,
    unidade: "GL",
  });
  const alcool = produto({
    codigo: "7",
    nome: "ALCOOL 70",
    preco_cents: 890,
    unidade: "UN",
    ipi_pct: 5,
    comissao_pct: 70,
  });

  it("tem as sete colunas do Mercos, mais o olho e o +", () => {
    montar([agua, alcool]);
    const tabela = screen.getByTestId("lista-produtos");
    for (const coluna of [
      "Fotos",
      "Código",
      "Nome",
      "IPI",
      "Unidade",
      "Comissão",
      "Preço de Tabela",
    ]) {
      expect(within(tabela).getByRole("columnheader", { name: coluna })).toBeInTheDocument();
    }
  });

  it("campo vazio é `---`, não zero — e percentual preenchido é `70,00 %`", () => {
    montar([agua, alcool]);
    const linhaDaAgua = screen.getByTestId("produto-2");
    expect(within(linhaDaAgua).getAllByText("---")).toHaveLength(2); // IPI e comissão
    expect(within(linhaDaAgua).getByText("GL")).toBeInTheDocument();

    const linhaDoAlcool = screen.getByTestId("produto-7");
    expect(within(linhaDoAlcool).getByText("5,00 %")).toBeInTheDocument();
    expect(within(linhaDoAlcool).getByText("70,00 %")).toBeInTheDocument();
  });

  it("o preço é o de tabela, em reais", () => {
    montar([agua]);
    expect(within(screen.getByTestId("produto-2")).getByText("R$ 16,00")).toBeInTheDocument();
  });

  it("o rodapé mostra o total do catálogo, não o da página", () => {
    montar([agua, alcool], 1141);
    expect(screen.getByTestId("resultados")).toHaveTextContent("Resultados 1 - 2 de 1141");
  });

  it("o nome abre a ficha e o olho ativa/inativa", () => {
    montar([agua]);
    expect(screen.getByTestId("editar-2")).toHaveTextContent("AGUA SANITARIA BILL 5 L");
    expect(screen.getByTestId("alternar-2")).toHaveAttribute("aria-label", "Inativar");
    expect(screen.getByTestId("destaque-2")).toBeInTheDocument();
  });
});
