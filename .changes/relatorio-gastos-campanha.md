---
impacto: capacidade_nova
secao: adicionado
titulo: Relatorio mensal de gastos da campanha com exportacao CSV
---

GET /api/v1/prospecting/relatorio-gastos mostra, por campanha e no mes corrente,
orcamento (prospeccao + midia), gasto real de prospeccao e midia lancada
manualmente. O mesmo guard de 80/100% decide o estado e o proximo passo.
O parametro formato=csv devolve a mesma visao em planilha.

Sem tabela nova: os dados ja existiam nas colunas da campanha, em
prospecting_searches e em prospecting_campaign_spend.

Nada a fazer na VPS.
