---
impacto: nada_mudou
secao: corrigido
titulo: Webhook do Stripe usa o verificador de assinatura reconhecido pelo gate
---

A verificação HMAC do webhook do Stripe passou a usar o helper compartilhado `verifyInboundSignature`, o mesmo nome reconhecido pelos gates de service role e de suspensão. A checagem continua sobre o corpo bruto, com tolerância curta e comparação em tempo constante — nenhuma autorização foi afrouxada.
