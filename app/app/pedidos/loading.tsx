import { Skeleton } from "@/components/ui/skeleton";

/**
 * O primeiro paint de Pedidos bloqueava no RSC: sem `loading.tsx`, a tela
 * ficava em branco até a consulta terminar. O esqueleto segue a forma da
 * lista (cabeçalho, filtros, linhas) para o layout não pular quando o dado
 * chega.
 */
export default function PedidosLoading() {
  return (
    <div className="min-h-full space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
