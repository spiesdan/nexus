"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/hooks/i18n/useT";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
 * Sub-nav de rota do detalhe do tenant. Navegação por URL — os gatilhos são
 * `Link` (Fase 5c: markup canônico de `ui/tabs` via `asChild`), não estado
 * interno: deep-link, ctrl+click e botão voltar do browser continuam
 * funcionando. O valor controlado sai do `pathname` — quem decide a aba ativa
 * é a URL, não um `useState`.
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
  const valorAtivo = ativo ? basePath + ativo.href : basePath;

  return (
    <Tabs value={valorAtivo}>
      <TabsList>
        {tabs.map((tab) => {
          const href = basePath + tab.href;

          return (
            <TabsTrigger
              key={tab.label}
              value={href}
              asChild
              disabled={tab.disabled}
              className={tab.disabled ? "text-muted-foreground" : undefined}
            >
              <Link href={tab.disabled ? "#" : href} aria-disabled={tab.disabled}>
                {t(tab.label)}
                {tab.disabled && (
                  <span className="ml-1.5 text-[10px] font-normal opacity-60">
                    {t("em breve")}
                  </span>
                )}
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
