---
impacto: nada_mudou
secao: corrigido
titulo: Item sem vínculo com o catálogo não bloqueia mais a nota na pré-validação nem some do imposto aproximado
---

A correção de NCM por código/nome já valia na emissão. Faltavam duas telas que liam o vínculo direto: a **pré-validação** da nota (a que dizia "Falta NCM do produto") e o **imposto aproximado** do pedido. Agora as duas usam o mesmo resolvedor da emissão — vínculo, depois código, depois nome —, então um item que veio do Mercos sem `product_id` deixa de acusar falta de NCM quando o produto está no catálogo.
