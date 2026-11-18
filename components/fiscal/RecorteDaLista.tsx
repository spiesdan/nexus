import { cn } from "@/lib/utils";

/**
 * O RECORTE DA LISTA, DITO EM VOZ ALTA.
 *
 * A auditoria 5.8 (F6) mediu cinco telas fiscais com `limit(300)` silencioso:
 * a lista parecia completa e o operador concluía que não havia mais nada —
 * quando o que faltava era o aviso de que a tela mostra um recorte. O número
 * vem do `count` da MESMA consulta (mesmos filtros), não de uma segunda
 * pergunta que poderia divergir.
 *
 * Não é paginação: é honestidade. Enquanto a paginação não existe, quem precisa
 * do item 301 refina o período/busca em vez de rolar uma lista que termina sem
 * dizer por quê.
 */
export function RecorteDaLista({
  mostrados,
  total,
  descricao,
  className,
}: {
  mostrados: number;
  total: number | null;
  descricao: string;
  className?: string;
}) {
  if (total === null || total <= mostrados) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      Mostrando {mostrados} de {total} {descricao}. Refine o período ou a busca para ver os
      demais — esta lista tem teto para caber na tela.
    </p>
  );
}
