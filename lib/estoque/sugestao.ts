/**
 * NEXUS Estoque — sugestão de compra (§47, fundação sem schema novo).
 *
 * Ponto de pedido por cobertura: quando os dias de cobertura caem abaixo
 * do alvo, sugere recompor até o alvo. Funções puras sobre saldo atual +
 * saídas recentes (pedidos reais). Sem estoque mínimo cadastrado ainda —
 * o alvo de cobertura é o parâmetro explícito, e a resposta DIZ o método.
 *
 * Movimentações/auditadas (entradas, saídas, ajustes, reservas) e
 * estoque mínimo por produto pedem tabela nova + test:db com Docker —
 * indisponível neste ambiente (daemon caído). Vêm na FASE 6 parte 2.
 */

export interface SinalProduto {
  product_id: string;
  /** saldo atual (catalog_products.quantidade). */
  quantidade: number;
  /** unidades vendidas na janela. */
  saidas_janela: number;
  /** dias da janela de observação. */
  dias_janela: number;
  controla_estoque: boolean;
  custo_unit_cents: number | null;
}

export interface SugestaoCompra {
  product_id: string;
  media_diaria: number;
  cobertura_dias: number | null;
  qtd_sugerida: number;
  valor_sugerido_cents: number | null;
  metodo: "cobertura";
}

export const COBERTURA_ALVO_DIAS = 14;

/** Média diária com 2 casas (nunca negativa). */
export function mediaDiaria(saidas: number, dias: number): number {
  if (dias <= 0 || saidas <= 0) return 0;
  return Math.round((saidas / dias) * 100) / 100;
}

/**
 * Uma sugestão por produto — ou null (sem o que sugerir).
 * Null quando: não controla estoque, sem saída na janela (sem giro
 * medido, sugerir seria inventar demanda) ou cobertura acima do alvo.
 */
export function sugerirPara(s: SinalProduto, alvoDias = COBERTURA_ALVO_DIAS): SugestaoCompra | null {
  if (!s.controla_estoque) return null;
  const media = mediaDiaria(s.saidas_janela, s.dias_janela);
  if (media <= 0) return null;
  const cobertura = s.quantidade > 0 ? Math.floor((s.quantidade / media) * 10) / 10 : 0;
  if (cobertura >= alvoDias) return null;
  const qtd = Math.max(1, Math.ceil(media * alvoDias - s.quantidade));
  return {
    product_id: s.product_id,
    media_diaria: media,
    cobertura_dias: cobertura,
    qtd_sugerida: qtd,
    valor_sugerido_cents: s.custo_unit_cents != null ? qtd * s.custo_unit_cents : null,
    metodo: "cobertura",
  };
}

/** Ordena: menor cobertura primeiro (o mais urgente no topo). */
export function ordenarSugestoes(ss: SugestaoCompra[]): SugestaoCompra[] {
  return [...ss].sort((a, b) => (a.cobertura_dias ?? 0) - (b.cobertura_dias ?? 0));
}
