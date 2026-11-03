---
impacto: nada_mudou
secao: corrigido
titulo: Mapa da rota mostra as paradas: o endereço vem do cadastro do cliente
---

O mapa da Expedição abria vazio e o botão **Geocodificar** não movia um pino.

A parada da rota nascia só com o `endereço de entrega` do **pedido** — um campo
opcional, que o operador preenche apenas quando a entrega é em outro ponto. Nesta
instalação, nenhum dos 28 pedidos das cargas abertas tinha esse campo, embora 25
deles tivessem a rua no **cadastro do cliente**. Sem endereço, a geocodificação
não tinha alvo: o botão respondia "concluída" sem localizar nada.

Agora o endereço do pedido continua vencendo quando existe (é o ponto que o
operador escolheu), e o cadastro entra quando ele falta — o mesmo endereço que o
romaneio já usava. Cliente sem endereço nenhum continua sem pino, de propósito:
pino em lugar errado é pior que pino nenhum.

O retorno do botão também parou de mentir: ele diz quantas paradas foram
localizadas, quantas ficaram sem resultado e, quando não há nenhuma, manda
corrigir o endereço ou marcar no mapa.
