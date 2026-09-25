/**
 * NEXUS Fluxo de Caixa — projeção honesta (§51, fundação).
 *
 * O que este módulo DIZ: a vencer por dia (receber − pagar) + estoque
 * vencido + posição projetada acumulada. O que ele NÃO diz: "realizado"
 * passado — sem extrato de movimentos não há realizado, e inventá-lo
 * seria dado fake (§57). Quando houver conta/movimento, o realizado
 * entra como série separada sem mudar este contrato.
 */

export interface TituloAberto {
  vencimento: string; // YYYY-MM-DD
  saldo_cents: number;
}

export interface DiaFluxo {
  dia: string;
  receber_cents: number;
  pagar_cents: number;
  liquido_cents: number;
  /** posição projetada: (vencido a receber − vencido a pagar) + líquidos até o dia. */
  acumulado_cents: number;
}

export interface FluxoMontado {
  vencido_receber_cents: number;
  vencido_pagar_cents: number;
  dias: DiaFluxo[];
}

function somaPorDia(titulos: TituloAberto[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of titulos) {
    if (t.saldo_cents <= 0) continue;
    mapa.set(t.vencimento, (mapa.get(t.vencimento) ?? 0) + t.saldo_cents);
  }
  return mapa;
}

export interface EntradaFluxo {
  hoje: string;
  dias: number;
  receber: TituloAberto[];
  pagar: TituloAberto[];
}

export function montarFluxo(e: EntradaFluxo): FluxoMontado {
  const dias = Math.min(180, Math.max(1, Math.trunc(e.dias)));
  let vencido_receber_cents = 0;
  let vencido_pagar_cents = 0;
  const aReceber = new Map<string, number>();
  const aPagar = new Map<string, number>();
  for (const [lista, mapa, somaVencido] of [
    [e.receber, aReceber, (v: number) => (vencido_receber_cents += v)],
    [e.pagar, aPagar, (v: number) => (vencido_pagar_cents += v)],
  ] as const) {
    for (const [dia, valor] of somaPorDia(lista)) {
      if (dia < e.hoje) somaVencido(valor);
      else mapa.set(dia, (mapa.get(dia) ?? 0) + valor);
    }
  }
  const baseMs = new Date(`${e.hoje}T12:00:00Z`).getTime();
  let acumulado = vencido_receber_cents - vencido_pagar_cents;
  const serie: DiaFluxo[] = [];
  for (let i = 0; i < dias; i++) {
    const dia = new Date(baseMs + i * 86400000).toISOString().slice(0, 10);
    const receber_cents = aReceber.get(dia) ?? 0;
    const pagar_cents = aPagar.get(dia) ?? 0;
    acumulado += receber_cents - pagar_cents;
    serie.push({ dia, receber_cents, pagar_cents, liquido_cents: receber_cents - pagar_cents, acumulado_cents: acumulado });
  }
  return { vencido_receber_cents, vencido_pagar_cents, dias: serie };
}
