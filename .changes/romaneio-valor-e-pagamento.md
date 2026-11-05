---
impacto: nada_mudou
secao: adicionado
titulo: Romaneio: valor de cada pedido, meio de pagamento e o fechamento por meio no fim
---

O romaneio saía com o valor **total da carga** no rodapé, mas não dizia quanto era cada pedido nem como cada cliente paga — e o motorista fechava o dia sem saber quanto deveria voltar de cada forma.

Agora a tabela de pedidos tem **Pagamento** e **Valor** por linha, e o fim da folha traz o **fechamento por meio de pagamento**: uma linha por meio (AVISTA, BOLETO 14 DIAS, PIX…), com a quantidade de pedidos e o valor somado, fechando no total da carga.

O agrupamento ignora caixa, acento e espaço duplo — "BOLETO 14 DIAS" e "Boleto 14 dias" são o mesmo meio —, e pedido sem condição entra em **"Não informado"** em vez de sumir: a soma dos meios tem de bater com o total, inclusive quando o dado falta.

Para caber sem empurrar a carga para uma terceira página, saíram as colunas **Origem** (a palavra "Pedido" repetida em toda linha) e **Id** (o mesmo número que já vai em "Nº Documento"). O cabeçalho também parou de sobrepor o título quando a razão social é longa.
