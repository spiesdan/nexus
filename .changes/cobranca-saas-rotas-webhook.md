---
impacto: capacidade_nova
secao: adicionado
titulo: Cobrança SaaS ganha assinatura, checkout, portal, webhook e avisos de vencimento
---

A assinatura exibida passa a vir do Stripe, nunca de valor fixo. Checkout e portal são criados no Stripe com o tenant resolvido da sessão, e o webhook valida a assinatura sobre o corpo bruto, guarda o evento por id e recusa evento fora de ordem. Avisos D-3/D-2/D-1 são persistidos por fatura e um cron diário compara o estado local com o Stripe. Stripe fora vira verificação com retry — nunca "pago" e nunca suspensão sem fatura vencida confirmada.
