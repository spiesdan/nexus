---
impacto: nada_mudou
secao: corrigido
titulo: Tabela de formas de pagamento nao colide com a legada de producao
---

A tabela nova da 0334 passa a se chamar commercial_payment_methods. Producao
tem uma payment_methods legada (name/account_id/is_active, usada por sales)
que nao existe no baseline; o create if not exist era ignorado e o indice em
tipo quebrava o deploy da 1.63.0.

Rotas, tela e testes apontam para o nome novo. Um invariante reaplica a 0334
com a tabela legada presente e prova que as duas convivem.

Nada a fazer na VPS.
