---
impacto: nada_mudou
secao: corrigido
titulo: Tela de cobrança volta a consultar o Stripe
---

A rota chamava `/customers/{id}/subscriptions?status=all`, mas as versões novas da API do Stripe recusam `status` nesse caminho (400 "Received unknown parameter: status") — e a tela de cobrança exibia "não conseguimos consultar o Stripe" com a chave e a rede funcionando. A listagem passou para `/subscriptions?customer=...&status=all`, que é o caminho que aceita o filtro. Medido em produção com a chave real: 200 com a assinatura.
