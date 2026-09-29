import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { ThemeProvider } from "@/lib/theme";

/**
 * O botão que faltava no caminho claro: `lib/theme.tsx` já guardava a
 * preferência e o layout já aplicava, mas NENHUM consumidor de `useTheme`
 * existia — o modo claro era inalcançável pela interface. Este teste prende
 * as três promessas do botão: ele existe com o rótulo certo, o clique troca
 * o `data-theme` do `<html>` (o que o `globals.css` escuta) e a escolha
 * persiste na chave `deskcomm-theme` (o que o `THEME_INIT_SCRIPT` lê).
 */
describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("nascido no dark-first, oferece ir para o claro", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const botao = screen.getByTestId("theme-toggle");
    expect(botao).toHaveAttribute("aria-label", "Alternar para o tema claro");
  });

  it("o clique pinta o <html> light, grava a escolha e inverte o rótulo", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("deskcomm-theme")).toBe("light");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Alternar para o tema escuro",
    );

    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("deskcomm-theme")).toBe("dark");
  });

  it("quem já escolheu o claro reabre no claro", () => {
    window.localStorage.setItem("deskcomm-theme", "light");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Alternar para o tema escuro",
    );
  });
});
