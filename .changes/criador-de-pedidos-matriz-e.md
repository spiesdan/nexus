---
impacto: nada_mudou
secao: corrigido
titulo: Criador de pedidos: scanner exato, tabela reprecificada e rascunho com dono
---

Cinco defeitos do editor de pedidos (`/app/pedidos/novo`), todos medidos com teste:
o `Enter` da busca lançava o **primeiro** resultado mesmo quando o código bipado não
era exato (EAN inexistente podia virar item errado) — agora só entra o código exato
ou o resultado único, e a tela diz quando é ambíguo; trocar a tabela de preço passou a
reprecificar os itens já lançados (o servidor recusava o pedido inteiro no fim, com
422); o pedido que estourava o limite de crédito passou a avisar **antes** de gerar;
o rascunho local deixou de ser uma gaveta única do navegador — a chave carrega
organização e usuário, então num balcão compartilhado uma vendedora não vê mais a
venda da outra; e o resumo do pedido virou região navegável, com nome nos campos de
desconto e frete.

Nada a fazer na VPS. Rascunhos locais salvos por versões anteriores (na chave sem
dono) **não** são retomados — é o preço de não mostrar a venda de outra pessoa; a
venda em andamento é redigitada uma vez.
