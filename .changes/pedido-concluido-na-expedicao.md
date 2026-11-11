---
impacto: nada_mudou
secao: corrigido
titulo: O pedido concluído no Mercos entra na Expedição; faturado volta a significar NF-e
---

O Mercos marca **Concluído** quando a venda fecha. O mapper do worker traduzia
isso para `faturado` — e como a Expedição lia `faturado`, o pedido aparecia
na fila, mas com a rótulo errada: quem não tinha nota emitida algum dia seria
chamado de "Faturado".

Agora o ciclo comercial tem `concluido` (venda fechada no ERP, mercadoria no
depósito, sem nota) e `faturado` volta a ser exclusivo de quem tem NF-e gerada
(`Faturado`/`Parcialmente Faturado` no Mercos). A Expedição passa a embarcar
`aprovado`, `concluido` e `faturado`. A revisão automática corrige o status dos
pedidos que já existem, sem regredir quem está em carga ou com nota emitida.
