---
impacto: nada_mudou
secao: corrigido
titulo: Pedido preso deixa de contar resíduo de importação sem autor
---

Rascunho importado do Mercos não tem `created_by` e não é trabalho abandonado.
A regra `operacao.pedido_preso` passou a exigir autor humano; com os dados da
organização real, as ocorrências caem de 121 para 1. A evidência mostra o autor,
e a ocorrência de lead duplicado ganhou link navegável por lead, sem mesclar
nada automaticamente.
