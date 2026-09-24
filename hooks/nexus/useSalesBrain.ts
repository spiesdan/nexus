"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

/**
 * O tipo vem da ROTA, não é redigitado aqui (mesmo contrato do radar:
 * cópia local diverge em silêncio quando a rota ganha coluna).
 */
export type { SalesBrainItem } from "@/app/api/v1/sales-brain/route";
import type { SalesBrainItem } from "@/app/api/v1/sales-brain/route";

// A chamada agrega a base inteira (mesmo molde do radar): 60s de teto em
// vez dos 10s padrão — sem isso o abort mente "sem recomendações".
const TIMEOUT_BRAIN_MS = 60_000;

/** Sales Brain (NEXUS 2.0 §27): recomendações operacionais, dados reais. */
export function useSalesBrain(limit = 12) {
  return useQuery({
    queryKey: ["sales-brain", limit],
    refetchInterval: 60_000,
    queryFn: () =>
      apiClient
        .get<{ data: SalesBrainItem[] }>(`/api/v1/sales-brain?limit=${limit}`, {
          timeoutMs: TIMEOUT_BRAIN_MS,
        })
        .then((r) => r.data ?? []),
  });
}
