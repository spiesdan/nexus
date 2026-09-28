/**
 * Drawer contextual do shell (§17). O que estes testes protegem:
 *
 *  - o drawer é diálogo de verdade (role=dialog com título acessível) — os
 *    drawers à mão de antes tinham `role="dialog"` mas não travavam foco nem
 *    respondiam ao teclado;
 *  - esc e o X fecham pelo MESMO canal (`onFechar`), que é o que o domínio
 *    usa para desmarcar o registro aberto;
 *  - subtítulo é descrição, não título: leitor de tela não lê endereço como
 *    nome da empresa.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ContextualDrawer } from "@/components/shell/ContextualDrawer";

function abrir(onFechar = vi.fn()) {
  render(
    <ContextualDrawer
      aberto
      onFechar={onFechar}
      titulo="Mercado E2E"
      subtitulo="Padaria · São Paulo/SP"
      className="max-w-md"
    >
      <p>conteúdo do detalhe</p>
    </ContextualDrawer>,
  );
  return onFechar;
}

afterEach(cleanup);

describe("Drawer contextual do shell", () => {
  it("abre como diálogo com título e conteúdo", () => {
    abrir();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Mercado E2E");
    expect(screen.getByText("Padaria · São Paulo/SP")).toBeInTheDocument();
    expect(screen.getByText("conteúdo do detalhe")).toBeInTheDocument();
  });

  it("esc fecha pelo mesmo canal do domínio", () => {
    const onFechar = abrir();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("o X embutido fecha pelo mesmo canal", () => {
    const onFechar = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("sem subtítulo não declara descrição nenhuma", () => {
    render(
      <ContextualDrawer aberto onFechar={vi.fn()} titulo="Só título">
        <p>x</p>
      </ContextualDrawer>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Só título");
    expect(dialog.getAttribute("aria-describedby")).toBeFalsy();
  });
});
