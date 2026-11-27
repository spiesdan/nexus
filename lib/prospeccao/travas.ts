/**
 * TRAVAS DA PROSPECÇÃO MAPS — por organização, visíveis e conservadoras.
 *
 * O sidecar é grátis em dinheiro e caro em confiança: o IP do cliente fala com
 * o Google, e uma rajada aumenta o risco de bloqueio. O plano v5 (§3/§9) fixa
 * 20 resultados por busca, 20 buscas/hora, 100/dia e jitter entre termos.
 *
 * Funções puras: quem conta as buscas é a rota/motor; aqui só se decide.
 * O dia é UTC, como o resto do repositório.
 */

export interface LimitesDeBusca {
  por_hora: number;
  por_dia: number;
  jitter_ms: number;
}

export const LIMITES_CONSERVADORES: LimitesDeBusca = {
  por_hora: 20,
  por_dia: 100,
  jitter_ms: 1500,
};

export interface DecisaoTrava {
  ok: boolean;
  motivo: string | null;
}

/**
 * `buscasUltimaHora` e `buscasHoje` incluem a busca ATUAL (que já foi criada).
 * No limite, nova busca é recusada; a que está rodando termina o termo atual.
 */
export function avaliarTravas(
  buscasUltimaHora: number,
  buscasHoje: number,
  limites: LimitesDeBusca = LIMITES_CONSERVADORES,
): DecisaoTrava {
  if (buscasUltimaHora >= limites.por_hora) {
    return {
      ok: false,
      motivo: `Teto de ${limites.por_hora} busca(s) por hora atingido. Aguarde a próxima janela.`,
    };
  }
  if (buscasHoje >= limites.por_dia) {
    return {
      ok: false,
      motivo: `Teto de ${limites.por_dia} busca(s) por dia (UTC) atingido. Volta amanhã.`,
    };
  }
  return { ok: true, motivo: null };
}

/** Jitter entre termos: 0..jitter_ms, com `random` injetável para teste. */
export function jitterDeTermo(
  jitterMs: number,
  random: () => number = Math.random,
): number {
  const teto = Math.max(0, Math.min(60_000, Math.trunc(jitterMs)));
  if (teto === 0) return 0;
  return Math.min(teto, Math.floor(random() * (teto + 1)));
}

/** Início do dia UTC (o teto diário não vira meia-noite local). */
export function inicioDoDiaUtc(agora: Date = new Date()): string {
  return `${agora.toISOString().slice(0, 10)}T00:00:00Z`;
}

export function inicioDaHoraUtc(agora: Date = new Date()): string {
  const d = new Date(agora);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}
