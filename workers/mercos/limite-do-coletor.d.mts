/** Tipos do limite do coletor do Mercos (JS puro, usado por teste e worker). */
export function limiteDoColetor(entrada?: {
  alvo?: number;
  esperaMs?: number;
  baseMs?: number;
}): number;
export function explicarEstouro(entrada: {
  alvo: number;
  esperaMs?: number;
  limiteMs: number;
}): string;
