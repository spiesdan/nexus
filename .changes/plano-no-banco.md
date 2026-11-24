---
impacto: capacidade_nova
secao: adicionado
titulo: Plano SaaS passa a morar no banco, com R$ 1.699,00 e descrição definidos pelo dono
---

O plano Nexus (R$ 1.699,00, BRL, mensal, "Servidor, hospedagem, domínio e inteligência artificial") nasce no banco, não em código. Enquanto não há Price casado, a tela e o endpoint leem esses valores do banco. Quando `billing_plans.stripe_price_id` for preenchido, valor e descrição vêm do Stripe. A virada para live continua exigindo duas decisões explícitas no `.env`: `STRIPE_TEST_MODE=false` e `STRIPE_LIVE_CONFIRMADO=sim`.
