---
impacto: nada_mudou
secao: corrigido
titulo: Agrupamento de paradas considera o destino, não só o cliente
---

Um cliente com dois pedidos para endereços diferentes gerava uma única parada
na rota — as duas entregas eram jogadas no mesmo pino, e o mapa achava a
segunda entrega no lugar da primeira.

O agrupamento passa a usar o destino efetivo do pedido (`${base}::${destino}`)
quando o pedido traz endereço de entrega, e só recorre ao contato quando não
tém. Cliente com mesmo endereço continua podendo virar parada única.

A tela de montagem da nova carga também mantém os pedidos escolhidos fora da
lista de busca — antes um pedido marcado podia "sumir" da lista quando casava
com o termo pesquisado.
