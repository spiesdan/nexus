---
impacto: nada_mudou
secao: corrigido
titulo: O nome do cliente no pedido passa a ser o nome fantasia
---

Na tela de Pedidos, na busca de cliente e no cadastro feito na hora de criar o
pedido, o nome exibido era a razão social (`display_name`/`name`). Quem conhece
o cliente pelo nome comercial — o caso de quase toda loja — procurava por um
nome que a tela não mostrava.

O nome fantasia passa a vir primeiro; sem fantasia, vale a razão social (PJ) ou o
nome (PF), e sem nada a tela diz "Sem nome". A regra é uma só, aplicada na
escrita do pedido, na lista e na busca.

Pedido antigo também passa a mostrar a fantasia: a lista resolve o nome do
cadastro vinculado **na leitura**, sem reescrever o nome gravado no pedido — o
snapshot continua sendo o que foi impresso no dia.
