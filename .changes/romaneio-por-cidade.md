---
impacto: nada_mudou
secao: adicionado
titulo: Romaneio separado por cidade, com o nome do cliente que está no cadastro
---

O romaneio agora imprime a carga **separada por cidade**: cada cidade abre um
bloco com o nome dela e quantas paradas tem, e as paradas daquela cidade vêm
juntas. A ordem entre os blocos continua sendo a da rota — o primeiro bloco é o
da parada mais cedo da sequência —, e a numeração é redistribuída para o papel
ser lido de cima para baixo, sem "1, 5, 9, 2".

Parada cujo cadastro não tem cidade vai para um bloco próprio, no fim,
identificado como **"Cidade não informada"** — em vez de entrar calada num
grupo qualquer.

O nome do cliente no papel passou a ser o do **cadastro**, não o que ficou
congelado no pedido na importação. Isso é o que faz o pedido renomeado sair com
o nome certo sem ninguém reimportar nada. Medido: 109 dos 393 pedidos abertos
desta instalação tinham o nome do pedido diferente do cadastro do cliente.

Nada muda na separação de itens, no total da carga ou na assinatura por parada.
O romaneio da carga 022 — 22 paradas e 50 itens, agora com 7 blocos de cidade —
continua em **duas folhas**.
