/**
 * A FICHA DO PRODUTO COPIA A DO MERCOS — e o que isso pode quebrar.
 *
 * Três frases cercadas aqui:
 *
 *  1. Percentual e dimensão em texto livre viram NÚMERO (ou `null`, quando
 *     vazio) — nunca 0. "Isento de IPI" e "ninguém preencheu" são coisas
 *     diferentes na nota, e a diferença morre se o parse devolver 0.
 *  2. Cores e tamanhos vão e voltam da mesma forma ("azul, verde" ↔ lista).
 *  3. As quatro abas ficam MONTADAS ao mesmo tempo (`forceMount`). Não é
 *     detalhe de renderização: o NCM é sugerido enquanto a pessoa digita o
 *     NOME, e a sugestão é escrita no campo da aba "Informações gerais". Se o
 *     Radix desmontasse a aba inativa, o campo não existiria no DOM e a busca
 *     escreveria num input inexistente — em silêncio.
 */
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));

import type { Categoria } from "@/lib/schemas/precos";
import {
  numeroDecimal,
  numeroParaTexto,
  pctParaNumero,
} from "@/lib/schemas/produtos";

import { FichaDoProduto, RASCUNHO_VAZIO, listaDeTexto, textoDeLista } from "@/app/app/products/_ficha";

const CATEGORIAS: Categoria[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    parent_id: null,
    nome: "Limpeza",
    posicao: 0,
    ativo: true,
    updated_at: "2026-10-01T12:00:00Z",
  },
];

function montar(prefixo: "produto" | "editar" = "produto") {
  function Envelope() {
    const [rascunho, setRascunho] = React.useState({ ...RASCUNHO_VAZIO });
    return (
      <FichaDoProduto
        prefixo={prefixo}
        rascunho={rascunho}
        setRascunho={setRascunho}
        categorias={CATEGORIAS}
        aoMudarNome={() => {}}
        aoMudarNcm={() => {}}
        badgeNcm={null}
      />
    );
  }
  return render(<Envelope />);
}

describe("percentual e dimensão em texto livre", () => {
  it("aceita vírgula e ponto, e devolve null para vazio", () => {
    expect(pctParaNumero("70")).toBe(70);
    expect(pctParaNumero("70,5")).toBe(70.5);
    expect(pctParaNumero("70.5")).toBe(70.5);
    expect(pctParaNumero(" 7,00 ")).toBe(7);
    expect(pctParaNumero("")).toBeNull();
    expect(pctParaNumero("   ")).toBeNull();
  });

  it("lixo devolve null em vez de NaN — NaN atravessaria até o banco", () => {
    expect(pctParaNumero("abc")).toBeNull();
    expect(pctParaNumero("7,0,0")).toBeNull();
    expect(pctParaNumero("70%")).toBeNull();
  });

  it("número → texto sem `,00` artificial; null → vazio", () => {
    expect(numeroParaTexto(70)).toBe("70");
    expect(numeroParaTexto(0.48)).toBe("0.48");
    expect(numeroParaTexto(null)).toBe("");
  });

  it("dimensão usa a mesma régua do percentual", () => {
    expect(numeroDecimal("0,480")).toBe(0.48);
    expect(numeroDecimal("30")).toBe(30);
    expect(numeroDecimal("")).toBeNull();
  });
});

describe("cores e tamanhos", () => {
  it("divide por vírgula ou ponto e vírgula, sem repetir nem guardar vazio", () => {
    expect(listaDeTexto("azul, verde ,azul")).toEqual(["azul", "verde"]);
    expect(listaDeTexto("500 ml; 1 L")).toEqual(["500 ml", "1 L"]);
    expect(listaDeTexto("  ,  ")).toEqual([]);
  });

  it("volta para o campo na mesma forma", () => {
    expect(textoDeLista(["azul", "verde"])).toBe("azul, verde");
    expect(textoDeLista(undefined)).toBe("");
  });
});

describe("as abas da ficha", () => {
  it("mantém os campos das QUATRO abas no DOM (é o que a sugestão de NCM exige)", () => {
    montar();

    // Aba "Tabelas de preço" (a que abre).
    expect(screen.getByTestId("produto-preco")).toBeInTheDocument();
    // Aba "Informações gerais" — onde o NCM sugerido é escrito.
    expect(screen.getByTestId("produto-ncm")).toBeInTheDocument();
    expect(screen.getByTestId("produto-ipi")).toBeInTheDocument();
    expect(screen.getByTestId("produto-comissao")).toBeInTheDocument();
    expect(screen.getByTestId("produto-observacoes")).toBeInTheDocument();
    // Aba "Peso e dimensões", unidade e caixa master.
    expect(screen.getByTestId("produto-peso-bruto")).toBeInTheDocument();
    expect(screen.getByTestId("produto-comprimento")).toBeInTheDocument();
    expect(screen.getByTestId("produto-caixa-peso")).toBeInTheDocument();
    expect(screen.getByTestId("produto-caixa-comprimento")).toBeInTheDocument();
  });

  it("cores e tamanhos nascem escondidos, atrás do botão do Mercos", () => {
    montar();
    // Antes de definir, o campo nem existe — é o "Definir cores e tamanhos".
    expect(screen.queryByTestId("produto-cores")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Definir cores e tamanhos/ }));
    expect(screen.getByTestId("produto-cores")).toBeInTheDocument();
    expect(screen.getByTestId("produto-tamanhos")).toBeInTheDocument();
  });

  it("o prefixo `editar` gera os testids que a edição já usava", () => {
    montar("editar");
    expect(screen.getByTestId("editar-nome")).toBeInTheDocument();
    expect(screen.getByTestId("editar-ncm")).toBeInTheDocument();
    expect(screen.getByTestId("editar-preco")).toBeInTheDocument();
    expect(screen.getByTestId("editar-unidade")).toBeInTheDocument();
    expect(screen.getByTestId("editar-categoria")).toBeInTheDocument();
  });

  it("a categoria é uma lista com as da loja, e não texto solto", () => {
    montar();
    const select = screen.getByTestId("produto-categoria") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toContain("Limpeza");
  });
});
