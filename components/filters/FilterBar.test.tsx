import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FilterMultiSelect } from "@/components/filters/FilterBar";

/**
 * O FILTRO DE VÁRIOS VALORES — o que a prospecção passou a usar em Categoria.
 *
 * O que estes casos prendem: que marcar SOMA em vez de trocar (o defeito que
 * este componente existe para corrigir), que desmarcar tira só um, e que o
 * painel NÃO fecha a cada escolha — se alguém trocar o popover por um menu, a
 * terceira categoria custa a terceira abertura, e é esse atrito que fez o dono
 * pedir multi-seleção.
 */

const OPCOES = [
  { value: "Auto repair shop", label: "Oficina mecânica (74)" },
  { value: "Gas station", label: "Posto de combustível (24)" },
  { value: "Tire repair shop", label: "Borracharia (13)" },
];

function renderizar(values: string[] = []) {
  const onChange = vi.fn();
  render(
    <FilterMultiSelect
      id="f-categoria"
      label="Categoria"
      values={values}
      onChange={onChange}
      options={OPCOES}
      allLabel="Todas as categorias"
      searchPlaceholder="Buscar categoria…"
      clearLabel="Limpar"
    />,
  );
  return { onChange };
}

/**
 * O gatilho do Popover (`@radix-ui/react-popover`, linha 110) abre no
 * `onClick` — diferente do `DropdownMenu`, que abre no `pointerdown`.
 */
function abrir() {
  fireEvent.click(screen.getByRole("button", { name: "Categoria" }));
}

describe("FilterMultiSelect", () => {
  it("sem nada marcado, o gatilho anuncia o estado vazio", () => {
    renderizar();
    expect(screen.getByRole("button", { name: "Categoria" })).toHaveTextContent(
      "Todas as categorias",
    );
  });

  it("MUTAÇÃO: escolher a segunda categoria SOMA à primeira (não troca)", () => {
    // Este é o defeito que motivou o componente: com um `<select>` de um
    // valor só, marcar "Posto" apagava "Oficina" — e o dono perdia o recorte
    // sem ver.
    const { onChange } = renderizar(["Auto repair shop"]);
    abrir();
    fireEvent.click(screen.getByRole("option", { name: "Posto de combustível (24)" }));
    expect(onChange).toHaveBeenCalledWith(["Auto repair shop", "Gas station"]);
  });

  it("escolher de novo o que já está marcado tira SÓ ele", () => {
    const { onChange } = renderizar(["Auto repair shop", "Gas station"]);
    abrir();
    fireEvent.click(screen.getByRole("option", { name: "Oficina mecânica (74)" }));
    expect(onChange).toHaveBeenCalledWith(["Gas station"]);
  });

  it("o painel continua aberto depois da escolha (é o ponto do multi)", () => {
    const { onChange } = renderizar([]);
    abrir();
    fireEvent.click(screen.getByRole("option", { name: "Borracharia (13)" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    // Com menu (fecha no primeiro item), esta linha falharia.
    expect(screen.getByRole("option", { name: "Posto de combustível (24)" })).toBeInTheDocument();
  });

  it("a busca acha pelo RÓTULO em português, não só pelo valor gravado", () => {
    // O valor gravado é o rótulo do Google ("Tire repair shop"); ninguém digita
    // isso. Sem casar no rótulo PT, a busca de 500 categorias não serviria.
    renderizar();
    abrir();
    fireEvent.change(screen.getByLabelText("Buscar categoria…"), { target: { value: "borrach" } });
    expect(screen.getByRole("option", { name: "Borracharia (13)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Posto de combustível (24)" })).toBeNull();
  });

  it("com várias marcadas, o gatilho diz a contagem (não finge que é uma só)", () => {
    renderizar(["Auto repair shop", "Gas station"]);
    expect(screen.getByRole("button", { name: "Categoria" })).toHaveTextContent("Categoria: 2");
  });

  it("'Limpar' zera o filtro inteiro", () => {
    const { onChange } = renderizar(["Auto repair shop", "Gas station"]);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
