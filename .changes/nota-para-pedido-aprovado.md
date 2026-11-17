---
impacto: capacidade_nova
secao: adicionado
titulo: Pedido aprovado também pode gerar NF-e
---

A emissão só aceitava pedido concluído, faturado, expedido ou entregue. Agora o
pedido **aprovado** também entra na fila: quem aprova o orçamento pode emitir a
nota sem antes marcar o pedido como faturado (o que diria, mentindo, que a nota
já existia no ERP).

A regra é uma só — `STATUS_FATURAVEL` — e vale para a lista de "Emitir nota", a
pré-validação da emissão e o assistente. `rascunho` e `em_analise` continuam
sendo intenção, não fato fiscal.
