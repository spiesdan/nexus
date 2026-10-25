/**
 * O gatilho da busca na TopBar.
 *
 * ─── O defeito que este teste impede ────────────────────────────────────────
 *
 * O botão é UM só, mas tem dois desenhos: campo outline no desktop e ícone
 * fantasma no mobile. No mobile o texto (`hidden md:inline`) era a única coisa
 * que dava nome ao `<button>` — escondido, o alvo ficava sem nome acessível e
 * um leitor de tela anunciava apenas "botão". O `aria-label` explícito é o que
 * fecha isso, e é ele que este arquivo prende.
 *
 * Também prende o atalho: `⌘K` no Mac, `Ctrl K` no resto. A leitura do
 * `navigator` passa por `useSyncExternalStore` justamente para não existir
 * `setState` dentro de efeito (render em cascata) nem divergência entre o HTML
 * do servidor e o primeiro render do cliente.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SearchTrigger } from "@/components/shell/SearchTrigger";

const paleta = vi.hoisted(() => ({ aberta: false, abrir: 0 }));

vi.mock("react-hotkeys-hook", () => ({ useHotkeys: () => undefined }));
vi.mock("@/components/shell/CommandPalette", () => ({
  CommandPalette: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
    if (open) paleta.abrir += 1;
    return null;
  },
}));

afterEach(() => {
  cleanup();
  paleta.abrir = 0;
});

describe("busca da TopBar", () => {
  it("tem UM botão, com nome acessível mesmo quando o texto some no mobile", () => {
    render(<SearchTrigger />);
    const botoes = screen.getAllByRole("button", { name: /^Buscar$/i });
    expect(botoes).toHaveLength(1);
    expect(botoes[0]).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K");
    expect(botoes[0]).toHaveAttribute("title", "Buscar");
  });

  it("mostra o atalho da plataforma no <kbd>", () => {
    render(<SearchTrigger />);
    expect(screen.getByText(/^(⌘K|Ctrl K)$/)).toBeInTheDocument();
  });

  it("o clique abre a paleta", () => {
    render(<SearchTrigger />);
    fireEvent.click(screen.getByRole("button", { name: /^Buscar$/i }));
    expect(paleta.abrir).toBe(1);
  });
});
