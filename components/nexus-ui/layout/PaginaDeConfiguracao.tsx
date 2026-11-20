import type { ReactNode } from "react";

import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { cn } from "@/lib/utils";

/**
 * A MOLDURA DE UMA TELA DE CONFIGURAÇÃO.
 *
 * ─── POR QUE EXISTE, SE JÁ EXISTE `NexusPageHeader` ───────────────────────
 *
 * As 10 telas de `/app/settings` escreviam o próprio cabeçalho à mão. Não era
 * só duplicação: as classes eram as mesmas, mas cada tela decidia o próprio
 * espaçamento, o próprio `<h1>` e — em duas delas — um `overflow-y-auto` que
 * criava um SEGUNDO scroll dentro do `<main>` (que já rola). O resultado era
 * uma tela que rola em dois lugares e um cabeçalho que muda de peso quando
 * alguém mexe numa página só.
 *
 * `NexusPageHeader` já é a identidade canônica (título + descrição + ações,
 * empilhado no tablet, `text-pretty` na descrição). O que faltava era a
 * moldura do módulo: padding, gap e altura. Esta é a única cópia dela.
 *
 * Server e client component usam igual: os textos chegam resolvidos, sem hook.
 */
export function PaginaDeConfiguracao({
  titulo,
  descricao,
  acoes,
  children,
  className,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col gap-6 p-6", className)}>
      <NexusPageHeader title={titulo} subtitle={descricao} actions={acoes} />
      {children}
    </div>
  );
}
