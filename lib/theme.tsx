"use client";

import * as React from "react";

/**
 * Dark-first (PROMPT V4): o produto nasce no tema escuro e o `[data-theme="dark"]`
 * do globals.css é o caminho padrão — o layout fixa `dark` antes do primeiro
 * paint (ver `THEME_INIT_SCRIPT` em `app/layout.tsx`) e o provider aplica a
 * preferência do usuário em cima depois. `light` continua válido: a chave
 * `nexus-theme` guarda a escolha, e quem nunca escolheu fica no dark.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "nexus-theme";

type ThemeContextValue = {
  /** User preference. Default: `dark` (dark-first). */
  theme: Theme;
  /** Effective theme applied to the DOM. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function temaGravado(): Theme {
  try {
    const gravado = window.localStorage.getItem(STORAGE_KEY);
    if (gravado === "light" || gravado === "dark" || gravado === "system") {
      return gravado;
    }
  } catch {
    // Persistência opcional — falha silenciosamente.
  }
  return "dark";
}

function resolver(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    // `matchMedia` não existe em todo ambiente de teste/SSR; o fallback é o
    // mesmo dark-first do produto, nunca um tema indefinido.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function aplicar(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // O `color-scheme` do CSS já cobre o caso normal; repetir aqui garante que
  // controles nativos (select, scrollbar, autofill) acompanhem o clique mesmo
  // antes de o CSS do tema ser recalculado.
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // O primeiro render do cliente precisa ser igual ao do servidor (`dark`),
  // senão a hidratação do ícone do alternador diverge. O efeito abaixo lê a
  // preferência gravada e pinta o DOM antes da primeira interação.
  const [theme, setThemeEstado] = React.useState<Theme>("dark");
  const [resolvedTheme, setResolved] = React.useState<ResolvedTheme>("dark");

  React.useEffect(() => {
    const inicial = temaGravado();
    const resolvido = resolver(inicial);
    setThemeEstado(inicial);
    setResolved(resolvido);
    // Aplica já no primeiro efeito, sem esperar o efeito de `resolvedTheme`:
    // é isso que evita a janela em que o `<html>` fica com o tema do SSR.
    aplicar(resolvido);
  }, []);

  const setTheme = React.useCallback((proximo: Theme) => {
    const resolvido = resolver(proximo);
    setThemeEstado(proximo);
    setResolved(resolvido);
    try {
      window.localStorage.setItem(STORAGE_KEY, proximo);
    } catch {
      // Persistência opcional — falha silenciosamente.
    }
    aplicar(resolvido);
  }, []);

  const toggle = React.useCallback(() => {
    // Derivado do tema EFETIVO, não do preferido: com `system`, o primeiro
    // clique precisa ir para o oposto do que está na tela. E sem efeito
    // colateral dentro do updater — React pode chamá-lo mais de uma vez.
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  // Segue `prefers-color-scheme` enquanto o usuário estiver em `system`.
  React.useEffect(() => {
    if (theme !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => setResolved(media.matches ? "dark" : "light");
    aoMudar();
    media.addEventListener("change", aoMudar);
    return () => media.removeEventListener("change", aoMudar);
  }, [theme]);

  React.useEffect(() => {
    aplicar(resolvedTheme);
  }, [resolvedTheme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggle }),
    [theme, resolvedTheme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}
