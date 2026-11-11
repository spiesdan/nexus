---
impacto: nada_mudou
secao: corrigido
titulo: A tela de Pedidos lista pelo número do pedido, como o Mercos
---

A lista ordenava por data de criação. Quando um pedido era relançado ou
corrigido no Mercos, o número novo aparecia abaixo de um número menor no mesmo
dia, e a tela parecia fora de ordem para quem lê o número.

Agora a listagem — a página e o `GET /api/v1/commercial-orders` — ordena por
`numero` decrescente, do último para o primeiro, como a lista do Mercos. O
filtro de período continua por data de criação; o que mudou é a posição, não a
janela.
