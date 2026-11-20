---
impacto: nada_mudou
secao: corrigido
titulo: Pedido com tabela de preço ativa cobrava o preço de catálogo
---

Quem escolhia a tabela de preço **antes** de lançar os itens — o caminho comum —
recebia o item pelo preço de catálogo, e a linha ainda dizia "preço da tabela".
O `adicionar` montava o preço a partir de `produto.preco_cents` e só rotulava a
origem por existir tabela; o desconto da tabela (e o override por produto) só
apareciam quando a tabela era trocada **depois** do item lançado.

Agora o preço da linha é o que a tabela ativa manda: override do produto, senão
o desconto da tabela, senão o preço de catálogo — e a origem exibida é a que
vale. Quem digita preço à mão continua marcado como manual e não é sobrescrito.

Nada a fazer na VPS.
