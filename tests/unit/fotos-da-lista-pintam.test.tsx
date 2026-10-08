/**
 * FOTOS DO PRODUTO NA LISTA — o lote precisa PINTAR na tela.
 *
 * O defeito que este teste fecha: `fotosIniciais` chega do LOTE, e o lote é
 * buscado num efeito que roda DEPOIS da primeira renderização da lista. Com
 * `useState(fotosIniciais)`, o estado fica congelado no valor do primeiro
 * render (`[]`) — e a `<li>` da lista tem `key={p.id}`, então o componente não
 * remonta quando a prop muda. Medido em produção: o lote devolvia 3 produtos
 * com foto e a tela renderizava ZERO <img>.
 *
 * A asserção é feita no PADRÃO que quebrava: montar sem foto, DEPOIS chegar o
 * lote. Um teste que só monta já-com-foto passa em cima do bug.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FotosDoProduto } from "@/app/app/products/_fotos";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(cleanup);

const FOTO = { id: "f1", url: "https://exemplo.test/foto.jpg", posicao: 0 };

describe("FotosDoProduto", () => {
  it("o lote que chega depois da montagem aparece na tela", async () => {
    // Primeiro render: o lote ainda não voltou, a linha não tem foto.
    const { rerender } = render(
      <FotosDoProduto productId="p1" podeEditar={false} fotosIniciais={[]} />,
    );
    expect(document.querySelector("img"), "começa sem foto").toBeNull();

    // A prop muda — o MESMO componente, sem remontar (a key da <li> é p.id).
    rerender(<FotosDoProduto productId="p1" podeEditar={false} fotosIniciais={[FOTO]} />);

    await waitFor(() => {
      expect(document.querySelector("img"), "o lote não pintou na tela").not.toBeNull();
    });
    expect(document.querySelector("img")?.getAttribute("src")).toContain("exemplo.test");
  });

  it("foto que já veio no primeiro render também aparece", () => {
    render(<FotosDoProduto productId="p1" podeEditar={false} fotosIniciais={[FOTO]} />);
    expect(document.querySelector("img")).not.toBeNull();
  });

  it("sem foto e sem lote, quem pode editar vê o convite a enviar — não um <img> quebrado", () => {
    render(<FotosDoProduto productId="p1" podeEditar={false} fotosIniciais={[]} />);
    expect(document.querySelector("img")).toBeNull();
    // Sem permissão de edição o componente não renderiza nada — e é assim que
    // a lista mostrava a coluna "vazia" sem o usuário perceber que era bug.
    expect(screen.queryByText("＋ foto")).toBeNull();

    cleanup();
    render(<FotosDoProduto productId="p1" podeEditar fotosIniciais={[]} />);
    expect(screen.getByText("＋ foto")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});