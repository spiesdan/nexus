/**
 * Quais paradas ainda não têm pino (P0-2, auditoria 89).
 *
 * A geocodificação em lote é disparada ao abrir a rota com `?geocodificar=1`.
 * A decisão de disparar — e a de não disparar nada quando já está tudo no mapa —
 * precisa ser a MESMA, por isso mora aqui: se a tela contasse diferente do lote,
 * ela diria "já está tudo localizado" e ainda mandaria geocodificar (ou o
 * contrário, que é pior: olhar para 87 pendentes e não fazer nada).
 */
export interface ParadaComCoordenada {
  latitude: number | null;
  longitude: number | null;
}

export function paradasSemCoordenada<T extends ParadaComCoordenada>(paradas: T[]): T[] {
  return paradas.filter((p) => p.latitude == null || p.longitude == null);
}
