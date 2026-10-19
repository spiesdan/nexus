---
impacto: nada_mudou
secao: corrigido
titulo: Excluir a carga devolve os pedidos, e o romaneio filtra por cidade e data
---

Excluir uma carga gerada por engano tirava a carga da tela e deixava os pedidos
presos. Criar a carga levava cada pedido para **expedido**, e a fila de
"aguardando embarque" só lê **aprovado** e **faturado**: fora da carga e fora da
fila, o pedido não aparecia em lugar nenhum — nem para ser reembarcado. A
confirmação na tela já dizia que os pedidos voltavam; agora eles voltam de
verdade, e a mensagem diz **quantos** voltaram.

Tirar um pedido só da carga tinha o mesmo defeito, com a mesma promessa na tela.

O romaneio ganhou os dois filtros que faltavam: **cidade** e **data** (entrega,
ou criação quando o pedido não tem data marcada). A cidade é procurada no
endereço de entrega e também na cidade do cadastro do cliente — o endereço é
digitado por pedido e boa parte da base não tem nenhum. Quando o filtro de
cidade está ligado, a tela diz quantos pedidos ficaram de fora por não terem
cidade em nenhuma das duas fontes, em vez de escondê-los em silêncio.
