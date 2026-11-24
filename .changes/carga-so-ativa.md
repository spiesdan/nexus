---
impacto: nada_mudou
secao: corrigido
titulo: Pedido que já viajou volta a poder entrar em nova carga
---

A tela de pedidos disponíveis e a validação de inclusão olhavam **qualquer** linha de `shipment_orders` para dizer que um pedido "já está em outra carga" — enquanto o índice único do banco é parcial e só considera `na_carga` e `em_rota`. Resultado: pedido entregue numa carga antiga desaparecia da lista e a inclusão devolvia 409 para sempre. Agora as duas consultas usam os mesmos estados do índice: entregue, devolvido ou cancelado não ocupa, e o pedido pode ser embarcado de novo.
