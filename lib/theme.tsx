"use client";

import * as React from "react";

/**
 * Dark-first (PROMPT V4): o produto nasce no tema escuro e o `[data-theme="dark"]`
 * do globals.css é o caminho padrão — o layout fixa `dark` antes do primeiro
 * paint (ver `THEME_INIT_SCRIPT` em `app/layout.tsx`) e o provider aplica a
 * preferência do usuário em cima depois. `light` continua válido: a chave
 * `deskcomm-theme` guarda a escolha, e quem nunca escolheu fica no dark.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "deskcomm-theme";

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
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function aplicar(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeEstado] = React.useState<Theme>("dark");
  const [resolvedTheme, setResolved] = React.useState<ResolvedTheme>("dark");

  // Hidratação RUNTIME: o script inline do layout já pintou `dark` antes do
  // primeiro paint; aqui aplicamos a preferência gravada — se houver.
  React.useEffect(() => {
    const inicial = temaGravado();
    setThemeEstado(inicial);
    setResolved(resolver(inicial));
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
    setThemeEstado((atual) => {
      const proximo: Theme = atual === "dark" || (atual === "system" && resolver(atual) === "dark") ? "light" : "dark";
      const resolvido = resolver(proximo);
      setResolved(resolvido);
      try {
        window.localStorage.setItem(STORAGE_KEY, proximo);
      } catch {
        // Persistência opcional — falha silenciosamente.
      }
      aplicar(resolvido);
      return proximo;
    });
  }, []);

  // Segue `prefers-color-scheme` enquanto o usuário estiver em `system`.
  React.useEffect(() => {
    if (theme !== "system") return;
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
