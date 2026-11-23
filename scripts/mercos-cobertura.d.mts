/** Tipos da cobertura da reconciliação (JS puro, importado por teste e script). */

export interface Cobertura {
  status: "completa" | "incompleta";
  motivos: string[];
}

export function avaliarCobertura(entrada?: {
  censoEsperado?: number | null;
  censoLido?: number;
  linhasIlegiveis?: number;
  registrosSemData?: number;
  erros?: number;
}): Cobertura;

export function avaliarResultado(entrada: {
  cobertura: Cobertura;
  ausentesDepois?: number;
}): Cobertura & { verificado: boolean; declaracao: string };
