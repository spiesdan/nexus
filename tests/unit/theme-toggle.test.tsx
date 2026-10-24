import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { ThemeProvider } from "@/lib/theme";

/**
 * O botão que faltava no caminho claro: `lib/theme.tsx` já guardava a
 * preferência e o layout já aplicava, mas NENHUM consumidor de `useTheme`
 * existia — o modo claro era inalcançável pela interface. Este teste prende
 * as promessas do botão: ele existe com o rótulo certo, o clique troca o
 * `data-theme` do `<html>` (o que o `globals.css` escuta), atualiza o
 * `color-scheme` dos controles nativos e persiste na chave `nexus-theme` (o
 * que o `THEME_INIT_SCRIPT` lê).
 */
describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    vi.unstubAllGlobals();
  });

  it("nascido no dark-first, oferece ir para o claro sem gravar escolha", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const botao = screen.getByTestId("theme-toggle");
    expect(botao).toHaveAttribute("aria-label", "Alternar para o tema claro");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem("nexus-theme")).toBeNull();
  });

  it("o clique pinta o <html> light, grava a escolha e inverte o rótulo", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem("nexus-theme")).toBe("light");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Alternar para o tema escuro",
    );

    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem("nexus-theme")).toBe("dark");
  });

  it("quem já escolheu o claro reabre no claro", () => {
    window.localStorage.setItem("nexus-theme", "light");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Alternar para o tema escuro",
    );
  });

  it("em system, o clique parte do tema efetivo, não do texto 'system'", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    window.localStorage.setItem("nexus-theme", "system");

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

    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("nexus-theme")).toBe("dark");
  });
});
