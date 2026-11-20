---
impacto: nada_mudou
secao: corrigido
titulo: Nota que fatura vários pedidos não é mais acusada como divergência
---

Quando uma NF-e fatura dois pedidos, o Sentinel comparava o total da nota com o
total de um único pedido e acusava diferença. Agora soma todos os pedidos
vinculados (principal e agrupamento) e só abre se a soma divergir; a evidência
mostra a decomposição. Pedido ausente do snapshot não abre.

O mesmo erro de tratar `invoices.order_id` como 1:1 foi corrigido em
`nota_autorizada_pedido_nao_faturado`, `nota_sem_vinculo` e
`pedido_com_nf_sem_nota`.
