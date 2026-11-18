---
impacto: nada_mudou
secao: alterado
titulo: Nota autorizada marca o pedido aprovado como faturado
---

Quando a NF-e de um pedido **aprovado** é autorizada pela SEFAZ, o pedido passa
sozinho para **faturado** — o mesmo estado do botão "Faturar pedido", agora sem
o clique manual e só depois de a nota existir de verdade.

A mudança é condicional: só o `aprovado` avança. `concluido`, `expedido` e
`entregue` já estão à frente e não regridem. Nota rejeitada ou ainda não
autorizada não mexe no pedido, e uma nota agrupada fatura todos os pedidos
aprovados que ela cobre.
