# Plano curto — cobrança SaaS do Nexus via Stripe (modo de teste)

> **Estado: PLANO, aguardando aprovação do dono.** Nenhum código de produto foi
> escrito. Nenhuma chave live, nenhum deploy, nenhuma escrita em produção.
> Branch: `feat/cobranca-stripe`.

## 1. Fatos confirmados (medidos, não suposição)

| Fato | Evidência |
|---|---|
| Não existe Stripe no repo (SDK, env, tabela) | `grep` em `*.ts/tsx/sql/md` → 0 |
| Suspensão hoje é `organizations.status='suspended'` + `suspended_at/reason/by` | `app/api/v1/admin/tenants/[id]/suspend/route.ts` |
| O gate atual é **só de UI** (`/app/*` → `/account-suspended`); APIs não bloqueiam | `app/app/layout.tsx:124-127` |
| `billing_*` não existe no banco local; no baseline só aparece `billing_address` como string de endereço | `information_schema` + `supabase/baseline.sql` |
| Webhooks já são públicos no proxy (`/^\/api\/v1\/webhooks\//`), com verificação HMAC `timingSafeEqual` em outras rotas | `lib/auth/public-paths.ts`, `app/api/v1/webhooks/nuvemshop/*` |
| Pagamentos de tenants (pedidos/notas/financeiro) são outro domínio — não misturar | `app/api/v1/commercial-orders`, `financial_receivables` |
| Tripla obrigatória: migration + apêndice no baseline + **linha acrescentada** no MANIFEST | `CLAUDE.md` §Migrations; incidente #818 |

## 2. Decisões comerciais pendentes (NÃO inventar)

Plano, preço, moeda, trial, desconto, cupom e dia de vencimento **não são
decididos aqui**. A estrutura grava o que o Stripe devolver (`amount`, `currency`,
`period_end`) e expõe `STRIPE_PRICE_ID`/`STRIPE_TEST_MODE`; o valor exibido vem
do objeto do Stripe, nunca de constante no código. Estes itens viram proposta:
(1) plano(s) e preço, (2) responsável financeiro por tenant, (3) dia de corte,
(4) política de cartão recusado. Nada disso é preenchido nesta fatia.

## 3. Tabelas (8, todas prefixadas `billing_*`)

| Tabela | Papel |
|---|---|
| `billing_customers` | vínculo `organization_id ↔ stripe_customer_id`, estado local |
| `billing_subscriptions` | `stripe_subscription_id`, status, `current_period_end`, preço devolvido pelo Stripe |
| `billing_invoices` | `stripe_invoice_id`, valor/moeda **do Stripe**, vencimento, status, `paid_at` |
| `billing_checkout_sessions` | sessão criada, expiração, `used_at` (um checkout = um tenant) |
| `billing_notices` | D-3/D-2/D-1 por fatura+etapa, `unique(invoice_id, etapa)`, canal/horário/resultado/falha sem segredo |
| `billing_events` | `stripe_event_id` único, tipo, hash do payload, `processed_at`, marca de fora-de-ordem |
| `billing_verifications` | verificação pendente quando o Stripe falha, `next_attempt_at`, tentativas |
| `billing_suspensions` | suspensão/reativação por fatura, com autor (sistema), motivo e versão do evento que a causou |

Todas tenant-aware com `organization_id not null`, RLS por
`fn_user_org_ids()`/`fn_role_at_least('admin')`, leitura restrita, escrita só
service role nos workers/webhook. Antes de criar, conferir em produção com
`to_regclass('public.billing_*')` — se existir legado, paramo e renomeamos.

## 4. Arquivos/módulos (≈38)

- **Schema (4)**: migration `20261124..._0341_billing_stripe.sql`, `supabase/baseline.sql`
  (apêndice idempotente), `supabase/migrations/MANIFEST.md` (**+1 linha**),
  `lib/database.types.ts` (regenerado, nunca editado à mão).
