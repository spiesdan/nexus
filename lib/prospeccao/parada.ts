/**
 * PARADA DECLARADA — o stop não é instantâneo porque o termo tem timeout.
 *
 * O sidecar roda um termo por até 120 s; pedir pause no meio não aborta a
 * chamada em curso. Em vez de fingir, a rota grava `parada_solicitada_em` e
 * mostra "parando" com o prazo máximo. O motor fecha o termo, grava `paused`
 * e o estado vira "parado". Nenhum status novo entra no CHECK do banco.
 */

/** 120 s do termo + folga de escrita/checkpoint. */
export const PARADA_MAXIMA_S = 125;

export type EstadoDeParada = "parando" | "parado" | null;

export function estadoDeParada(
  status: string,
  paradaSolicitadaEm: string | null | undefined,
): EstadoDeParada {
  if (!paradaSolicitadaEm) return null;
  if (status === "running") return "parando";
  if (status === "paused") return "parado";
  return null;
}
