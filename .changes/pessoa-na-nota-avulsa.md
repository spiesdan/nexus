---
impacto: nada_mudou
secao: corrigido
titulo: Nota avulsa mostra o cliente na coluna Pessoa
---

A grade de notas resolvia a pessoa pelo **pedido de origem** (`pessoas[order_id]`). Venda avulsa não tem pedido — `order_id` é nulo por desenho — então a coluna saía com "—" mesmo com o cliente preenchido na nota. O nome está no próprio documento (`extras_fiscais.avulsa.cliente_nome`, com o cadastro como reserva quando só há `contato_id`). A grade, o filtro de busca e a exportação CSV passam a ler de lá. Caso real: a nota 4677 (SENAI/Caninhas, R$ 216,00) aparecia sem pessoa.
