---
impacto: capacidade_nova
secao: adicionado
titulo: Cancelar pedido devolve o estoque, e o pedido tem estados claros
---
Cancelar um pedido não devolvia o que tinha saído do estoque, e uma compra
cancelada continuava contando como recebida. O saldo do produto ficava errado
sem que ninguém tivesse mexido nele.

Agora:

- **Cancelar pedido devolve o estoque** dos itens, com registro de quem cancelou.
- **Cancelar compra estorna automaticamente** o que tinha sido recebido.
- O pedido tem uma máquina de estados visível, com o botão
  **Marcar como concluído** (orçamento → aprovado → concluído) em vez de status
  soltos.
- O ajuste de saldo usa uma operação atômica: duas pessoas mexendo no mesmo
  produto ao mesmo tempo não perdem movimento.
- Duplicar um pedido não dobra mais o desconto.

Os números de estoque e de compras passam a fechar com o que aconteceu.