- **Core `lib/billing/` (7)**: `stripe-client.ts` (lazy, `sk_test_` only, fail-closed),
  `config.ts`, `estado.ts` (máquina de estados), `notices.ts` (D-3/2/1),
  `suspensao.ts` (gate + allowlist), `webhook.ts` (corpo bruto, HMAC, idempotência,
  ordenação), `reconciliacao.ts` (local × Stripe).
- **Rotas (6)**: `app/api/v1/billing/subscription/route.ts` (GET),
  `.../checkout/route.ts`, `.../portal/route.ts`,
  `app/api/v1/webhooks/stripe/route.ts`,
  `app/api/v1/cron/billing-notices/route.ts`,
  `app/api/v1/cron/billing-reconcile/route.ts`.
- **Auth/gate (2)**: `lib/auth/require-role.ts` (chamada ao helper de suspensão,
  com allowlist `billing:*`, suporte, logout e `/account-suspended`; plataforma
  bypassa), `lib/auth/public-paths.ts` (confirmar webhook, sem abrir rotas de UI).
- **Notificações (2)**: `lib/billing/entregas.ts` (e-mail via `lib/email/resend.ts`,
  in-app via `lib/notifications/emit.ts`, WhatsApp via helper WAHA existente),
  `lib/billing/link-seguro.ts` (HMAC com expiração para pagar/atualizar cartão).
- **UI (5)**: `app/app/billing/page.tsx`, `_client.tsx`,
  `components/billing/{StatusAssinatura,AvisosDeCobranca,AcoesDePagamento}.tsx`,
  `app/account-suspended/page.tsx` (se existir, adaptar; senão criar),
  `lib/navigation/registry.ts` (porta da tela).
- **Env (3)**: `lib/env.ts`, `.env.example`, `.env.hostgator.example` —
  `STRIPE_SECRET_KEY` (somente `sk_test_`), `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_ID`, `STRIPE_TEST_MODE=true`, `BILLING_NOTICE_DIAS=3,2,1`,
  `BILLING_RECONCILE_MINUTOS`.
- **Testes/invariantes (7+)**: `tests/unit/billing-{estado,notices,webhook,suspensao,link}.test.ts`,
  `tests/invariants/billing-rls-isolation.test.ts`,
  `tests/e2e/assinatura-billing.spec.ts` (responsivo/pendente/suspenso),
  `tests/unit/env-example-sync.test.ts` (já existe, cobre as duas cópias).
- **Docs (2)**: este plano + `docs/doctrine/cobranca-stripe.md` (contratos,
  variedades de evento, reconciliação, rollback).

**Total: 8 tabelas, ≈38 arquivos** (contando schema, core, rotas, UI, env, testes e docs).

## 5. Comportamento (regras a implementar)

1. **Customer/assinatura**: checkout cria sessão e grava `billing_checkout_sessions`;
   o estado local só muda quando o webhook confirmar. Portal só se compatível com
   o modo de teste e a conta; se não, action de pagar via checkout.
2. **Avisos D-3/D-2/D-1**: Porto/empresa responsável financeira; `unique(invoice_id,
   etapa)` + checagem de `sent_at` → repetir worker não reenvia. Fatura criada com
   menos de 3 dias **não dispara D-3 nem D-2 retroativos**: só a próxima etapa
   futura. Pago/cancelado → cancela avisos pendentes. Registro por etapa:
   `canal, enviado_em, resultado, motivo_de_falha` (sem cartão/token/CPF).
3. **Suspensão no vencimento**: job diário compara `due_at < now()` e
   `paid_at is null`; sem tolerância. Aplica `organizations.status='suspended'`
   com `suspended_reason='billing'` e linha em `billing_suspensions`. Gate
   **backend** em `requireRole`, não só na tela: permite cobrança (`billing:*`),
   suporte, logout e a tela de suspenso. Preserva todos os dados; nunca para a
   aplicação nem muda outra org.
4. **Reativação**: `invoice.paid` marca fatura paga, limpa avisos pendentes,
   remove bloqueio daquela fatura e volta `organizations.status='active'`. Evento
   atrasado (criado antes da reativação ou com versão menor) **não resuspende**.
