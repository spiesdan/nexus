"use client";

import { cn } from "@/lib/utils";

/**
 * RECORTE DA MESMA LISTA — grupo de botões, NÃO `Tabs`.
 *
 * O `Tabs` do Radix exige um `TabsContent` por gatilho: sem ele, cada botão sai
 * com `aria-controls="…-content-<valor>"` apontando para um painel que não
 * existe, e o axe reprova como `aria-valid-attr-value` — **crítico**, WCAG
 * 1.4.4/4.1.2 por consequência (o leitor de tela anuncia um controle quebrado).
 *
 * Medido nesta base três vezes antes de virar componente: `InboxFilters`,
 * `HistoricoDaAgenda` e `RadarCategorias`. O padrão certo para "escolher um
 * recorte da MESMA lista" é `role="group"` rotulado com botões `aria-pressed` —
 * o conteúdo continua sendo um só, filtrado pelo estado.
 *
 * Por que componente agora: as quatro telas de IA repetiam a mesma estrutura, e
 * a quinta cópia é onde a divergência nasce. As três anteriores ficam como
 * estão por ora (têm contadores e estilos próprios e já estão em produção);
 * migrá-las é faxina separada, não pré-requisito deste conserto.
 */
export interface OpcaoDeRecorte<T extends string> {
  valor: T;
  rotulo: string;
  /** Contagem que a opção responde — opcional, some quando não há número. */
  contagem?: number | null;
}

export function RecorteDaLista<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
  className,
}: {
  /** Nome do grupo para o leitor de tela ("Avisos", "Propostas"…). */
  rotulo: string;
  opcoes: readonly OpcaoDeRecorte<T>[];
  valor: T;
  onChange: (valor: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={cn(
        "inline-flex w-fit flex-wrap gap-1 rounded-lg bg-surface-elevated p-0.5",
        className,
      )}
    >
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:text-text aria-pressed:bg-surface aria-pressed:text-text aria-pressed:shadow-[inset_0_0_0_1px_var(--color-border)]"
        >
          {o.rotulo}
          {typeof o.contagem === "number" && o.contagem > 0 && (
            <span className="text-[11px] font-semibold text-text-muted tabular-nums">
              {o.contagem}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
