---
impacto: nada_mudou
secao: corrigido
titulo: O pedido novo aparecia sem o cliente, a lista escondia o pedido e o "Buscar dados" limpava o formulário
---

Quatro defeitos da tela de pedidos, todos com a mesma assinatura: a tela dizia
que tinha dado certo e o dado não estava lá.

O **"Buscar dados" do CNPJ** lia a resposta da API como se ela fosse o contato,
mas a API embrulha tudo em `{ data }`. Os campos chegavam `undefined` e eram
copiados por cima do que a pessoa tinha digitado — o botão limpava o CNPJ e a
razão, com toast de sucesso. Agora desembrulha.

O **pedido recém-criado** não aparecia na lista: o `router.push` ia para
`/app/pedidos` e o cache de navegação do Next servia a página anterior por até
30 segundos. O redirecionamento agora invalida esse cache.

O **cliente recém-cadastrado** não aparecia no seletor do pedido. A tela recebia
só a primeira página de 500 contatos da organização (em ordem alfabética) — numa
base de milhares, quase nenhum cliente novo está nela. A busca do seletor agora
pergunta ao servidor e procura na base inteira.

O **erro #418** (`text content does not match`) vinha da hidratação: o
agrupamento por dia usava o fuso do runtime, então o servidor (UTC) e o
navegador (UTC−3) discordavam para todo pedido criado entre 21h e meia-noite, e
os filtros salvos eram lidos do `localStorage` antes da hidratação. O dia agora
sai de um fuso único (`lib/tempo/dia.ts`) e os filtros entram depois de montar.
