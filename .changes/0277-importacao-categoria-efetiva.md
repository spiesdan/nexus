---
impacto: nada_mudou
secao: corrigido
titulo: Empresa nova já nasce com a categoria efetiva resolvida
---

A ingestão gravava só o rótulo cru do Google. Uma cafeteria classificada como
"Gas station" entrava na base com a categoria efetiva vazia, e o filtro/faceta
de Empresas voltava a mostrá-la como posto até alguém rodar um backfill manual.

Agora a inserção usa a categoria principal do provider (o termo da busca é a
BUSCA, não o que o estabelecimento é) e grava `categoria_canonica`,
`categoria_revisar` e `categoria_confianca` na mesma transação. Linha ambígua
nasce em revisão e fora de campanha, igual à base já existente.

A secundária que apenas repete o rótulo primário ("Gas station" em
`categorias`) deixou de contar como evidência independente: era ela que anulava
a revisão de nomes como "Branca".
