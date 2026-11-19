---
impacto: nada_mudou
secao: corrigido
titulo: Criador de pedidos em 320 px, por teclado e com leitor de tela
---

O resumo do pedido passou a ser uma **região navegável** (`role=region` com nome) e os
campos de desconto (R$ e %) e frete ganharam nome acessível — antes o leitor de tela
anunciava "editar, em branco" e não havia como pular direto aos totais. A busca de
produto passou a se chamar pelo que faz ("Buscar produto…", não a seção "Produtos") e a
lista virou `listbox` com `aria-selected`. A barra de ação do rodapé e a grade de
quantidade/preço/desconto de cada item passaram a quebrar linha em telas estreitas,
então a página cabe em **320 px** sem rolagem horizontal (medido no navegador por
`tests/e2e/criador-pedido-acessivel-320.spec.ts`, que roda no smoke).

Nada a fazer na VPS.
