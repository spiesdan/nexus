---
impacto: nada_mudou
secao: corrigido
titulo: Pedidos avisa quando a lista tem mais do que mostra; Inbox fecha a decisão sobre fila offline
---

A lista de pedidos carrega no máximo 200 e não dizia isso: passando de 200 no
período, o pedido seguinte simplesmente não existia para quem olhava a tela.
Agora a tela mostra "Mostrando 200 de N pedidos no período — refine o período ou
a busca", com o total vindo da mesma consulta.

O Inbox **não** ganha fila de mensagens offline nesta fase, e isso passa a estar
escrito: a rota de envio não tem chave de idempotência, então reenviar em retry
pode duplicar, e mensagem não é caso de "reenviar até dar certo" (ordem, citação
e janela de atendimento entram na conta). O que existe é o que foi entregue:
sem rede, o envio é bloqueado, o texto fica e o aviso explica.

A expedição ganhou ficha de estados das subtelas (motorista, fechamento, rota),
incluindo o único outbox real do produto — o de desfecho de entrega.
