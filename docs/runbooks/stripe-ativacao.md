# Ativação da cobrança SaaS (Stripe)

## Onde as chaves entram

No **`.env` da VPS**, nunca no código e nunca em query string:

```bash
STRIPE_SECRET_KEY=sk_test_...        # ou sk_live_... (ver regra abaixo)
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...            # legado; ver "fonte do preço"
STRIPE_TEST_MODE=true
STRIPE_LIVE_CONFIRMADO=
BILLING_NOTICE_EMAIL=cobranca@exemplo.com
```

Depois de editar o `.env`, **reinicie o container**:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app worker scheduler mercos
```

## Modo live é decisão explícita

A aplicação **nunca** liga a cobrança real só porque uma `sk_live_` apareceu.
São necessárias **duas** variáveis juntas:

```bash
STRIPE_TEST_MODE=false
STRIPE_LIVE_CONFIRMADO=sim
```

Se só uma estiver presente, o boot falha com mensagem dizendo qual falta.
Isso vale também para `rk_live_`. O plano e o preço ainda precisam estar
decididos pelo dono — a confirmação não os cria.

## Fonte do valor e da descrição (uma verdade só)

- **Enquanto `billing_plans.stripe_price_id` estiver vazio**, a tela e
  `GET /api/v1/billing/subscription` leem **do banco**: nome `Nexus`, descrição
  "Servidor, hospedagem, domínio e inteligência artificial", **R$ 1.699,00**
  (`valor_cents = 169900`, `moeda = BRL`, `intervalo = mensal` — premissa
  registrada na migration 0352).
- **Quando `billing_plans.stripe_price_id` for preenchido**, o **Stripe manda**:
  valor e descrição vêm do Price. O `STRIPE_PRICE_ID` do `.env` passa a ser
  **somente legado** para o checkout; deixe as duas referências iguais ou
  remova a variável do `.env` para não haver duas verdades.

Não existe `169900` em TypeScript — o número só vive no banco (e no Price).

## Webhook

Cadastre no Stripe:

```
https://<seu-dominio>/api/v1/webhooks/stripe
```

Eventos necessários: `invoice.paid`, `invoice.payment_failed`,
`invoice.payment_action_required`, `customer.subscription.updated`,
`customer.subscription.deleted`, `checkout.session.completed`.

A assinatura é verificada sobre o **corpo bruto** com o
`STRIPE_WEBHOOK_SECRET`. Evento repetido é idempotente por `stripe_event_id`;
evento antigo é marcado como fora de ordem e não reaplica estado.

## Estrutura indisponível

Stripe fora **não** significa pago e **não** significa suspenso: a falha vira
linha em `billing_verifications` com retry. Suspensão só com fatura vencida
confirmada pelo webhook.
