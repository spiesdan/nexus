---
impacto: nada_mudou
secao: corrigido
titulo: Devolução deixa de ser tratada como nota duplicada
---

A trava que impede duas notas vivas para o mesmo pedido contava a **devolução**
(finalidade 4) como concorrente da nota de venda — e uma devolução é,
legitimamente, a segunda nota do mesmo pedido. Em produção isso abortou o
backfill de vínculos de itens: o pedido 19560 ficou com um vínculo só.

A trava passou a considerar a finalidade: devolução não ocupa o pedido, e nota
**cancelada** deixa de contar como viva ao vincular itens. Também foi corrigido o
bloco de schema que quebrava quando uma função tinha `search_path` vazio
(`set search_path = , pg_temp`), que era o erro visto no deploy.
