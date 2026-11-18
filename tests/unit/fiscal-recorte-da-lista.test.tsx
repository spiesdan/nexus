/**
 * O TETO DA LISTA É DITO, NÃO ESCONDIDO.
 *
 * A auditoria 5.8 (F6) mediu `limit(300)` silencioso em cinco telas fiscais.
 * O aviso só aparece quando o total da MESMA consulta passa do que a tela
 * mostra — e não aparece por engano quando a lista cabe inteira.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RecorteDaLista } from "@/components/fiscal/RecorteDaLista";

afterEach(cleanup);

describe("RecorteDaLista", () => {
  it("diz quantos de quantos e o que fazer quando há mais", () => {
    render(<RecorteDaLista mostrados={300} total={842} descricao="eventos" />);
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 300 de 842 eventos");
  });

  it("não aparece quando a lista cabe inteira", () => {
    const { container } = render(<RecorteDaLista mostrados={12} total={12} descricao="itens" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sem contagem confiável não inventa número", () => {
    const { container } = render(
      <RecorteDaLista mostrados={300} total={null} descricao="fornecedores" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
