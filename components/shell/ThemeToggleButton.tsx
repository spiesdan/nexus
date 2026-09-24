"use client";

import { Moon, Sun } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import { useTheme } from "@/lib/theme";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Alternador claro/escuro com o visual do beUI (`theme-toggle` + `action-swap`)
 * mas dirigindo o NOSSO tema (`lib/theme.tsx`, `data-theme` + `deskcomm-theme`).
 *
 * O `ThemeToggle` original do beUI lê `next-themes`, que este produto não usa
 * como provider — importar o componente puro deixaria o botão morto. A
 * animação de reveal (view transition) é a mesma ideia do original.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  const alternar = () => {
    const proximo = isDark ? "light" : "dark";
    if (reduce || !("startViewTransition" in document)) {
      setTheme(proximo);
      return;
    }
    (
      document as Document & {
        startViewTransition(cb: () => void): { finished: Promise<void> };
      }
    ).startViewTransition(() => setTheme(proximo));
  };

  return (
    <button
      type="button"
      aria-label={isDark ? t("Mudar para o tema claro") : t("Mudar para o tema escuro")}
      title={isDark ? t("Mudar para o tema claro") : t("Mudar para o tema escuro")}
      onClick={alternar}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {mounted ? (
        <ActionSwapIcon value={isDark ? "dark" : "light"} animation="blur" className="size-4">
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </ActionSwapIcon>
      ) : (
        <span className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
