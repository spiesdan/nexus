# 82 — Billing do tenant: da frase "Em breve" para a cobrança real

A tela `/app/settings/billing` era placeholder. Agora consome **somente** `GET /api/v1/billing/subscription`: status, valor, moeda, vencimento e avisos vêm da rota (que lê Stripe com cache local), nunca de constante. Nenhum número de cartão aparece; nenhum "pagamento confirmado" é escrito pelo cliente — a confirmação é do webhook.

## Estados

| Estado | O que diz | Ação |
| --- | --- | --- |
| sem assinatura | "Sem assinatura", sem plano | Pagar / regularizar (checkout) |
| ativa | plano, valor, moeda, vencimento, situação no provedor | Gerenciar forma de pagamento (portal), com checkout como caminho se o portal falhar |
| pendente | `past_due`/`unpaid`/`incomplete*`: "Pagamento pendente" | Pagar / regularizar |
| falha | status desconhecido: "Assinatura em situação irregular" | Pagar / regularizar |
| sem Stripe | `fonte: local_cache` ou erro: "último estado conhecido — nunca afirmamos pagamento confirmado" | Tentar novamente |
| suspensa | "Conta suspensa por cobrança", link para `/account-suspended` | Pagar / regularizar |

Valor nulo mostra "plano não configurado" e o e-mail de suporte da instalação (`SUPPORT_EMAIL`, quando configurado). Avisos D-3/D-2/D-1 vêm de `billing_notices` (data, canal, resultado) e "o que vem" é calculado pelo serviço `ETAPAS`/`etapasPendentes` — a rota de subscription passou a devolver `avisos` e `proximos`. Nenhuma rota nova foi criada: as três existentes (subscription, checkout, portal) foram usadas; subscription só ganhou os dois campos.

**Limite medido:** uma organização `suspended` é redirecionada por `app/app/layout.tsx` para `/account-suspended` antes de chegar ao billing. Por isso a tela também reconhece `status: "suspenso"` no payload da API; na prática, quem está suspenso vê a tela de conta suspensa, e o billing mostra o estado suspenso se o status mudar enquanto a página está aberta. Não foi inventado link de volta que fosse dar redirect.

Capturas: `capturas/billing-{sem,ativa,pendente,suspensa}-light_{1440,390}.png` e o par claro/escuro de `ativa` (`billing-ativa-{light,dark}_{1440,390}.png`). Contrato mockado; role de admin e valores do fixture foram alterados e revertidos no banco local. Console limpo e overflow 0 nas 10 combinações. Testes: `billing-tenant` (8).
