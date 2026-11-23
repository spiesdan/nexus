---
impacto: nada_mudou
secao: corrigido
titulo: Reenviar mensagem com a mesma chave nao duplica o envio
---

POST /api/v1/messages agora le o header Idempotency-Key com o mesmo desenho das
rotas fiscais: a chave e reivindicada antes do envio. Mesma chave e mesmo payload
devolvem a mensagem original com o header Idempotency-Replayed; a mesma chave
com payload diferente devolve 409. Sem header, nada muda.

Nada a fazer na VPS.
