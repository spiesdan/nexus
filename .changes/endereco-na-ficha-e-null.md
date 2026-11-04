---
impacto: nada_mudou
secao: corrigido
titulo: Endereço do cliente na ficha do pedido, e o "NULL" do export sai da rua
---

A ficha do pedido mostrava **End. de entrega vazio** para todo pedido vindo do
Mercos — o pedido não tem endereço próprio, o destino é o endereço principal do
cliente. A carga, o romaneio e a impressão já resolviam isso; a ficha, não.
Agora ela usa a mesma precedência: o que estiver escrito no pedido vence, e o
cadastro cobre a ausência.

Junto, um defeito que fazia o endereço parecer quebrado onde ele existia:
o export do WP/Mercos grava **`NULL` literal** no fim da rua
("RUA BRASIL, 183, NULL") — medido em 87 cadastros desta instalação (51 na rua,
36 no bairro). O texto ia assim para a tela, o romaneio e o mapa. Agora "NULL"
é tratado como ausência, e a linha sai "RUA BRASIL, 183 — CENTRO, Mafra/SC,
89300001" em vez de "183, NULL, 183".
