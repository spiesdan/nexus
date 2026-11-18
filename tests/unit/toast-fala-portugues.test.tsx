/**
 * O BOTÃO DE FECHAR O AVISO FALA PORTUGUÊS.
 *
 * O `sonner` 2.0.8 traz `closeButtonAriaLabel = 'Close toast'` como padrão
 * (`node_modules/sonner/dist/index.js:502`). O produto ligava `closeButton` e
 * não passava o rótulo: o único controle do aviso era anunciado em inglês, num
 * produto que só tem `pt-BR` (`lib/i18n/idiomas.ts`).
 *
 * O teste dispara um aviso de verdade pelo mesmo caminho da UI e exige o nome
 * acessível em português. Não checa a aparência: checa o que o leitor de tela
 * lê.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (texto: string) => texto,
}));

import { ToasterDoProduto } from "@/components/feedback/ToasterDoProduto";

afterEach(() => {
  cleanup();
  toast.dismiss();
});

describe("Toaster do produto", () => {
  it("o botão de fechar se chama 'Fechar aviso'", async () => {
    render(<ToasterDoProduto />);
    toast.success("Pedido salvo");

    // Sonner renderiza em portal e no próximo tick — daí o waitFor.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Fechar aviso" })).toBeInTheDocument();
    });
  });

  it("o texto do aviso continua visível (o wrapper não engoliu nada)", async () => {
    render(<ToasterDoProduto />);
    toast.error("Não foi possível salvar");

    await waitFor(() => {
      expect(screen.getByText("Não foi possível salvar")).toBeInTheDocument();
    });
  });
});
