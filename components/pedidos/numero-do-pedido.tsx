import { numeroDoPedido } from "@/lib/format/moeda";
import { cn } from "@/lib/utils";

/**
 * NÚMERO DUPLADO — o interno manda, o do Mercos é referência.
 *
 * Regra do dono (23/11): numero_mercos nulo OU igual ao interno → um número
 * só. Diferentes (colisão: interno 900123, Mercos 19669) → os dois, com rótulo,
 * o do Mercos em texto secundário. Em 390 o flex-wrap desce a referência para
 * a segunda linha em vez de empurrar o cliente para fora da linha.
 *
 * Sem tooltip: se o número do Mercos existe, alguém precisa vê-lo.
 */
export function numeroMercosEhReferencia(
  numero: number,
  numeroMercos: number | null | undefined,
): boolean {
  return numeroMercos != null && String(numeroMercos) !== String(numero);
}

export function rotuloNumeroDoPedido(
  numero: number,
  numeroMercos: number | null | undefined,
): string {
  const interno = numeroDoPedido(numero);
  return numeroMercosEhReferencia(numero, numeroMercos)
    ? `${interno} · Mercos ${numeroMercos}`
    : interno;
}

export function NumeroDoPedido({
  numero,
  numeroMercos,
  className,
}: {
  numero: number;
  numeroMercos?: number | null;
  className?: string;
}) {
  const interno = numeroDoPedido(numero);
  if (!numeroMercosEhReferencia(numero, numeroMercos)) {
    return <span className={className}>{interno}</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5",
        className,
      )}
    >
      <span className="font-medium text-text tabular-nums">{interno}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        Mercos {numeroMercos}
      </span>
    </span>
  );
}
