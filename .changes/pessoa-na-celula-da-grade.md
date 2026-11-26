---
impacto: nada_mudou
secao: corrigido
titulo: Nota avulsa mostra o cliente na coluna Pessoa (a célula, não só o filtro)
---

A correção anterior trocou o mapa da **busca** e do **CSV**, mas a célula da tabela continuou lendo `pessoas[order_id]` — e venda avulsa não tem pedido, então a coluna seguia mostrando "—". Reclamação do dono na própria nota 4677, depois do deploy. Agora a célula usa `pessoasAvulsas[invoice_id]` com o mesmo fallback, e um teste renderiza a grade e cobra o nome **no texto da tela** — a diferença entre "a prop chegou" e "o nome aparece".
