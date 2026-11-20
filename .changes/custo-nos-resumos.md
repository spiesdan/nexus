---
impacto: nada_mudou
secao: adicionado
titulo: Custo no resumo do recebimento e do pedido (sem mexer no preço)
---

O recebimento mostrava só "X/Y unidades recebidas" e o resumo do pedido mostrava
quantidade e valor, sem custo. Agora:

- **Recebimento**: unidades **e** valor — o do item da compra (o custo negociado
  com o fornecedor), tanto do que já entrou quanto do que está sendo digitado.
- **Resumo do pedido**: custo e margem, para quem vê margem (a mesma régua do
  criador). O número é o custo **atual do catálogo** — o item do pedido não
  guarda o custo da época — e a tela diz isso; quando algum item não tem custo
  (produto removido), o total é marcado como parcial.

Em nenhum dos dois o preço do pedido é recalculado. Nada a fazer na VPS.
