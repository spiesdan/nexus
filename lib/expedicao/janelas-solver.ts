/**
 * JANELAS DE ENTREGA → RELÓGIO DO SOLVER.
 *
 * O cliente combina "entre 14h e 16h"; o solver raciocina em minutos desde a
 * saída da base. A conversão só existe quando a carga tem hora de saída
 * (`shipments.saida_prevista`) — sem ela não há como posicionar a janela, e o
 * chamador DECLARA a restrição como não aplicada em vez de inventar partida.
 *
 * Janela que termina antes da saída é dado inconsistente, não "sem janela":
 * devolvemos `vencida` para o operador corrigir a hora ou a janela.
 */

import { minutosDoDia } from "@/lib/rotas/janelas";

export type JanelaConvertida = {
  /** Minutos desde a saída, já recortados em [0, 1440]. */
  inicio: number;
  fim: number;
};

export type ResultadoDaJanela =
  | { estado: "sem_janela" }
  | { estado: "vencida" }
  | { estado: "ok"; janela: JanelaConvertida };

export function converterJanelaParaSolver(
  janelaInicio: string | null | undefined,
  janelaFim: string | null | undefined,
  partidaMin: number,
): ResultadoDaJanela {
  const inicio = minutosDoDia(janelaInicio);
  const fim = minutosDoDia(janelaFim);
  if (inicio == null || fim == null || fim <= inicio) return { estado: "sem_janela" };

  const inicioRelativo = inicio - partidaMin;
  const fimRelativo = fim - partidaMin;
  if (fimRelativo <= 0) return { estado: "vencida" };

  return {
    estado: "ok",
    janela: {
      inicio: Math.max(0, inicioRelativo),
      fim: Math.min(1440, fimRelativo),
    },
  };
}
