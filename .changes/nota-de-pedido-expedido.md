---
impacto: capacidade_nova
secao: adicionado
titulo: Nota fiscal também para pedido expedido ou entregue
---

O sistema só deixava emitir NF-e para pedido em `faturado`. Agora **expedido** e
**entregue** também emitem — o caso de quem manda a mercadoria primeiro e fatura
depois.

A expedição já levava o pedido para `expedido` ao embarcar e para `entregue`
quando a rota terminava, então esse pedido ficava travado sem nota até alguém
"voltar" o status. A regra agora vive num lugar só (`statusFaturavel`), usada
pela emissão, pela pré-validação e pelo assistente — os três não podem divergir.

O que **não** muda: `rascunho`, `em_analise`, `aprovado` e `cancelado` continuam
recusando a emissão. Antes disso é intenção, não fato fiscal.

Na tela de Notas, a aba *Emitir* passa a listar os pedidos faturados, expedidos e
entregues que ainda não têm nota.
