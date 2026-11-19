/**
 * AS PARCELAS TÊM QUE FECHAR COM O TOTAL — nem um centavo solto.
 *
 * `calcularParcelas` (pedido) e `dividirParcelas` (financeiro) já jogam o resto
 * na última parcela. Este predicado é a guarda EXPLÍCITA: quem gerar parcelas
 * por outro caminho (importação, ajuste manual futuro) não deixa o pedido com
 * R$ 0,01 de diferença entre o total e a soma dos vencimentos.
 */
export function parcelasFecham(
  parcelas: readonly { valor_cents: number }[],
  totalCents: number,
): boolean {
  // `[]` (ou uma parcela só) NÃO é rateio: é "sem vencimentos explícitos"
  // (à vista/prazo único). Não há o que fechar — devolver `false` aqui
  // recusaria todo pedido de pagamento único.
  if (parcelas.length <= 1) return true;
  return parcelas.reduce((soma, p) => soma + p.valor_cents, 0) === totalCents;
}
