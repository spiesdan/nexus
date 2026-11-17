/**
 * O DESCONTO AO DUPLICAR — separar o percentual do valor fixo, sem dobrar.
 *
 * `commercial_orders.desconto_cents` guarda o desconto TOTAL em centavos, e
 * `desconto_pct` guarda o percentual que o gerou. Duplicar copiando os dois
 * como estão dobraria o percentual (a criação soma `desconto_cents` +
 * `round(subtotal × pct)`); copiar só o total perde o percentual e, com o
 * preço novo dos itens, pode estourar o subtotal.
 *
 * A conta certa: o fixo é o total menos a parte que o percentual gerou no
 * subtotal ORIGINAL. O novo pedido aplica esse fixo + o percentual sobre o
 * subtotal NOVO.
 */
export function descontoDaDuplicata(base: {
  desconto_cents: number;
  desconto_pct: number | null;
  subtotal_cents: number;
}): { desconto_cents: number; desconto_pct: number } {
  const pct = Number(base.desconto_pct ?? 0);
  const parteDoPct = Math.round((Number(base.subtotal_cents) * pct) / 100);
  return {
    // `max(0)`: banco antigo/inconsistente não pode virar desconto negativo.
    desconto_cents: Math.max(0, Number(base.desconto_cents) - parteDoPct),
    desconto_pct: pct,
  };
}
