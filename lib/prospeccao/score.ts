/**
 * O SCORE — heurística documentada, não ML (§19 do plano).
 *
 * "Probabilidade de recompra" sem modelo seria número inventado com cara de
 * ciência. O que o score diz de verdade: "vale o esforço comercial?" —
 * telefone (contatável), site (estabelecido), nota e volume de avaliações
 * (movimento), aderência à categoria pedida (§11/§12) e distância ao âncora
 * da busca dentro do raio escolhido (§11). Pesos somam 100 e vivem aqui, num
 * lugar só.
 *
 * O score é da DESCOBERTA, não do CRM: "já é cliente" e "já foi abordado"
 * são verdades de leitura (classificação/§10), nunca número gravado — misturar
 * faria a mesma linha pontuar diferente para quem olha.
 */

export interface EntradaScore {
  temTelefone: boolean;
  temWebsite: boolean;
  whatsappPotencial: boolean;
  nota: number | null;
  totalAvaliacoes: number;
  /** Bônus opcional da operação (ex.: categoria alvo da campanha). */
  bonusCategoria?: number;
  /** Distância (km) ao âncora da busca; sem âncora, sem pontos de distância. */
  distanciaKm?: number | null;
  /** Raio da busca — o que define "perto" (borda do raio vale zero). */
  raioKm?: number | null;
}

export const PESOS_SCORE = {
  telefone: 20,
  website: 10,
  whatsapp: 10,
  nota: 15,
  avaliacoes: 15,
  categoria: 15,
  distancia: 15,
} as const;

/**
 * Aderência (§11: "aderência aos produtos da Bill"; §12 diz que o perfil
 * completo vem "futuramente"). Hoje: o termo que o OPERADOR pediu vale cheio;
 * termo irmão da expansão (§5), metade — o operador optou, mas não pediu.
 */
export function bonusDeAderencia(categoriaPedida: boolean): number {
  return categoriaPedida ? PESOS_SCORE.categoria : Math.round(PESOS_SCORE.categoria / 2);
}

export function scoreDeProspect(e: EntradaScore): number {
  let score = 0;
  if (e.temTelefone) score += PESOS_SCORE.telefone;
  if (e.temWebsite) score += PESOS_SCORE.website;
  if (e.whatsappPotencial) score += PESOS_SCORE.whatsapp;
  if (e.nota !== null) score += Math.round(PESOS_SCORE.nota * Math.min(1, e.nota / 5));
  score += Math.round(PESOS_SCORE.avaliacoes * Math.min(1, e.totalAvaliacoes / 500));
  score += Math.min(PESOS_SCORE.categoria, Math.max(0, e.bonusCategoria ?? 0));
  if (e.distanciaKm != null && e.raioKm != null && e.raioKm > 0) {
    const fracao = Math.max(0, 1 - e.distanciaKm / e.raioKm);
    score += Math.round(PESOS_SCORE.distancia * fracao);
  }
  return Math.min(100, score);
}
