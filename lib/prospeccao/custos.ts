/**
 * Preços por provider em centavos — num arquivo NEUTRO, não dentro do
 * provider Google (a fronteira ficava invertida: o motor importava custo de um
 * fornecedor específico, B6 da spec 19).
 *
 * Defaults honestos (Places AT 2025). A FASE 13 passa a sobrepor por
 * `prospecting_settings` quando o operador reajustar a tabela do Google
 * (decisão D4 da spec 19) — até lá preço vive aqui, em backend, nunca no
 * frontend.
 */
export interface CustoDeProvider {
  busca: number;
  detalhe: number;
}

export const CUSTOS_PADRAO: Record<string, CustoDeProvider> = {
  google_places: { busca: 18, detalhe: 11 },
  osm_overpass: { busca: 0, detalhe: 0 },
  maps_browser: { busca: 0, detalhe: 0 },
  maps_arquivo: { busca: 0, detalhe: 0 },
};

/** Desconhecido = grátis: nunca cobrar o que não se sabe precificar. */
export function custoDe(provider: string): CustoDeProvider {
  return CUSTOS_PADRAO[provider] ?? { busca: 0, detalhe: 0 };
}
