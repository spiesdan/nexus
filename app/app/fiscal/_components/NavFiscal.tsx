"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * A navegação entre as subtelas do módulo fiscal.
 *
 * Não é o sidebar: são treze destinos que só fazem sentido DEPOIS que a pessoa
 * entrou no módulo. Ficam aqui, numa faixa rolável, e não no registro de
 * navegação principal — que tem orçamento de dobra medido e já usa o grupo
 * "Fiscal" para a porta do módulo.
 *
 * A ordem é a da jornada: chegar (Visão Geral) → ver o que chegou (Todas,
 * Resumos, XML) → decidir (Pendentes, Manifestação) → conferir de novo
 * (Fornecedores, Produtos, Eventos) → fechar (Relatórios, Histórico, Config).
 */
export const ABAS_DO_FISCAL = [
  { href: "/app/fiscal", label: "Visão Geral" },
  { href: "/app/fiscal/notas", label: "Todas as Notas" },
  { href: "/app/fiscal/pendentes", label: "Pendentes de Conferência" },
  { href: "/app/fiscal/xml", label: "XML Recebidos" },
  { href: "/app/fiscal/resumos", label: "Resumos de Notas" },
  { href: "/app/fiscal/manifestacoes", label: "Manifestação" },
  { href: "/app/fiscal/fornecedores", label: "Fornecedores" },
  { href: "/app/fiscal/produtos", label: "Produtos das Notas" },
  { href: "/app/fiscal/eventos", label: "Cancelamentos e Eventos" },
  { href: "/app/fiscal/relatorios", label: "Relatórios" },
  { href: "/app/fiscal/sincronizacoes", label: "Histórico de Sincronização" },
  { href: "/app/fiscal/configuracoes", label: "Configurações Fiscais" },
] as const;

export function NavFiscal() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Subtelas de notas fiscais"
      className="-mx-1 flex gap-1 overflow-x-auto pb-1"
    >
      {ABAS_DO_FISCAL.map((aba) => {
        // `/app/fiscal/notas/[id]` pertence a "Todas as Notas": o detalhe é
        // uma continuação da lista, não uma aba própria.
        const ativa =
          pathname === aba.href ||
          (aba.href !== "/app/fiscal" && pathname.startsWith(`${aba.href}/`));
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              ativa
                ? "border-accent-600/40 bg-accent-soft text-accent"
                : "border-border bg-surface text-text-muted hover:bg-surface-elevated",
            )}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
