---
impacto: capacidade_nova
secao: adicionado
titulo: Exportacao CSV da fila de orcamentos parados
---

GET /api/v1/commercial-orders/orcamentos-parados?formato=csv exporta a MESMA
fila da tela, com numero, cliente, valor, idade, limite, proximo passo e total.
Nao e uma segunda consulta nem planilha morta: cada linha leva sua acao.

Nada a fazer na VPS.
