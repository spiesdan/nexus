---
impacto: capacidade_nova
secao: adicionado
titulo: Sentinel devolve para a fila a conversa assumida e esquecida
---

Uma conversa com responsável há mais de 7 dias e sem mensagem some da fila sem
ninguém perceber: o claim não tem prazo. O Sentinel agora encontra esse caso e
oferece ao gestor simular a liberação, escrever o motivo, confirmar e devolver a
conversa para a fila — sem responsável.

A reversão só existe enquanto ninguém assumiu a conversa de novo. Se outro
agente já pegou, o sistema recusa em vez de roubar o claim. A ação não envia
mensagem e não toca em nota, pagamento, recebível nem campanha.

O webhook em dead-letter foi descartado como caso de correção: o arquivo de
webhooks é forense, não uma fila; mudar o status não faz ninguém reprocessar, e
reenviar o HTTP seria uma ação externa sem reversão honesta.
