/**
 * Preços por provider em centavos — num arquivo NEUTRO, não dentro do
 * provider Google (a fronteira ficava invertida: o motor importava custo de um
 * fornecedor específico, B6 da spec 19).
 *
 * Defaults honestos (Places AT 2025) e a FASE 13 fechou D4: `custoEfetivo`
 * sobrepõe o default com o que o operador gravar em `prospecting_settings`
 * (`preco_busca_cents`/`preco_detalhe_cents`) quando a tabela do Google mudar.
 * Preço nunca sai do frontend, e o override só vale para o provider pago —
 * OSM/mapas continuam zero, porque não há o que sobrepor.
 */
export interface CustoDeProvider {
  busca: number;
  detalhe: number;
}

/** O que o tenant gravou em settings (NULL = usa o default do arquivo). */
export interface PrecoConfigurado {
  preco_busca_cents: number | null;
  preco_detalhe_cents: number | null;
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

/**
 * Preço efetivo do tenant: settings por cima do neutro (D4). Só o provider
 * pago tem preço configurável — um `preco_*_cents` gravado enquanto o OSM
 * estiver ativo não vira cobrança, e volta a valer no dia em que o Google
 * religar (mesma coluna, mesmo número).
 */
export function custoEfetivo(provider: string, cfg?: PrecoConfigurado | null): CustoDeProvider {
  const base = custoDe(provider);
  if (provider !== "google_places" || !cfg) return base;
  return {
    busca: cfg.preco_busca_cents ?? base.busca,
    detalhe: cfg.preco_detalhe_cents ?? base.detalhe,
  };
}
