/**
 * A TRADUÇÃO DO STATUS DO MERCOS PARA O STATUS DO CRM.
 *
 * ═══ Por que este mapa mora sozinho ═══════════════════════════════════════
 *
 * Ele já esteve dentro do `main.mjs` — e um erro de uma linha aqui deixou
 * 11.278 pedidos invisíveis na Expedição: o Mercos marca o pedido como
 * **Concluído** quando a venda fecha, e a tradução levava isso para
 * `entregue`. Como a Expedição só lista o que ainda não embarcou, todo pedido
 * que chegava do ERP nascia "já entregue" e nunca entrava na fila de carga.
 *
 * ═══ O que cada rótulo do ERP quer dizer ══════════════════════════════════
 *
 *   Concluído            venda fechada; a mercadoria ainda está no depósito
 *                        e precisa entrar numa carga. NÃO é entrega física.
 *   Faturado             nota emitida no ERP — é a prova de NF-e gerada.
 *   Parcialmente Faturado  idem: já existe nota, mesmo que parcial.
 *   Aguardando Faturamento  saiu do orçamento, ainda sem nota.
 *
 * O vocabulário do CRM tem passos que o Mercos não tem:
 *
 *     rascunho → aprovado → faturado → concluido → expedido → entregue
 *
 * `expedido` e `entregue` são do NOSSO caminho de carga (`shipments`): o pedido
 * vira `expedido` quando entra numa carga e `entregue` quando a entrega é
 * confirmada no fechamento. O Mercos não sabe nada disso.
 *
 * ═══ As duas regras que este arquivo existe para não deixar esquecer ══════
 *
 * 1. Status do ERP NUNCA escreve o passo de entrega do CRM. `entregue` só é
 *    escrito pelo fechamento da carga (ou pela observação "pago e entregue",
 *    que é entrega declarada no próprio ERP). Pedido importado nasce, no
 *    máximo, `concluido`/`faturado`.
 *
 * 2. `faturado` é reservado para quem tem NF-e gerada. "Concluído" no ERP não
 *    é nota emitida — por isso ele vira `concluido`, não `faturado`. Quem já
 *    existe é pulado pelo `fn_importar_pedido_mercos`; a revisão corrige o
 *    status dos últimos dias por `fn_aplicar_status_mercos`.
 */
export const STATUS = {
  // Venda fechada, sem nota (ou nota ainda não emitida no ERP). Vai para a
  // fila da Expedição e ainda pode ser faturada.
  Concluído: "concluido",
  "Em orçamento": "rascunho",
  Cancelado: "cancelado",
  Expedido: "expedido",
  Aprovado: "aprovado",
  // Nota emitida no ERP: é o único caminho do ERP para `faturado`.
  Faturado: "faturado",
  "Parcialmente Faturado": "faturado",
  // O detalhe do Mercos mostra "Aguardando Faturamento" quando o pedido já
  // saiu do rascunho mas ainda não foi faturado. Na lista esse rótulo às
  // vezes não vem; por isso o fallback abaixo.
  "Aguardando Faturamento": "aprovado",
};
