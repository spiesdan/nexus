---
impacto: nada_mudou
secao: corrigido
titulo: NF-e autorizada já gera os recebíveis do pedido
---

Quando a SEFAZ autorizava a nota de um pedido aprovado, o pedido virava
faturado mas o financeiro continuava vazio até alguém clicar em "Gerar
financeiro". Quem faturava pela nota podia passar dias sem cobrança na tela.

A autorização passou a gerar os recebíveis pelo mesmo caminho do botão. A
geração é idempotente por organização, pedido e parcela: retry ou queda no meio
não duplica parcela, e uma falha em um pedido da nota não derruba a autorização
nem os outros pedidos.
