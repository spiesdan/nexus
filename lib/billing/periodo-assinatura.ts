/**
 * Vencimento da assinatura: nas versões novas da API do Stripe o período saiu
 * do objeto `subscription` e passou para `subscription.items.data[i]`.
 *
 * Um leitor que olha só o topo devolve `undefined`, a reconciliação grava
 * NULL e apaga a data boa — justamente a data que decide D-3/D-2/D-1 e a
 * suspensão no vencimento. Um lugar só decide a leitura.
 */
export interface AssinaturaComPeriodo {
  current_period_start?: number | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_start?: number | null; current_period_end?: number | null }> } | null;
}

export interface PeriodoDaAssinatura {
  inicio: number | null;
  fim: number | null;
  /** De onde veio o valor — a tela/admin pode dizer quando veio do item. */
  origem: "topo" | "item" | "ausente";
}

export function periodoDaAssinatura(s: AssinaturaComPeriodo | null | undefined): PeriodoDaAssinatura {
  const item = s?.items?.data?.[0];
  const fim = s?.current_period_end ?? item?.current_period_end ?? null;
  const inicio = s?.current_period_start ?? item?.current_period_start ?? null;
  return {
    fim: typeof fim === "number" && Number.isFinite(fim) ? fim : null,
    inicio: typeof inicio === "number" && Number.isFinite(inicio) ? inicio : null,
    origem:
      s?.current_period_end != null ? "topo" :
      item?.current_period_end != null ? "item" : "ausente",
  };
}

export function isoDoPeriodo(segundos: number | null): string | null {
  return segundos == null ? null : new Date(segundos * 1000).toISOString();
}

/** Valor efetivo: o remoto ganha quando existe; a ausência NÃO apaga o local. */
export function vencimentoEfetivo(remotoIso: string | null, localIso: string | null | undefined): string | null {
  return remotoIso ?? localIso ?? null;
}
