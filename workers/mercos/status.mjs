/**
 * A TRADUÇÃO DO STATUS DO MERCOS PARA O STATUS DO CRM.
 *
 * ═══ Por que este mapa mora sozinho ═══════════════════════════════════════
 *
 * Ele já esteve dentro do `main.mjs` — e um erro de uma linha aqui deixou
 * 11.278 pedidos invisíveis na Expedição: o Mercos marca o pedido como
 * **Concluído** quando a venda fecha (nota emitida), e a tradução levava isso
 * para `entregue`. Como a Expedição só lista `aprovado`/`faturado`, todo pedido
 * que chegava do ERP nascia "já entregue" e nunca entrava na fila de carga.
 *
 * O vocabulário do CRM tem quatro passos que o Mercos não tem:
 *
 *     rascunho → aprovado → faturado → expedido → entregue
 *
 * `expedido` e `entregue` são do NOSSO caminho de carga (`shipments`): o pedido
 * vira `expedido` quando entra numa carga e `entregue` quando a entrega é
 * confirmada no fechamento. O Mercos não sabe nada disso — ele só sabe que a
 * venda fechou. Portanto "Concluído" do Mercos é o NOSSO `faturado`: nota
 * emitida, mercadoria ainda no depósito, esperando a carga.
 *
 * ═══ A regra que este arquivo existe para não deixar esquecer ═════════════
 *
 * Status do ERP NUNCA sobrescreve o passo de entrega do CRM. `entregue` só é
 * escrito pelo fechamento da carga; pedido importado nasce, no máximo,
 * `faturado`. Quem já existe é pulado pelo `fn_importar_pedido_mercos` — o
 * importador não revisita nem corrige status de pedido antigo.
 */
export const STATUS = {
  // Venda fechada / nota emitida. NÃO é entrega física: a carga é nossa.
  Concluído: "faturado",
  "Em orçamento": "rascunho",
  Cancelado: "cancelado",
  Expedido: "expedido",
  Aprovado: "aprovado",
  Faturado: "faturado",
  "Parcialmente Faturado": "faturado",
  // O detalhe do Mercos mostra "Aguardando Faturamento" quando o pedido já
  // saiu do rascunho mas ainda não foi faturado. Na lista esse rótulo às
  // vezes não vem; por isso o fallback abaixo.
  "Aguardando Faturamento": "aprovado",
};
