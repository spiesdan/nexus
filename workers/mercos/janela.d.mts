/** Tipos da janela de coleta do Mercos (JS puro, usado por teste e worker). */
export function validarDataBr(valor: string | null | undefined): boolean;
export function janelaDeColeta(entrada: {
  agoraMs: number;
  ultimoCreatedAt?: string | null;
  overrideDe?: string | null;
  overrideAte?: string | null;
  diasPadrao?: number;
}): { de: string; ate: string; recuperacao: boolean };
