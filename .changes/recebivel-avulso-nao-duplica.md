---
impacto: nada_mudou
secao: corrigido
titulo: Recebível avulso não duplica quando o envio é repetido
---

Criar um recebível avulso (sem pedido) não honrava o cabeçalho
`Idempotency-Key` que o próprio cliente do produto envia: um retry por
timeout — ou um segundo clique — criava as parcelas de novo, e o cliente
ficava com duas dívidas do mesmo valor no mesmo mês.

Agora a rota usa a chave: repetir a mesma requisição devolve as mesmas
parcelas, sem inserir; reutilizar a chave com outro corpo é recusado com 409,
em vez de virar um cache errado. O mecanismo vive num lugar só
(`lib/api/idempotencia.ts`), pronto para as demais rotas de criação.
