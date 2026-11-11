---
impacto: nada_mudou
secao: corrigido
titulo: O PDF do pedido imprime endereço, documento e cliente como o Mercos
---

O impresso do pedido repetia o endereço inteiro no campo "Endereço" — bairro,
cidade, UF e CEP saíam de novo nas linhas de baixo —, imprimia CNPJ, CEP e
telefone crus e deixava o bloco "Informações adicionais" de fora. O cliente
recebia um papel diferente do que o Mercos gera para o mesmo pedido.

Agora o campo "Endereço" leva só rua, número e complemento; o documento sai
pontuado (85.168.318/0001-39), o CEP com hífen e o telefone como o papel mostra
(42 99925-8697, sem o +55). O nome do cliente perde o prefixo de fantasia que o
importador colou ("MARMORARIA GLORIA - ..."), a cidade perde o estado que veio
junto ("Porto União, Santa Catarina"), o vendedor importado volta a aparecer
quando não há usuário do CRM, e o texto de "Informações adicionais" do Mercos é
impresso no bloco dele, entre o telefone e a grade.

O cinza que nós tínhamos posto no cabeçalho da grade saiu: no Mercos ele é
branco.
