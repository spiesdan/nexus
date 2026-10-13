---
impacto: nada_mudou
secao: adicionado
titulo: "Editar os itens de um pedido — inclusive depois de pronto"
---

**Não dava para alterar os itens de um pedido. Nunca.** Não depois de pronto,
não antes: em nenhum status. A rota `PATCH /api/v1/commercial-orders/[id]/itens`
não existia, e o `itensPatchSchema` estava escrito em `lib/schemas/pedidos.ts`
desde antes sem nada o consumindo.

O sintoma era "não consigo alterar o pedido depois que ele ficou pronto", e a
leitura natural disso está certa na consequência e errada na causa: nunca deu,
porque a rota nunca foi escrita. Havia até um teste — `pedido-itens-route.test.ts`
— que importava um `PATCH` inexistente, e por isso não rodava.

**A regra que o teste afirmava foi mudada de propósito.** Era *"só rascunho/
em_analise"*, com 422 para o resto. Você pediu para corrigir o pedido depois de
pronto, que é exatamente essa regra. A rota agora aceita e **avisa**: devolve
`avisos` dizendo o que a troca **não** estorna — comissão apurada, expedição,
nota emitida.

A rota não inventa a política de comissão, expedição e NF porque essa regra não
está escrita neste repositório. O que está escrito é o comportamento, e
quem decide a consequência é quem lê o aviso. Se um dia existir a regra, ela
entra aqui — com nome, com migration se precisar de coluna, com teste que a
nomeie.

**Um PATCH, não um por linha.** Adicionar, remover e ajustar vão num único
`PATCH`, num único "Salvar". PATCH item a item deixa o pedido com item novo e
total velho no meio da operação, e "total velho com item novo" é a forma mais
cara de errar num pedido comercial. Se o servidor recusar, nada foi gravado.

**`ajustar` mantém o id do item.** Trocar o conjunto inteiro criaria ids novos e
deixaria o `ajustar` da tela apontando para o nada, com tudo que guarde id de
item órfão.

**O que o editor faz pela tela:** botão "Editar itens" na própria lista de
produtos da ficha, quantidade/preço/desconto editáveis, remoção por linha, e
busca de produto para acrescentar — com o preço do catálogo como sugestão
editável, não como verdade. Preço de venda é da linha, e quem decide é quem
está na tela.

**Um bug que os testes acharam no caminho**

Remover o item 0 de uma lista de 2 fazia o item novo nascer no `posicao` 2 e o
`filter` de gravação o deixava de fora: a lista ficava `1,2` com um buraco no
`0`. Numa tela ordenada por posição, isso aparece como "o primeiro item sumiu",
sem erro nenhum. O teste de reindexação pegou; o serviço foi corrigido
para gravar a reindexação de todas as linhas, novas inclusive.

**Junto: o catálogo tinha teto escondido**

`GET /api/v1/products` cortava em **500** linhas com um `.limit(500)` solto. A
instalação tem **635 produtos**, e o editor de itens precisa do catálogo inteiro
para o seletor — com 500 fixos, os produtos acima do 500º **não apareceriam**,
sem erro e sem aviso. O limite virou parâmetro explícito (`limite`, padrão 500,
teto 2000). Falha silenciosa é a pior das três, e nenhuma delas é aceitável num
produto vendido como código.

**Mutações provadas:** `ajustar` sem recalcular subtotal reprova 6 testes; sem
reindexação reprova o de posição; a rota voltando a recusar pedido pronto
reprova 2; o `.limit()` voltando a 500 fixo reprova 5.