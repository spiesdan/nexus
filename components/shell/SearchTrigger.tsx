"use client";
import { useState, useSyncExternalStore } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { CommandPalette } from "@/components/shell/CommandPalette";

/**
 * Gatilho da paleta de comandos — UM botão, dois desenhos.
 *
 * No desktop é o campo outline com o atalho à direita; no mobile é um ícone
 * fantasma do mesmo tamanho dos vizinhos (44px). Antes era o MESMO botão nos
 * dois tamanhos, e no mobile ele virava uma pílula com borda no meio de ícones
 * sem borda — destoava — e ficava sem nome acessível, porque o texto
 * (`hidden md:inline`) era o que dava nome ao `<button>`. Um leitor de tela
 * anunciava "botão" e nada mais.
 *
 * O atalho mostrado segue a plataforma (⌘K no Mac, Ctrl K no resto). A leitura
 * do `navigator` NÃO acontece no primeiro render nem por `useEffect`: o
 * servidor não tem `navigator`, e um `setState` dentro de efeito é render em
 * cascata (regra do próprio React). `useSyncExternalStore` é o caminho que o
 * React oferece para "valor que só existe no cliente": o HTML sai com ⌘K e a
 * primeira renderização hidratada corrige para Ctrl K onde for o caso, sem
 * mismatch e sem efeito.
 */
const semAssinatura = () => () => {};
const atalhoNoCliente = () =>
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "⌘K" : "Ctrl K";
const atalhoNoServidor = () => "⌘K";

export function SearchTrigger() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const atalho = useSyncExternalStore(semAssinatura, atalhoNoCliente, atalhoNoServidor);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-11 w-11 justify-center gap-0 border-0 bg-transparent px-0 text-muted-foreground md:h-9 md:w-64 md:justify-start md:gap-2 md:border md:border-input md:bg-background md:px-3 lg:w-80 xl:w-96"
        aria-label={t("Buscar")}
        title={t("Buscar")}
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlass size={18} aria-hidden className="shrink-0 md:hidden" />
        <MagnifyingGlass size={14} aria-hidden className="hidden shrink-0 md:block" />
        <span className="hidden truncate md:inline">{t("Buscar...")}</span>
        <kbd className="ml-auto hidden rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-text md:inline">
          {atalho}
        </kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
