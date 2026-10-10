---
impacto: nada_mudou
secao: adicionado
titulo: Pedido offline no celular, com envio automático ao voltar o sinal
---

O vendedor sem área de cobertura agora captura o pedido no celular mesmo assim:
escolhe o cliente e os produtos do catálogo já baixado, confere o total e salva
na fila do aparelho — cada pedido com um número provisório para acompanhar.

Quando o sinal volta e o sistema é aberto, tudo o que estava na fila é enviado
sozinho, na ordem em que foi capturado. O número definitivo da empresa aparece
no lugar do provisório. Se o servidor recusar algum item (crédito, preço ou
estoque), ele fica marcado com o motivo para ser resolvido — nunca some em
silêncio.

O catálogo de produtos e clientes é baixado com um toque quando há internet, e
a tela mostra há quantos dias ele foi atualizado — preço antigo pode ser
recusado no envio, e quem vende precisa saber disso antes de prometer.

Detalhe técnico para quem opera: o envio usa uma chave que impede o pedido
duplicado quando a conexão cai no meio da transmissão. Sem ela, cada retry
criaria um pedido novo igual ao anterior.