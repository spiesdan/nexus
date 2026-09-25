"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Drawer contextual do shell (§17): o painel de contexto (detalhe, dossiê,
 * inspeção) abre na casa certa — overlay, esc, foco preso, trava de rolagem e
 * animação vêm do `ui/sheet` (SoR), que é o que os drawers feitos à mão não
 * tinham (`fixed inset-0` sem backdrop nem teclado: dá pra abrir e não dá pra
 * fechar sem mouse). O domínio só passa título, subtítulo e conteúdo — largura
 * é `className` porque cada contexto tem a sua.
 */
export function ContextualDrawer({
  aberto,
  onFechar,
  titulo,
  subtitulo,
  className,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  subtitulo?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={aberto}
      onOpenChange={(o) => {
        if (!o) onFechar();
      }}
    >
      <SheetContent className={cn("overflow-y-auto p-4", className)}>
        <SheetHeader className="mb-3 pr-8">
          <SheetTitle className="text-base">{titulo}</SheetTitle>
          {subtitulo ? <SheetDescription className="text-xs">{subtitulo}</SheetDescription> : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
