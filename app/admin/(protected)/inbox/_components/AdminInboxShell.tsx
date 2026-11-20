"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { InboxList } from "./InboxList";

/**
 * Casco do inbox de PLATAFORMA — a mesma regra que o `/app/inbox` já aplica
 * desde o #638: em tela pequena, lista e conversa não cabem juntas.
 *
 * O layout anterior fixava `w-[360px]` na lista e `w-[320px]` no painel
 * lateral, ambos sempre visíveis. A 390 px isso deixa 30 px para o fio — a
 * conversa existe, mas não se lê. Agora:
 *
 *  - < md: sem conversa escolhida, a lista ocupa a largura toda; escolhida,
 *    a conversa ocupa e a lista sai (o "Voltar" do cabeçalho a traz de volta).
 *  - ≥ md: lista (360 px) e conversa convivem, como antes.
 *  - ≥ xl: o painel lateral volta (ver `AdminSidePanel`).
 *
 * O estado vem da URL, não de `useState`: deep-link para uma conversa precisa
 * abrir já com o fio visível, e o botão "voltar" do navegador precisa voltar
 * para a lista — as duas coisas que um estado local erraria.
 */
export function AdminInboxShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const temConversa = /^\/admin\/inbox\/[^/]+/.test(pathname);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside
        data-testid="admin-inbox-lista"
        className={cn(
          "h-full w-full shrink-0 flex-col border-r border-border md:flex md:w-[360px]",
          temConversa ? "hidden" : "flex",
        )}
      >
        <InboxList />
      </aside>

      <div
        data-testid="admin-inbox-conteudo"
        className={cn(
          "min-w-0 flex-1 overflow-hidden md:flex",
          temConversa ? "flex" : "hidden md:flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
