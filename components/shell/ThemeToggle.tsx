"use client";
import { useT } from "@/lib/i18n/IdiomaProvider";
import { Moon, Sun } from "@/lib/ui/icons";
import { useTheme } from "@/lib/theme";

/**
 * Alternador de tema na TopBar (§17): o produto nasce dark-first, mas a
 * chave `deskcomm-theme` e o `THEME_INIT_SCRIPT` do layout já carregavam o
 * caminho claro — o que faltava era o botão que alcança ele. Sem consumidor
 * nenhum de `useTheme` antes deste arquivo (medido por grep), o tema claro
 * só existia pra quem abria o DevTools.
 *
 * Convenção do ícone = DESTINO, não estado (o sol aparece no escuro: clicar
 * é ir pro claro) — a mesma de GitHub/Linear, e o `aria-label` diz a ação,
 * não a aparência atual, porque é o que o leitor de tela anuncia.
 */
export function ThemeToggle() {
  const t = useT();
  const { resolvedTheme, toggle } = useTheme();
  const noEscuro = resolvedTheme === "dark";
  const rotulo = noEscuro ? t("Alternar para o tema claro") : t("Alternar para o tema escuro");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={rotulo}
      title={rotulo}
      data-testid="theme-toggle"
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9 lg:w-9"
    >
      {noEscuro ? (
        <Sun size={18} aria-hidden weight="bold" />
      ) : (
        <Moon size={18} aria-hidden weight="bold" />
      )}
    </button>
  );
}
