---
impacto: nada_mudou
secao: corrigido
titulo: Busca de produto do pedido: o código bipado não vira item errado
---

O `Enter` da busca de produto lançava **o primeiro resultado da lista**, qualquer que
fosse o termo: bipar um EAN que não existe, num catálogo onde outro produto casava por
trecho, adicionava o produto errado ao pedido — com o preço errado — e digitar três
letras e teclar `Enter` vendia o primeiro café do catálogo sem ninguém escolher. Agora o
`Enter` só lança o que é inequívoco: o **código exato** (o que o leitor bipa) ou o
resultado **único**; com vários candidatos, a tela pede a escolha e diz por quê.

Duas correções de apoio: o servidor passou a devolver o produto do código exato **na
frente** da lista limitada (antes, num catálogo grande, ele podia ser cortado pelo
`limit` e a tela dizer "nenhum produto encontrado" para um produto que existe), e a ficha
do produto passou a nomear o campo como "SKU, referência ou código de barras (EAN)" — é
ali que o EAN mora, sem uma segunda identidade para o mesmo produto.

Nada a fazer na VPS.
