/**
 * O ATALHO DA BUSCA É ANUNCIADO, NÃO SÓ FUNCIONA.
 *
 * ─── POR QUE ESTE TESTE EXISTE ────────────────────────────────────────────
 *
 * WCAG 2.1.4 pede que atalho de teclado seja descoberto — e o produto tem dois
 * públicos: quem vê a dica `⌘K` no campo e quem ouve o botão. O botão já
 * carrega `aria-keyshortcuts` (a API que leitores de tela usam para anunciar
 * "Meta+K") e o `kbd` visível a partir de `md`; no celular sobra o ícone, que
 * só faz sentido com nome acessível — e ele é "Buscar em todo o sistema", não
 * "Buscar" (havia dois "Buscar" na mesma árvore, corrigido na V-18).
 *
 * O teste fixa as três coisas juntas porque elas se perdem juntas: nome, atalho
 * anunciado e a dica visível.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (texto: string) => texto,
}));

// O atalho global (react-hotkeys-hook) e a paleta não são o assunto: a paleta
// monta um Dialog fechado, e o hook só registra listeners.
vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: () => undefined,
}));
vi.mock("@/components/shell/CommandPalette", () => ({
  CommandPalette: () => null,
}));

import { SearchTrigger } from "@/components/shell/SearchTrigger";

afterEach(cleanup);

describe("gatilho da busca global", () => {
  it("tem nome que diz o que busca, e não colide com filtro de página", () => {
    render(<SearchTrigger />);
    expect(screen.getByRole("button", { name: "Buscar em todo o sistema" })).toBeInTheDocument();
    // "Buscar" sozinho é o nome dos campos de filtro das listas — V-18.
    expect(screen.queryByRole("button", { name: "Buscar" })).not.toBeInTheDocument();
  });

  it("anuncia o atalho por `aria-keyshortcuts` e mostra a dica", () => {
    const { container } = render(<SearchTrigger />);

    const botao = screen.getByRole("button", { name: "Buscar em todo o sistema" });
    const atalhos = botao.getAttribute("aria-keyshortcuts") ?? "";
    expect(atalhos).toContain("Meta+K");
    expect(atalhos).toContain("Control+K");

    // A dica visível (a partir de `md`) é o mesmo atalho — `⌘K` ou `Ctrl K`.
    const kbd = container.querySelector("kbd");
    // O atalho visível é desenhado por CSS (`content: attr(data-atalho)`) para
    // não entrar no texto que o axe `label-content-name-mismatch` mede.
    expect(kbd?.getAttribute("data-atalho")).toMatch(/^(⌘K|Ctrl K)$/);
  });
});
