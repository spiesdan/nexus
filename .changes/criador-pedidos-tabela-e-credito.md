---
impacto: nada_mudou
secao: corrigido
titulo: Pedido avisa o crédito antes de gerar e reprecifica ao trocar de tabela
---

Dois defeitos do editor de pedidos, os dois descobertos só no clique final:

**Crédito.** O servidor recusava (422) o pedido que estourava o limite do cliente, mas a
tela só alertava sobre o saldo **já** em aberto: um cliente com R$ 100 de folga e um
pedido de R$ 5.000 passava sem aviso. Agora a tela faz a mesma conta do gate
(`em aberto + este pedido <= limite`), com a **mesma lista de status** que comprometem
crédito, e avisa antes do clique — dizendo que só um gerente pode liberar.

**Tabela de preço.** Trocar a tabela só mudava o `tabelaId`: os itens já lançados
mantinham o preço antigo e o servidor recusava o pedido inteiro no fim. Agora a troca
reprecifica os itens — exceto o preço digitado à mão, que é decisão comercial e continua
marcado como manual.

Nada a fazer na VPS.
