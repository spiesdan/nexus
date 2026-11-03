---
impacto: capacidade_nova
secao: adicionado
titulo: A fila da expedição diz para quais cidades cada carga vai
---

Cada linha da expedição mostrava placa, motorista e "3/7 paradas" — mas não
dizia se aquela carga é a de Canoinhas ou a de Mafra, que é a primeira coisa que
o despachante pergunta ao olhar a mesa.

Agora a linha mostra as **cidades da rota**, na ordem das paradas e sem repetir
("Canoinhas/SC · Mafra/SC · Três Barras/SC"). A cidade sai do mesmo resolvedor
do romaneio — endereço de entrega do pedido primeiro, cadastro do cliente
depois —, então a linha da carga e o papel que o motorista leva não discordam.
Parada cujo endereço não resolve cidade é **contada** na linha ("1 sem cidade")
em vez de sumir do resumo.

A busca da expedição também passou a achar por cidade: digitar "canoinhas"
encontra a carga que vai para lá, não só o pedido na fila de embarque.
