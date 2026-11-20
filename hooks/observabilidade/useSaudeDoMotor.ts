"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

/**
 * Saúde do motor de decisão (laya) — lida do incidente que o cron grava.
 *
 * O tipo é o MESMO da rota (`lib/laya/saude.ts`): duplicar aqui já custou caro
 * em outras telas, e "motor indisponível" não pode divergir entre Radar,
 * Prospecção e administração.
 */
export type { SaudeDoMotor } from "@/lib/laya/saude";
import type { SaudeDoMotor } from "@/lib/laya/saude";

/**
 * `estado`:
 * - `indisponivel` — o micro-serviço não respondeu na última tentativa;
 * - `ok` — respondeu (incidente fechado);
 * - `sem_registro` — nunca foi chamado ou a leitura falhou (NÃO é alarme).
 */
export function useSaudeDoMotor() {
  return useQuery({
    queryKey: ["laya-saude"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: () =>
      apiClient.get<{ data: SaudeDoMotor }>("/api/v1/laya/saude").then((r) => r.data),
  });
}
