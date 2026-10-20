---
impacto: nada_mudou
secao: corrigido
titulo: PDF do pedido para de sobrepor descrição e valores, e pagina por altura real
---

A descrição do produto era desenhada numa linha só e passava por cima das
colunas de Qtde., Unidade e Preço em qualquer nome acima de ~30 caracteres —
um pedido em cada três no histórico importado. Agora o texto é medido antes de
ser desenhado, quebra dentro da coluna e empurra as linhas seguintes, com a
régua da linha descendo junto.

A paginação deixou de contar 30 itens fixos e passou a somar a altura real de
cada linha quebrada: um pedido com descrições longas não empurra mais a cauda
(totais, condição e vendedor) para fora da folha. O rodapé ganhou a paginação
"Pedido Nº X · página N de M" quando o pedido ocupa mais de uma folha.

O código do produto, que nas notas importadas carrega descrições compradas
("RODO DE ALUMINIO 1MT C/ CABO 1,50MT REF025"), é truncado com reticências em
vez de virar quatro linhas e abrir um clarão nas colunas de valor. Os rótulos
Qtde./Preço Líquido/Subtotal passaram a alinhar à direita com os valores, o
cabeçalho da grade ganhou um cinza claro e o total saiu em negrito.

O documento do cliente também deixou de sair rotulado errado: cadastro sem
`tipo_pessoa` com CPF de 11 dígitos imprime "CPF", não "CNPJ" (pedido 18458).
