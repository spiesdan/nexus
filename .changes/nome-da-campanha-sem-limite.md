---
impacto: nada_mudou
secao: corrigido
titulo: O nome da campanha não é mais cortado em 120 caracteres
---

O campo **Nome da campanha** parava de aceitar texto depois de 120 caracteres — e o servidor recusava o que a tela deixasse passar. Como a própria tela monta o nome a partir da lista de cidades, a campanha por região nascia com nome cortado no meio de uma cidade.

O limite saiu do formulário e da validação, nas quatro telas de campanha: região, prospecção, recuperação e venda automática. O nome é rótulo para o operador, não conteúdo de mensagem — a coluna é `text` e nada mais dependia dos 120.
