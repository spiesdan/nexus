"use client";

import { SegmentError } from "@/components/feedback/SegmentError";

/**
 * A rota não tinha `error.tsx`: uma falha no RSC subia para o `app/app/error.tsx`
 * e a pessoa perdia o contexto de Pedidos — sem o `reset` da própria seção e com
 * o segmento errado na telemetria.
 */
export default function PedidosError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError {...props} segment="pedidos" />;
}
