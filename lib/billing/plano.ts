/**
 * O plano é dado do BANCO. O valor nunca é constante em TypeScript.
 *
 * Enquanto `billing_plans.stripe_price_id` está vazio, a tela lê nome,
 * descrição, valor e moeda da tabela. Quando ele existe, o STRIPE manda:
 * a referência no banco é só o ponteiro para o Price.
 */
export interface PlanoNoBanco {
  nome: string;
  descricao: string;
  valor_cents: number;
  moeda: string;
  intervalo: string;
  stripe_price_id: string | null;
}

export interface PriceStripe {
  unit_amount: number | null;
  currency: string;
  description: string | null;
  nickname: string | null;
  recurring?: { interval?: string } | null;
}

export interface PlanoEfetivo {
  configurado: boolean;
  nome: string | null;
  descricao: string | null;
  valor_cents: number | null;
  moeda: string | null;
  intervalo: string | null;
  fonte: "stripe" | "banco" | "nenhum";
}

export function planoEfetivo(
  plano: PlanoNoBanco | null | undefined,
  price: PriceStripe | null = null,
): PlanoEfetivo {
  if (!plano) {
    return {
      configurado: false, nome: null, descricao: null, valor_cents: null,
      moeda: null, intervalo: null, fonte: "nenhum",
    };
  }
  if (price) {
    return {
      configurado: true,
      nome: plano.nome,
      descricao: price.description || price.nickname || plano.descricao,
      valor_cents: price.unit_amount,
      moeda: price.currency.toUpperCase(),
      intervalo: price.recurring?.interval === "year" ? "anual" : plano.intervalo,
      fonte: "stripe",
    };
  }
  return {
    configurado: true,
    nome: plano.nome,
    descricao: plano.descricao,
    valor_cents: plano.valor_cents,
    moeda: plano.moeda,
    intervalo: plano.intervalo,
    fonte: "banco",
  };
}
