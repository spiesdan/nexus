---
impacto: nada_mudou
secao: corrigido
titulo: A busca de pedidos para montar a carga passa a ser verificada na tela
---

A busca para achar o pedido que vai embarcar foi entregue, mas a primeira
entrega não trazia a ligação com a tela: o programa avisava que a busca estava
disponível e não havia campo para digitar.

Agora a entrega passa por uma verificação que semeia pedidos de verdade, digita
na busca e exige o campo na tela. É essa verificação que teria barrado a
entrega anterior, porque ela passava com a tela desconectada da busca.

A verificação também limpa os pedidos que cria, para não deixar a lista de
embarque suja para o uso real.
