"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

interface TabItem {
  label: string;
  href: string;
  disabled: boolean;
}

interface TabNavProps {
  basePath: string;
  tabs: TabItem[];
}

/**
 * Sub-nav de rota do detalhe do tenant — NAVEGAÇÃO, não `Tabs`.
 *
 * Era `Tabs`/`TabsList`/`TabsTrigger asChild` sem nenhum `TabsContent`: cada
 * gatilho saía com `aria-controls="…-content-<valor>"` apontando para um painel
 * que não existe. O axe reprovava como `aria-valid-attr-value` **crítico** nas
 * quatro combinações (claro/escuro × 1440/390) — o leitor de tela anunciava um
 * controle quebrado.
 *
 * O padrão certo para trocar de ROTA é `<nav>` com links e `aria-current`; o
 * estado ativo continua vindo do `pathname`, então deep-link, ctrl+click e
 * voltar seguem funcionando. O desenho (borda inferior, tracking, “em breve”)
 * é o mesmo do `TabsTrigger` — o que muda é a semântica.
 */
export function TabNav({ basePath, tabs }: TabNavProps) {
  const t = useT();
  const pathname = usePathname();

  // Overview matches exactly; others match as prefix
  const ativo = tabs.find((tab) =>
    tab.href === ""
      ? pathname === basePath || pathname === basePath + "/"
      : pathname.startsWith(basePath + tab.href),
  );

  return (
    <nav
      aria-label={t("Seções do tenant")}
      className="inline-flex h-10 max-w-full items-center justify-start gap-1 overflow-x-auto border-b border-border p-0"
    >
      {tabs.map((tab) => {
        const href = basePath + tab.href;
        const atual = ativo?.label === tab.label;

        return (
          <Link
            key={tab.label}
            href={tab.disabled ? "#" : href}
            aria-current={atual ? "page" : undefined}
            aria-disabled={tab.disabled || undefined}
            className={cn(
              // `min-h-10`: o gatilho media 38 px; a casca do admin usa 40.
              "inline-flex min-h-10 items-center justify-center gap-1 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium tracking-[-0.02em] text-text-subtle transition-colors hover:text-text",
              atual && "border-accent text-text",
              tab.disabled && "pointer-events-none",
            )}
          >
            {t(tab.label)}
            {tab.disabled && (
              <span className="ml-1.5 text-[10px] font-normal text-text-subtle">
                {t("em breve")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
