---
impacto: nada_mudou
secao: corrigido
titulo: Criação de carga aceita pedido que já viajou e remoção não deixa furo na sequência
---

A criação de carga passou a usar a mesma regra do índice parcial: só `na_carga` e `em_rota` ocupam o pedido. Pedido de carga concluída volta à fila e pode ser embarcado de novo; pedido em carga ativa continua com 409. Tirar um pedido da carga agora apaga e renumera os demais na mesma transação, sem deixar sequência 1,3.
