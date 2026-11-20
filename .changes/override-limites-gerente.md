---
impacto: nada_mudou
secao: adicionado
titulo: Gerente libera crédito ou estoque no pedido, com motivo e auditoria
---

`ignorar_estoque` e `ignorar_credito` existiam só na API: o poder de passar por
cima do limite era invisível — quem mandasse a requisição com o cookie certo
liberava, e ninguém na tela sabia que aquilo era possível.

Agora, quando o pedido estoura o limite de crédito do cliente ou falta estoque,
o **gerente** vê o bloco "Ignorar um limite", marca o que está liberando e
escreve o **motivo**. O motivo é obrigatório: sem ele a tela não gera o pedido e
o servidor recusa com 422. Cada override fica na auditoria com o nome de quem
liberou, o que foi ignorado e o motivo declarado.

O preço negociado à mão (`ignorar_preco`) segue com o fluxo próprio de antes.
Nada a fazer na VPS.
