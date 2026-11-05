"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
  // A emissão é a porta irmã: fica no começo porque é o uso diário, e o módulo
  // de entrada é o que se visita de vez em quando.
  { href: "/app/notas", label: "Emitir NF-e" },
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
  const router = useRouter();

  const ativaDe = (href: string): boolean =>
    pathname === href || (href !== "/app/fiscal" && pathname.startsWith(`${href}/`));
  const atual = ABAS_DO_FISCAL.find((aba) => ativaDe(aba.href)) ?? ABAS_DO_FISCAL[0]!;

  /*
   * No celular, treze destinos numa faixa rolável é uma faixa que ninguém
   * percorre: metade das abas fica fora da tela sem nenhuma pista de que
   * existe mais. Aqui a faixa vira um MENU SUSPENSO com a aba atual como
   * rótulo — o destino escolhido está sempre visível, e nenhum some.
   *
   * A partir de `md` a faixa de pílulas volta: há largura para ler os treze
   * nomes de uma vez, e o menu suspenso obrigaria a abrir para saber onde se
   * está.
   */
  return (
    <>
      <div className="md:hidden">
        <label className="sr-only" htmlFor="nav-fiscal-mobile">
          Subtelas de notas fiscais
        </label>
        <select
          id="nav-fiscal-mobile"
          value={atual.href}
          onChange={(e) => router.push(e.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text"
        >
          {ABAS_DO_FISCAL.map((aba) => (
            <option key={aba.href} value={aba.href}>
              {aba.label}
            </option>
          ))}
        </select>
      </div>

      <nav
        aria-label="Subtelas de notas fiscais"
        className="hidden gap-1 overflow-x-auto pb-1 md:flex"
      >
      {ABAS_DO_FISCAL.map((aba) => {
        // `/app/fiscal/notas/[id]` pertence a "Todas as Notas": o detalhe é
        // uma continuação da lista, não uma aba própria.
        const ativa = ativaDe(aba.href);
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
    </>
  );
}
