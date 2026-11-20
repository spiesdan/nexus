/**
 * O DIÁLOGO MOSTRA A MUDANÇA LINHA A LINHA E NÃO APLICA SOZINHO.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DialogReprecificacao } from "@/app/app/pedidos/novo/_reprecificacao";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

afterEach(() => cleanup());

describe("DialogReprecificacao", () => {
  it("lista de → para, avisa os manuais e separa confirmar de manter", () => {
    const confirmar = vi.fn();
    const cancelar = vi.fn();
    render(
      <DialogReprecificacao
        aberto
        mudancas={[
          { key: "l1", nome: "Produto um", deCents: 10000, paraCents: 9000 },
          { key: "l2", nome: "Produto dois", deCents: 5000, paraCents: 4700 },
        ]}
        manuais={1}
        paraNome="Tabela Ouro"
        onConfirmar={confirmar}
        onCancelar={cancelar}
      />,
    );

    expect(screen.getByText("Produto um")).toBeTruthy();
    expect(screen.getByText(/100,00/)).toBeTruthy();
    expect(screen.getByText(/90,00/)).toBeTruthy();
    expect(screen.getByText(/1 linha\(s\) com preço manual serão mantidas/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar nova tabela" }));
    expect(confirmar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Manter preços atuais" }));
    expect(cancelar).toHaveBeenCalledTimes(1);
  });
});
