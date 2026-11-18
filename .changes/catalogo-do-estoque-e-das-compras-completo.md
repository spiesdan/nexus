---
impacto: nada_mudou
secao: corrigido
titulo: Catálogo do estoque e das compras não esconde mais produto
---

As duas telas pediam o catálogo sem limite e recebiam 500 linhas por padrão. No
estoque, "menor saldo" era o menor dentro dos 500 primeiros por nome: um produto
com saldo baixo além do corte simplesmente não aparecia. Em compras, o seletor
de item não tinha o produto.

As duas passaram a pedir o teto da rota (2.000) e a declarar a amostra quando o
catálogo ainda excede. Falha de leitura das compras deixou de virar seletor
vazio: mostra o erro com "Tentar novamente" no diálogo.
