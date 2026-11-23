---
impacto: nada_mudou
secao: alterado
titulo: Botao da ficha do pedido agora diz Editar pedido
---

O botao da secao de produtos dizia "Adicionar produto ao pedido" e abria so a
edicao de itens. Agora diz "Editar pedido" e abre tambem a edicao de detalhes
(condicao, transportadora, endereco e observacoes) na mesma visita.

Os dois "Salvar" continuam separados de proposito: o PATCH de itens e atomico
(DELETE + INSERT + recalculo) e o de detalhes e outro PATCH. Junta-los num so
botao deixaria total velho com item novo se uma das duas metades falhasse.

Nada a fazer na VPS.