5. **Webhook**: `Stripe-Signature` verificado sobre o **corpo bruto** com
   `timingSafeEqual`, fail-closed sem secret. `stripe_event_id` único (`23505` =
   duplicado, 200). Fora de ordem é registrado em `billing_events` e **não**
   reaplica estado antigo. `organization_id` vem de `billing_customers`, nunca do
   corpo. Eventos: `invoice.paid`, `invoice.payment_failed`,
   `invoice.payment_action_required`, `customer.subscription.updated/deleted`,
   `checkout.session.completed`. Logs só ids/hash — nunca segredo ou cartão.
6. **Stripe indisponível**: `billing_verifications` com `next_attempt_at` e
   backoff; ausência de resposta **não** é pago e **não** é suspensão definitiva.
   Variedade exposta na UI como “verificação pendente”.
7. **UI**: status real do servidor (`sem assinatura`, `ativa`, `pendente`,
   `falha`, `sem conexão`, `suspensa`), valor/moeda/vencimento reais do Stripe,
   ações pagar/atualizar cartão, avisos e caminho de regularização. Nunca
   “pagamento confirmado” otimista. Responsivo, 44 px, foco/aria/contraste.
8. **Auditoria/reconciliação**: `audit()` nas mutações relevantes; job compara
   estado local × Stripe e reporta divergência (sem auto-correção destrutiva).

## 6. Riscos (maior primeiro)

1. **Gate de suspensão no `requireRole`** — é o ponto de maior raio: uma
   allowlist errada tranca até quem precisa pagar ou dar suporte. Mitigação:
   helper isolado, plataforma bypass, testes de permissão/cobrança/saída e
   variável de kill-switch do gate; nenhuma suspensia afeta outra org.
2. **Webhook fora de ordem/duplicado** poderia ressuspender tenant regularizado
   ou marcar pago sem lastro. Mitigação: `unique(event_id)`, versão do evento em
   `billing_suspensions`, comparação com `paid_at`.
3. **Colisão de nomes legados em produção** (`billing_*` fora do baseline):
   checar `to_regclass` antes de criar; se existir, parar e propor prefixo novo.
4. **Chave live/deploy acidental**: `sk_test_` obrigatório, `STRIPE_TEST_MODE`
   default `true`, nenhuma escrita em produção, nenhum deploy nesta fatia.
5. **Dados sensíveis em log**: centralizar higienização e não logar payload cru.

## 7. Validações

- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`,
  `pnpm test:db` (schema/RLS/idempotência — Docker, baseline install+update),
  `pnpm test:shell` (kit), gates de UI (captura + axe) quando a UI existir.
- Casos obrigatórios: D-3/D-2/D-1 exatos · aviso único com worker repetido ·
  cobrança perto do vencimento sem retroativo · pagamento antes do vencimento
  cancela avisos · suspensão no vencimento · **sem tolerância** · reativação ·
  webhook inválido/duplicado/fora de ordem · isolamento cross-tenant e permissão
  de cobrança · falha temporária da Stripe sem estado errado · UI responsiva.
- Prova pós-implementação (sem deploy): `STRIPE_TEST_MODE=true` e eventos de
  teste do Stripe CLI em webhook local; **nada aponta para produção**.

## 8. Living System Checklist (resposta antecipada)

- **Entrada**: checkout e webhookStripe (porta pública própria).
- **Saída**: avisos (e-mail/in-app/WhatsApp), suspensão/reativação no backend,
  tela de assinatura e tela de suspenso.
- **Log**: `api_audit_log` + `billing_events`/`billing_notices` com horário/canal.
- **Tela**: `/app/billing` registrada no `lib/navigation/registry.ts`.
- **Anti-morte**: `billing_verifications` com retry; ausência de Stripe nunca
  vira “pago” nem suspensão definitiva; reconciliação periódica.
- **Laço de retorno**: se o aviso falha ou o webhook não chega, a verificação
  pendente/reconciliação torna a falha visível na tela e no log; se a suspensão
  errar, o kill-switch devolve o tenant ao estado anterior registrado.
