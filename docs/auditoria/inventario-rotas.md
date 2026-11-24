# Inventário gerado — rotas do checkout

> **Gerado por comando, não escrito à mão.** `pnpm exec tsx scripts/auditoria/inventario.ts`
> reescreve este arquivo e `inventario.json`. Se um número aqui divergir do código, o
> comando está certo e o texto envelheceu — rode de novo.

Gerado em 2026-11-23T10:55:25.728Z.

| Medida | Valor |
|---|---|
| Telas (`page.tsx` com JSX) | **147** |
| Resolvers/redirects (sem JSX) | 13 |
| Handlers de API (`app/api/**/route.ts`) | **449** |
| Layouts | 13 |
| Páginas de erro (`error.tsx`) | 8 |
| Estados de rota (`loading`/`not-found`/`template`/`default`) | 9 |
| Arquivos especiais (manifest/sitemap/robots/ícones) | 2 |
| Migrations SQL | 320 |

## Telas por grupo

| Grupo | Telas |
|---|---|
| administração | 21 |
| app (outros) | 7 |
| atendimento | 2 |
| configuração | 23 |
| crm | 5 |
| expedição | 7 |
| financeiro | 2 |
| fiscal | 13 |
| ia | 22 |
| insights | 4 |
| onboarding | 8 |
| público e legal | 16 |
| receita | 9 |
| vendas e catálogo | 8 |

## APIs por prefixo

Prefixo de quatro segmentos; agrupa o que o router separa em dezenas de arquivos.

| Prefixo | Handlers |
|---|---|
| `/api/v1/ai` | 69 |
| `/api/v1/prospecting` | 35 |
| `/api/v1/cron` | 31 |
| `/api/v1/shipments` | 26 |
| `/api/v1/admin` | 22 |
| `/api/v1/conversations` | 21 |
| `/api/v1/leads` | 13 |
| `/api/v1/commercial-orders` | 12 |
| `/api/v1/contacts` | 12 |
| `/api/v1/invoices` | 10 |
| `/api/v1/sentinel` | 10 |
| `/api/v1/team` | 10 |
| `/api/v1/products` | 9 |
| `/api/v1/webhooks` | 9 |
| `/api/v1/financeiro` | 8 |
| `/api/v1/fiscal-entradas` | 8 |
| `/api/v1/pipelines` | 7 |
| `/api/v1/agenda` | 6 |
| `/api/v1/automatic-sales` | 5 |
| `/api/v1/automation-rules` | 5 |
| `/api/v1/channels` | 5 |
| `/api/v1/fleet` | 5 |
| `/api/v1/lgpd` | 5 |
| `/api/v1/system` | 5 |
| `/api/v1/channel-sessions` | 4 |
| `/api/v1/fiscal-inutilizacoes` | 4 |
| `/api/v1/device` | 3 |
| `/api/v1/fiscal-ibpt` | 3 |
| `/api/v1/price-tables` | 3 |
| `/api/v1/purchase-orders` | 3 |
| `/api/v1/settings` | 3 |
| `/api/v1/webhook-sources` | 3 |
| `/api/v1/alertas` | 2 |
| `/api/v1/assistente` | 2 |
| `/api/v1/attendants` | 2 |
| `/api/v1/audit` | 2 |
| `/api/v1/categories` | 2 |
| `/api/v1/commissions` | 2 |
| `/api/v1/fiscal-cfop-equivalentes` | 2 |
| `/api/v1/fiscal-settings` | 2 |
| `/api/v1/inventory` | 2 |
| `/api/v1/message-templates` | 2 |
| `/api/v1/messages` | 2 |
| `/api/v1/metrics` | 2 |
| `/api/v1/offline-devices` | 2 |
| `/api/v1/onboarding` | 2 |
| `/api/v1/payment-methods` | 2 |
| `/api/v1/tarefas` | 2 |
| `/api/v1/titulos` | 2 |
| `/api/auth/signout` | 1 |
| `/api/internal/agents` | 1 |
| `/api/internal/observabilidade` | 1 |
| `/api/mcp` | 1 |
| `/api/v1/atividades` | 1 |
| `/api/v1/auth` | 1 |
| `/api/v1/comercial` | 1 |
| `/api/v1/commercial-goals` | 1 |
| `/api/v1/commercial-policies` | 1 |
| `/api/v1/conversation-tags` | 1 |
| `/api/v1/copilot` | 1 |
| `/api/v1/demandas` | 1 |
| `/api/v1/faturamento` | 1 |
| `/api/v1/financial-pagaveis` | 1 |
| `/api/v1/fiscal-eventos` | 1 |
| `/api/v1/fiscal-events` | 1 |
| `/api/v1/fiscal-fornecedores` | 1 |
| `/api/v1/fiscal-jobs` | 1 |
| `/api/v1/fiscal-manifestacoes` | 1 |
| `/api/v1/fiscal-produtos` | 1 |
| `/api/v1/fiscal-relatorios` | 1 |
| `/api/v1/fiscal-sincronizacoes` | 1 |
| `/api/v1/fiscal` | 1 |
| `/api/v1/health` | 1 |
| `/api/v1/home` | 1 |
| `/api/v1/indicadores` | 1 |
| `/api/v1/integrations` | 1 |
| `/api/v1/laya` | 1 |
| `/api/v1/lead-captures` | 1 |
| `/api/v1/marca` | 1 |
| `/api/v1/mcp` | 1 |
| `/api/v1/notifications` | 1 |
| `/api/v1/public` | 1 |
| `/api/v1/radar-compras` | 1 |
| `/api/v1/roadmap` | 1 |
| `/api/v1/rotas` | 1 |
| `/api/v1/sales-brain` | 1 |
| `/api/v1/sped` | 1 |
| `/api/v1/suppliers` | 1 |
| `/auth/confirm` | 1 |
| `/icone-512` | 1 |

## Componentes por diretório

| Diretório em `components/` | Arquivos `.ts`/`.tsx` |
|---|---|
| `inbox` | 40 |
| `admin` | 31 |
| `nexus-ui` | 31 |
| `assistente` | 22 |
| `kanban` | 20 |
| `ui` | 19 |
| `ai` | 16 |
| `shell` | 15 |
| `contacts` | 11 |
| `agenda` | 10 |
| `auth` | 10 |
| `connections` | 9 |
| `feedback` | 5 |
| `app` | 4 |
| `empty` | 3 |
| `branding` | 2 |
| `filters` | 2 |
| `observabilidade` | 2 |
| `prospeccao` | 2 |
| `fiscal` | 1 |
| `fotos` | 1 |
| `operacao` | 1 |

## Telas (147)

| Rota | Flags | Linhas | Arquivo |
|---|---|---|---|
| `/403` | — | 10 | `app/403/page.tsx` |
| `/500` | — | 21 | `app/500/page.tsx` |
| `/503` | — | 14 | `app/503/page.tsx` |
| `/account-suspended` | — | 26 | `app/account-suspended/page.tsx` |
| `/admin/audit` | — | 10 | `app/admin/(protected)/audit/page.tsx` |
| `/admin/audit/:entryId` | — | 15 | `app/admin/(protected)/audit/[entryId]/page.tsx` |
| `/admin/dashboard` | — | 8 | `app/admin/(protected)/dashboard/page.tsx` |
| `/admin/forbidden` | platform-admin | 12 | `app/admin/forbidden/page.tsx` |
| `/admin/google` | redirect, notFound, platform-admin, service-role, force-dynamic | 89 | `app/admin/(protected)/google/page.tsx` |
| `/admin/inbox` | platform-admin | 37 | `app/admin/(protected)/inbox/page.tsx` |
| `/admin/inbox/:conversationId` | — | 11 | `app/admin/(protected)/inbox/[conversationId]/page.tsx` |
| `/admin/incidents` | — | 8 | `app/admin/(protected)/incidents/page.tsx` |
| `/admin/incidents/:id` | — | 13 | `app/admin/(protected)/incidents/[id]/page.tsx` |
| `/admin/lgpd` | — | 10 | `app/admin/(protected)/lgpd/page.tsx` |
| `/admin/lgpd/requests/:id` | — | 15 | `app/admin/(protected)/lgpd/requests/[id]/page.tsx` |
| `/admin/marca` | redirect, notFound, platform-admin, force-dynamic | 115 | `app/admin/(protected)/marca/page.tsx` |
| `/admin/observabilidade` | — | 8 | `app/admin/(protected)/observabilidade/page.tsx` |
| `/admin/platform-admins` | — | 8 | `app/admin/(protected)/platform-admins/page.tsx` |
| `/admin/tenants` | — | 8 | `app/admin/(protected)/tenants/page.tsx` |
| `/admin/tenants/:id` | — | 11 | `app/admin/(protected)/tenants/[id]/page.tsx` |
| `/admin/tenants/:id/health` | — | 11 | `app/admin/(protected)/tenants/[id]/health/page.tsx` |
| `/admin/tenants/new` | — | 8 | `app/admin/(protected)/tenants/new/page.tsx` |
| `/admin/usage` | — | 8 | `app/admin/(protected)/usage/page.tsx` |
| `/admin/users` | — | 8 | `app/admin/(protected)/users/page.tsx` |
| `/admin/users/:id` | — | 13 | `app/admin/(protected)/users/[id]/page.tsx` |
| `/app` | redirect, force-dynamic | 136 | `app/app/page.tsx` |
| `/app/agenda` | redirect, notFound, force-dynamic | 293 | `app/app/agenda/page.tsx` |
| `/app/ai` | force-dynamic | 28 | `app/app/ai/page.tsx` |
| `/app/ai/agents` | redirect, force-dynamic | 66 | `app/app/ai/agents/page.tsx` |
| `/app/ai/agents/:id` | redirect, notFound, force-dynamic | 187 | `app/app/ai/agents/[id]/page.tsx` |
| `/app/ai/agents/new` | redirect, force-dynamic | 63 | `app/app/ai/agents/new/page.tsx` |
| `/app/ai/cases` | redirect, requireRole, force-dynamic | 32 | `app/app/ai/cases/page.tsx` |
| `/app/ai/controle` | redirect, force-dynamic | 35 | `app/app/ai/controle/page.tsx` |
| `/app/ai/credentials` | redirect, force-dynamic | 66 | `app/app/ai/credentials/page.tsx` |
| `/app/ai/decisoes` | redirect, force-dynamic | 39 | `app/app/ai/decisoes/page.tsx` |
| `/app/ai/evolution` | redirect, force-dynamic | 47 | `app/app/ai/evolution/page.tsx` |
| `/app/ai/followups` | redirect, force-dynamic | 64 | `app/app/ai/followups/page.tsx` |
| `/app/ai/followups/:id` | redirect, notFound, force-dynamic | 68 | `app/app/ai/followups/[id]/page.tsx` |
| `/app/ai/followups/enrollments/:id` | redirect, force-dynamic | 31 | `app/app/ai/followups/enrollments/[id]/page.tsx` |
| `/app/ai/inbox` | redirect, force-dynamic | 31 | `app/app/ai/inbox/page.tsx` |
| `/app/ai/knowledge/sources` | redirect, force-dynamic | 118 | `app/app/ai/knowledge/sources/page.tsx` |
| `/app/ai/memory` | redirect, force-dynamic | 81 | `app/app/ai/memory/page.tsx` |
| `/app/ai/proposals` | redirect, force-dynamic | 43 | `app/app/ai/proposals/page.tsx` |
| `/app/ai/providers` | redirect, force-dynamic | 31 | `app/app/ai/providers/page.tsx` |
| `/app/ai/routers` | redirect, force-dynamic | 59 | `app/app/ai/routers/page.tsx` |
| `/app/ai/routers/:id` | redirect, notFound, force-dynamic | 79 | `app/app/ai/routers/[id]/page.tsx` |
| `/app/ai/runs` | redirect, force-dynamic | 27 | `app/app/ai/runs/page.tsx` |
| `/app/ai/skills` | redirect, service-role, force-dynamic | 71 | `app/app/ai/skills/page.tsx` |
| `/app/ai/usage` | redirect, force-dynamic | 72 | `app/app/ai/usage/page.tsx` |
| `/app/audit` | redirect, force-dynamic | 32 | `app/app/audit/page.tsx` |
| `/app/busca` | redirect, force-dynamic | 30 | `app/app/busca/page.tsx` |
| `/app/campanhas` | redirect, force-dynamic | 92 | `app/app/campanhas/page.tsx` |
| `/app/carteira` | redirect, force-dynamic | 143 | `app/app/carteira/page.tsx` |
| `/app/comissoes` | redirect, service-role, force-dynamic | 65 | `app/app/comissoes/page.tsx` |
| `/app/compras` | redirect, force-dynamic | 24 | `app/app/compras/page.tsx` |
| `/app/compras/:id` | redirect, notFound, force-dynamic | 39 | `app/app/compras/[id]/page.tsx` |
| `/app/connections` | redirect, force-dynamic | 39 | `app/app/connections/page.tsx` |
| `/app/contacts` | force-dynamic | 8 | `app/app/contacts/page.tsx` |
| `/app/contacts/:id` | redirect, notFound, force-dynamic | 31 | `app/app/contacts/[id]/page.tsx` |
| `/app/estoque` | redirect, force-dynamic | 27 | `app/app/estoque/page.tsx` |
| `/app/expedicao` | redirect, force-dynamic | 213 | `app/app/expedicao/page.tsx` |
| `/app/expedicao/:id` | redirect, force-dynamic | 31 | `app/app/expedicao/[id]/page.tsx` |
| `/app/expedicao/:id/fechamento` | force-dynamic | 12 | `app/app/expedicao/[id]/fechamento/page.tsx` |
| `/app/expedicao/:id/motorista` | force-dynamic | 12 | `app/app/expedicao/[id]/motorista/page.tsx` |
| `/app/expedicao/:id/rota` | force-dynamic | 12 | `app/app/expedicao/[id]/rota/page.tsx` |
| `/app/expedicao/nova` | redirect, force-dynamic | 133 | `app/app/expedicao/nova/page.tsx` |
| `/app/faturamento` | redirect, service-role, force-dynamic | 50 | `app/app/faturamento/page.tsx` |
| `/app/fiscal` | force-dynamic | 321 | `app/app/fiscal/page.tsx` |
| `/app/fiscal/configuracoes` | redirect, force-dynamic | 148 | `app/app/fiscal/configuracoes/page.tsx` |
| `/app/fiscal/eventos` | force-dynamic | 156 | `app/app/fiscal/eventos/page.tsx` |
| `/app/fiscal/fornecedores` | force-dynamic | 113 | `app/app/fiscal/fornecedores/page.tsx` |
| `/app/fiscal/manifestacoes` | force-dynamic | 131 | `app/app/fiscal/manifestacoes/page.tsx` |
| `/app/fiscal/notas` | force-dynamic | 39 | `app/app/fiscal/notas/page.tsx` |
| `/app/fiscal/notas/:id` | notFound, force-dynamic | 516 | `app/app/fiscal/notas/[id]/page.tsx` |
| `/app/fiscal/pendentes` | force-dynamic | 51 | `app/app/fiscal/pendentes/page.tsx` |
| `/app/fiscal/produtos` | force-dynamic | 155 | `app/app/fiscal/produtos/page.tsx` |
| `/app/fiscal/relatorios` | force-dynamic | 411 | `app/app/fiscal/relatorios/page.tsx` |
| `/app/fiscal/resumos` | force-dynamic | 39 | `app/app/fiscal/resumos/page.tsx` |
| `/app/fiscal/sincronizacoes` | force-dynamic | 138 | `app/app/fiscal/sincronizacoes/page.tsx` |
| `/app/fiscal/xml` | force-dynamic | 38 | `app/app/fiscal/xml/page.tsx` |
| `/app/frota` | force-dynamic | 64 | `app/app/frota/page.tsx` |
| `/app/inbox` | redirect, force-dynamic | 27 | `app/app/inbox/page.tsx` |
| `/app/indicadores` | redirect, service-role, force-dynamic | 213 | `app/app/indicadores/page.tsx` |
| `/app/integrations/nuvemshop` | redirect, service-role, suspense | 176 | `app/app/integrations/nuvemshop/page.tsx` |
| `/app/inteligencia` | redirect, force-dynamic | 25 | `app/app/inteligencia/page.tsx` |
| `/app/kanban` | redirect, requireRole, force-dynamic | 67 | `app/app/kanban/page.tsx` |
| `/app/laboratorio` | redirect, force-dynamic | 31 | `app/app/laboratorio/page.tsx` |
| `/app/lgpd/requests` | redirect, force-dynamic | 36 | `app/app/lgpd/requests/page.tsx` |
| `/app/lgpd/requests/:id` | redirect, force-dynamic | 31 | `app/app/lgpd/requests/[id]/page.tsx` |
| `/app/meu-dia` | redirect, force-dynamic | 27 | `app/app/meu-dia/page.tsx` |
| `/app/notas` | redirect, force-dynamic | 680 | `app/app/notas/page.tsx` |
| `/app/pedidos` | redirect, service-role, force-dynamic | 316 | `app/app/pedidos/page.tsx` |
| `/app/pedidos/:id` | redirect, service-role, force-dynamic | 159 | `app/app/pedidos/[id]/page.tsx` |
| `/app/pedidos/imprimir` | redirect, force-dynamic | 257 | `app/app/pedidos/imprimir/page.tsx` |
| `/app/pedidos/novo` | redirect, force-dynamic | 222 | `app/app/pedidos/novo/page.tsx` |
| `/app/pipelines/:id` | redirect, notFound, force-dynamic | 31 | `app/app/pipelines/[id]/page.tsx` |
| `/app/products` | redirect, force-dynamic | 222 | `app/app/products/page.tsx` |
| `/app/prospeccao/campanhas/:id` | redirect, force-dynamic | 28 | `app/app/prospeccao/campanhas/[id]/page.tsx` |
| `/app/prospeccao/nova` | redirect, force-dynamic | 38 | `app/app/prospeccao/nova/page.tsx` |
| `/app/radar` | force-dynamic | 9 | `app/app/radar/page.tsx` |
| `/app/radar/categorias` | force-dynamic | 9 | `app/app/radar/categorias/page.tsx` |
| `/app/radar/oportunidades` | force-dynamic | 9 | `app/app/radar/oportunidades/page.tsx` |
| `/app/radar/prospeccao` | force-dynamic | 9 | `app/app/radar/prospeccao/page.tsx` |
| `/app/radar/recuperacao` | force-dynamic | 9 | `app/app/radar/recuperacao/page.tsx` |
| `/app/radar/risco` | force-dynamic | 9 | `app/app/radar/risco/page.tsx` |
| `/app/relatorios` | redirect, service-role, force-dynamic | 136 | `app/app/relatorios/page.tsx` |
| `/app/sentinel` | redirect, force-dynamic | 77 | `app/app/sentinel/page.tsx` |
| `/app/settings` | force-dynamic | 40 | `app/app/settings/page.tsx` |
| `/app/settings/api-tokens` | redirect, force-dynamic | 34 | `app/app/settings/api-tokens/page.tsx` |
| `/app/settings/atendimento` | redirect, force-dynamic | 70 | `app/app/settings/atendimento/page.tsx` |
| `/app/settings/atualizacao` | notFound, force-dynamic | 19 | `app/app/settings/atualizacao/page.tsx` |
| `/app/settings/billing` | redirect, force-dynamic | 52 | `app/app/settings/billing/page.tsx` |
| `/app/settings/devices` | redirect, force-dynamic | 49 | `app/app/settings/devices/page.tsx` |
| `/app/settings/marca` | redirect, notFound, force-dynamic | 111 | `app/app/settings/marca/page.tsx` |
| `/app/settings/notifications` | force-dynamic | 96 | `app/app/settings/notifications/page.tsx` |
| `/app/settings/profile` | force-dynamic | 51 | `app/app/settings/profile/page.tsx` |
| `/app/settings/security` | service-role, force-dynamic | 73 | `app/app/settings/security/page.tsx` |
| `/app/settings/tenant` | redirect, force-dynamic | 97 | `app/app/settings/tenant/page.tsx` |
| `/app/settings/tenant/agenda` | redirect, force-dynamic | 98 | `app/app/settings/tenant/agenda/page.tsx` |
| `/app/settings/tenant/formas-pagamento` | redirect, force-dynamic | 47 | `app/app/settings/tenant/formas-pagamento/page.tsx` |
| `/app/settings/tenant/pipelines` | redirect, force-dynamic | 58 | `app/app/settings/tenant/pipelines/page.tsx` |
| `/app/tarefas` | redirect, force-dynamic | 21 | `app/app/tarefas/page.tsx` |
| `/app/team` | force-dynamic | 102 | `app/app/team/page.tsx` |
| `/app/team/invite` | redirect, force-dynamic | 31 | `app/app/team/invite/page.tsx` |
| `/app/templates` | redirect, force-dynamic | 36 | `app/app/templates/page.tsx` |
| `/app/venda-automatica` | redirect, force-dynamic | 106 | `app/app/venda-automatica/page.tsx` |
| `/app/webhooks` | redirect, force-dynamic | 30 | `app/app/webhooks/page.tsx` |
| `/design` | client | 123 | `app/design/page.tsx` |
| `/legal/privacy` | redirect, force-dynamic | 156 | `app/legal/privacy/page.tsx` |
| `/legal/terms` | force-dynamic | 157 | `app/legal/terms/page.tsx` |
| `/login` | — | 112 | `app/(public)/login/page.tsx` |
| `/login/forgot` | — | 41 | `app/(public)/login/forgot/page.tsx` |
| `/login/mfa` | redirect | 47 | `app/(public)/login/mfa/page.tsx` |
| `/login/recovery` | — | 45 | `app/(public)/login/recovery/page.tsx` |
| `/login/reset` | — | 30 | `app/(public)/login/reset/page.tsx` |
| `/o/:token` | service-role, force-dynamic | 151 | `app/o/[token]/page.tsx` |
| `/onboarding/connect-nuvemshop` | force-dynamic | 23 | `app/onboarding/connect-nuvemshop/page.tsx` |
| `/onboarding/connect-whatsapp` | redirect, force-dynamic | 43 | `app/onboarding/connect-whatsapp/page.tsx` |
| `/onboarding/done` | redirect, force-dynamic | 26 | `app/onboarding/done/page.tsx` |
| `/onboarding/funil` | redirect, force-dynamic | 47 | `app/onboarding/funil/page.tsx` |
| `/onboarding/invite-team` | force-dynamic | 45 | `app/onboarding/invite-team/page.tsx` |
| `/onboarding/setup-ai` | redirect, force-dynamic | 72 | `app/onboarding/setup-ai/page.tsx` |
| `/onboarding/testar` | redirect, service-role, force-dynamic | 55 | `app/onboarding/testar/page.tsx` |
| `/onboarding/welcome` | redirect, force-dynamic | 44 | `app/onboarding/welcome/page.tsx` |
| `/signup` | — | 73 | `app/(public)/signup/page.tsx` |
| `/team/accept-invite/:token` | force-dynamic | 160 | `app/team/accept-invite/[token]/page.tsx` |
| `/vitrine-agenda` | — | 30 | `app/vitrine-agenda/page.tsx` |

## Resolvers e redirects (13)

| Rota | Flags | Linhas | Arquivo |
|---|---|---|---|
| `/` | redirect | 8 | `app/page.tsx` |
| `/admin` | redirect | 6 | `app/admin/(protected)/page.tsx` |
| `/app/financeiro` | redirect, force-dynamic | 43 | `app/app/financeiro/page.tsx` |
| `/app/inbox/:id` | redirect, force-dynamic | 13 | `app/app/inbox/[id]/page.tsx` |
| `/app/leads/:id` | redirect, notFound, force-dynamic | 51 | `app/app/leads/[id]/page.tsx` |
| `/app/metrics` | redirect | 16 | `app/app/metrics/page.tsx` |
| `/app/prospeccao` | redirect, force-dynamic | 31 | `app/app/prospeccao/page.tsx` |
| `/app/recuperacao` | redirect | 15 | `app/app/recuperacao/page.tsx` |
| `/app/settings/canal-oficial` | redirect | 13 | `app/app/settings/canal-oficial/page.tsx` |
| `/app/settings/templates` | redirect | 13 | `app/app/settings/templates/page.tsx` |
| `/app/settings/tenant/whatsapp` | redirect | 8 | `app/app/settings/tenant/whatsapp/page.tsx` |
| `/app/titulos` | redirect | 14 | `app/app/titulos/page.tsx` |
| `/onboarding` | redirect, force-dynamic | 26 | `app/onboarding/page.tsx` |

## APIs (449)

| Rota | Métodos | Flags | Linhas | Arquivo |
|---|---|---|---|---|
| `/api/auth/signout` | POST | redirect | 48 | `app/api/auth/signout/route.ts` |
| `/api/internal/agents/run` | POST | force-dynamic | 115 | `app/api/internal/agents/run/route.ts` |
| `/api/internal/observabilidade/sonda` | POST | force-dynamic | 65 | `app/api/internal/observabilidade/sonda/route.ts` |
| `/api/mcp` | GET/POST/DELETE | force-dynamic | 75 | `app/api/mcp/route.ts` |
| `/api/v1/admin/audit` | GET | platform-admin, service-role | 177 | `app/api/v1/admin/audit/route.ts` |
| `/api/v1/admin/audit/:entryId` | GET | platform-admin, service-role | 132 | `app/api/v1/admin/audit/[entryId]/route.ts` |
| `/api/v1/admin/dashboard/kpis` | GET | platform-admin, service-role | 326 | `app/api/v1/admin/dashboard/kpis/route.ts` |
| `/api/v1/admin/impersonate/end` | POST | platform-admin | 63 | `app/api/v1/admin/impersonate/end/route.ts` |
| `/api/v1/admin/inbox/conversations` | GET | platform-admin, service-role | 157 | `app/api/v1/admin/inbox/conversations/route.ts` |
| `/api/v1/admin/inbox/conversations/:id` | GET | platform-admin, service-role | 128 | `app/api/v1/admin/inbox/conversations/[id]/route.ts` |
| `/api/v1/admin/incidents` | GET | platform-admin, service-role | 151 | `app/api/v1/admin/incidents/route.ts` |
| `/api/v1/admin/incidents/:id` | GET | platform-admin, service-role | 81 | `app/api/v1/admin/incidents/[id]/route.ts` |
| `/api/v1/admin/incidents/:id/resolve` | POST | platform-admin, service-role | 127 | `app/api/v1/admin/incidents/[id]/resolve/route.ts` |
| `/api/v1/admin/lgpd/requests` | GET | platform-admin, service-role, force-dynamic | 209 | `app/api/v1/admin/lgpd/requests/route.ts` |
| `/api/v1/admin/lgpd/requests/:id` | GET | platform-admin, service-role, force-dynamic | 91 | `app/api/v1/admin/lgpd/requests/[id]/route.ts` |
| `/api/v1/admin/observabilidade` | GET | platform-admin, service-role, force-dynamic | 310 | `app/api/v1/admin/observabilidade/route.ts` |
| `/api/v1/admin/platform-admins` | GET/POST/PATCH/DELETE | platform-admin, service-role | 212 | `app/api/v1/admin/platform-admins/route.ts` |
| `/api/v1/admin/tenants` | GET/POST | platform-admin, service-role | 257 | `app/api/v1/admin/tenants/route.ts` |
| `/api/v1/admin/tenants/:id` | GET | platform-admin, service-role | 161 | `app/api/v1/admin/tenants/[id]/route.ts` |
| `/api/v1/admin/tenants/:id/health` | GET | platform-admin, service-role | 331 | `app/api/v1/admin/tenants/[id]/health/route.ts` |
| `/api/v1/admin/tenants/:id/impersonate` | POST | platform-admin, service-role | 169 | `app/api/v1/admin/tenants/[id]/impersonate/route.ts` |
| `/api/v1/admin/tenants/:id/reactivate` | POST | platform-admin, service-role | 131 | `app/api/v1/admin/tenants/[id]/reactivate/route.ts` |
| `/api/v1/admin/tenants/:id/suspend` | POST | platform-admin, service-role | 126 | `app/api/v1/admin/tenants/[id]/suspend/route.ts` |
| `/api/v1/admin/usage` | GET | platform-admin, service-role | 276 | `app/api/v1/admin/usage/route.ts` |
| `/api/v1/admin/users` | GET | platform-admin, service-role | 351 | `app/api/v1/admin/users/route.ts` |
| `/api/v1/admin/users/:id` | GET | platform-admin, service-role | 135 | `app/api/v1/admin/users/[id]/route.ts` |
| `/api/v1/agenda/agendamentos` | GET/POST/PATCH/DELETE | requireRole | 288 | `app/api/v1/agenda/agendamentos/route.ts` |
| `/api/v1/agenda/google/callback` | GET | service-role, force-dynamic | 440 | `app/api/v1/agenda/google/callback/route.ts` |
| `/api/v1/agenda/google/connect` | GET | redirect, requireRole, force-dynamic | 121 | `app/api/v1/agenda/google/connect/route.ts` |
| `/api/v1/agenda/google/desconectar` | DELETE | requireRole, service-role, force-dynamic | 159 | `app/api/v1/agenda/google/desconectar/route.ts` |
| `/api/v1/agenda/horarios-livres` | GET | requireRole | 165 | `app/api/v1/agenda/horarios-livres/route.ts` |
| `/api/v1/agenda/tipos` | GET/POST/PATCH/DELETE | requireRole, service-role, force-dynamic | 229 | `app/api/v1/agenda/tipos/route.ts` |
| `/api/v1/ai/agents` | GET/POST | requireRole, service-role, force-dynamic | 243 | `app/api/v1/ai/agents/route.ts` |
| `/api/v1/ai/agents/:id` | GET/PATCH/DELETE | requireRole, service-role, force-dynamic | 269 | `app/api/v1/ai/agents/[id]/route.ts` |
| `/api/v1/ai/agents/:id/duplicate` | POST | requireRole, service-role, force-dynamic | 79 | `app/api/v1/ai/agents/[id]/duplicate/route.ts` |
| `/api/v1/ai/agents/:id/pause` | POST | requireRole, service-role, force-dynamic | 75 | `app/api/v1/ai/agents/[id]/pause/route.ts` |
| `/api/v1/ai/agents/:id/proposals` | GET | requireRole, service-role, force-dynamic | 74 | `app/api/v1/ai/agents/[id]/proposals/route.ts` |
| `/api/v1/ai/agents/:id/proposals/:pid/apply` | POST | requireRole, service-role, force-dynamic | 80 | `app/api/v1/ai/agents/[id]/proposals/[pid]/apply/route.ts` |
| `/api/v1/ai/agents/:id/publish` | POST | requireRole, service-role, force-dynamic | 138 | `app/api/v1/ai/agents/[id]/publish/route.ts` |
| `/api/v1/ai/agents/:id/runs` | GET | requireRole, force-dynamic | 214 | `app/api/v1/ai/agents/[id]/runs/route.ts` |
| `/api/v1/ai/agents/:id/tool-usage` | GET | requireRole, service-role, force-dynamic | 145 | `app/api/v1/ai/agents/[id]/tool-usage/route.ts` |
| `/api/v1/ai/agents/:id/versions` | GET/POST | requireRole, service-role, force-dynamic | 194 | `app/api/v1/ai/agents/[id]/versions/route.ts` |
| `/api/v1/ai/agents/:id/versions/:vid` | GET/PATCH | requireRole, service-role, force-dynamic | 144 | `app/api/v1/ai/agents/[id]/versions/[vid]/route.ts` |
| `/api/v1/ai/agents/:id/versions/:vid/test` | POST | requireRole, service-role, force-dynamic | 250 | `app/api/v1/ai/agents/[id]/versions/[vid]/test/route.ts` |
| `/api/v1/ai/agents/assignable` | GET | requireRole, force-dynamic | 104 | `app/api/v1/ai/agents/assignable/route.ts` |
| `/api/v1/ai/automatico-ativo` | GET | requireRole, force-dynamic | 58 | `app/api/v1/ai/automatico-ativo/route.ts` |
| `/api/v1/ai/budget` | GET/PATCH | requireRole, service-role, force-dynamic | 335 | `app/api/v1/ai/budget/route.ts` |
| `/api/v1/ai/cases` | GET | requireRole, service-role, force-dynamic | 50 | `app/api/v1/ai/cases/route.ts` |
| `/api/v1/ai/cases/:id` | GET | requireRole, service-role, force-dynamic | 39 | `app/api/v1/ai/cases/[id]/route.ts` |
| `/api/v1/ai/cases/:id/reply` | POST | requireRole, service-role, force-dynamic | 220 | `app/api/v1/ai/cases/[id]/reply/route.ts` |
| `/api/v1/ai/controle/resumo` | GET | requireRole, force-dynamic | 68 | `app/api/v1/ai/controle/resumo/route.ts` |
| `/api/v1/ai/credentials` | GET/POST | requireRole, service-role, force-dynamic | 118 | `app/api/v1/ai/credentials/route.ts` |
| `/api/v1/ai/credentials/:id` | DELETE | requireRole, service-role, force-dynamic | 100 | `app/api/v1/ai/credentials/[id]/route.ts` |
| `/api/v1/ai/credentials/:id/revalidate` | POST | requireRole, service-role, force-dynamic | 111 | `app/api/v1/ai/credentials/[id]/revalidate/route.ts` |
| `/api/v1/ai/decisions/:id/decide` | POST | requireRole, force-dynamic | 88 | `app/api/v1/ai/decisions/[id]/decide/route.ts` |
| `/api/v1/ai/decisions/:id/executar` | POST | requireRole, service-role, force-dynamic | 134 | `app/api/v1/ai/decisions/[id]/executar/route.ts` |
| `/api/v1/ai/decisions/propose` | POST | requireRole, service-role, force-dynamic | 130 | `app/api/v1/ai/decisions/propose/route.ts` |
| `/api/v1/ai/evolution` | GET | requireRole, force-dynamic | 243 | `app/api/v1/ai/evolution/route.ts` |
| `/api/v1/ai/followup-flows` | GET/POST | requireRole, force-dynamic | 84 | `app/api/v1/ai/followup-flows/route.ts` |
| `/api/v1/ai/followup-flows/:id` | GET/PATCH/DELETE | requireRole, force-dynamic | 227 | `app/api/v1/ai/followup-flows/[id]/route.ts` |
| `/api/v1/ai/followup-flows/:id/disable` | POST | requireRole, force-dynamic | 68 | `app/api/v1/ai/followup-flows/[id]/disable/route.ts` |
| `/api/v1/ai/followup-flows/:id/publish` | POST | requireRole, service-role, force-dynamic | 179 | `app/api/v1/ai/followup-flows/[id]/publish/route.ts` |
| `/api/v1/ai/followup-flows/:id/rollback` | POST | requireRole, force-dynamic | 103 | `app/api/v1/ai/followup-flows/[id]/rollback/route.ts` |
| `/api/v1/ai/followups/enrollments` | GET/POST | requireRole, force-dynamic | 123 | `app/api/v1/ai/followups/enrollments/route.ts` |
| `/api/v1/ai/followups/enrollments/:id` | GET | requireRole, service-role, force-dynamic | 249 | `app/api/v1/ai/followups/enrollments/[id]/route.ts` |
| `/api/v1/ai/followups/enrollments/:id/cancel` | POST | requireRole, force-dynamic | 98 | `app/api/v1/ai/followups/enrollments/[id]/cancel/route.ts` |
| `/api/v1/ai/followups/enrollments/:id/pause` | POST | requireRole, service-role, force-dynamic | 54 | `app/api/v1/ai/followups/enrollments/[id]/pause/route.ts` |
| `/api/v1/ai/followups/enrollments/:id/resume` | POST | requireRole, service-role, force-dynamic | 55 | `app/api/v1/ai/followups/enrollments/[id]/resume/route.ts` |
| `/api/v1/ai/followups/enrollments/:id/skip` | POST | requireRole, service-role, force-dynamic | 76 | `app/api/v1/ai/followups/enrollments/[id]/skip/route.ts` |
| `/api/v1/ai/followups/enrollments/:id/snooze` | POST | requireRole, service-role, force-dynamic | 72 | `app/api/v1/ai/followups/enrollments/[id]/snooze/route.ts` |
| `/api/v1/ai/followups/promises/:id/cancel` | POST | requireRole, service-role, force-dynamic | 93 | `app/api/v1/ai/followups/promises/[id]/cancel/route.ts` |
| `/api/v1/ai/followups/queue` | GET | requireRole, force-dynamic | 280 | `app/api/v1/ai/followups/queue/route.ts` |
| `/api/v1/ai/guardrail-layers` | GET/PUT | requireRole, force-dynamic | 137 | `app/api/v1/ai/guardrail-layers/route.ts` |
| `/api/v1/ai/inbox` | GET | requireRole, service-role, force-dynamic | 62 | `app/api/v1/ai/inbox/route.ts` |
| `/api/v1/ai/inbox/:id` | PATCH | requireRole, service-role, force-dynamic | 73 | `app/api/v1/ai/inbox/[id]/route.ts` |
| `/api/v1/ai/knowledge/chave` | GET | requireRole, force-dynamic | 61 | `app/api/v1/ai/knowledge/chave/route.ts` |
| `/api/v1/ai/knowledge/sources` | GET/POST | requireRole, service-role, force-dynamic | 318 | `app/api/v1/ai/knowledge/sources/route.ts` |
| `/api/v1/ai/knowledge/sources/:id` | GET/PATCH/DELETE | requireRole, service-role, force-dynamic | 295 | `app/api/v1/ai/knowledge/sources/[id]/route.ts` |
| `/api/v1/ai/knowledge/sources/:id/reindex` | POST | requireRole, service-role, force-dynamic | 114 | `app/api/v1/ai/knowledge/sources/[id]/reindex/route.ts` |
| `/api/v1/ai/knowledge/sources/:id/trechos` | GET | requireRole, force-dynamic | 87 | `app/api/v1/ai/knowledge/sources/[id]/trechos/route.ts` |
| `/api/v1/ai/knowledge/sources/upload` | POST | requireRole, service-role, force-dynamic | 216 | `app/api/v1/ai/knowledge/sources/upload/route.ts` |
| `/api/v1/ai/memory` | GET/POST | requireRole, service-role, force-dynamic | 126 | `app/api/v1/ai/memory/route.ts` |
| `/api/v1/ai/memory/entries` | POST | requireRole, service-role, force-dynamic | 65 | `app/api/v1/ai/memory/entries/route.ts` |
| `/api/v1/ai/memory/entries/:id` | PATCH | requireRole, service-role, force-dynamic | 68 | `app/api/v1/ai/memory/entries/[id]/route.ts` |
| `/api/v1/ai/memory/versions/:id` | GET | requireRole, service-role, force-dynamic | 45 | `app/api/v1/ai/memory/versions/[id]/route.ts` |
| `/api/v1/ai/operator-metrics` | GET | requireRole, force-dynamic | 90 | `app/api/v1/ai/operator-metrics/route.ts` |
| `/api/v1/ai/pacing` | GET/PUT | requireRole, service-role, force-dynamic | 208 | `app/api/v1/ai/pacing/route.ts` |
| `/api/v1/ai/policies` | GET/PATCH | requireRole, force-dynamic | 105 | `app/api/v1/ai/policies/route.ts` |
| `/api/v1/ai/providers` | GET/PUT | requireRole, force-dynamic | 332 | `app/api/v1/ai/providers/route.ts` |
| `/api/v1/ai/providers/:provider/models` | GET | force-dynamic | 58 | `app/api/v1/ai/providers/[provider]/models/route.ts` |
| `/api/v1/ai/routers` | GET/POST | requireRole, service-role, force-dynamic | 158 | `app/api/v1/ai/routers/route.ts` |
| `/api/v1/ai/routers/:id` | GET/PATCH/DELETE | requireRole, service-role, force-dynamic | 211 | `app/api/v1/ai/routers/[id]/route.ts` |
| `/api/v1/ai/routers/:id/members` | PUT | requireRole, service-role, force-dynamic | 119 | `app/api/v1/ai/routers/[id]/members/route.ts` |
| `/api/v1/ai/routers/:id/test` | POST | requireRole, service-role, force-dynamic | 132 | `app/api/v1/ai/routers/[id]/test/route.ts` |
| `/api/v1/ai/runs` | GET | requireRole, force-dynamic | 141 | `app/api/v1/ai/runs/route.ts` |
| `/api/v1/ai/runs/:id` | GET | requireRole, force-dynamic | 107 | `app/api/v1/ai/runs/[id]/route.ts` |
| `/api/v1/ai/skills` | GET | requireRole, service-role, force-dynamic | 97 | `app/api/v1/ai/skills/route.ts` |
| `/api/v1/ai/skills/:name` | DELETE | requireRole, service-role, force-dynamic | 73 | `app/api/v1/ai/skills/[name]/route.ts` |
| `/api/v1/ai/skills/:name/install` | POST | requireRole, service-role, force-dynamic | 79 | `app/api/v1/ai/skills/[name]/install/route.ts` |
| `/api/v1/ai/skills/import` | POST | requireRole, service-role, force-dynamic | 85 | `app/api/v1/ai/skills/import/route.ts` |
| `/api/v1/ai/usage` | GET | requireRole, force-dynamic | 180 | `app/api/v1/ai/usage/route.ts` |
| `/api/v1/alertas` | GET | requireRole, force-dynamic | 123 | `app/api/v1/alertas/route.ts` |
| `/api/v1/alertas/:id` | PATCH | requireRole, force-dynamic | 116 | `app/api/v1/alertas/[id]/route.ts` |
| `/api/v1/assistente/chat` | POST | requireRole, service-role, force-dynamic | 181 | `app/api/v1/assistente/chat/route.ts` |
| `/api/v1/assistente/executar` | POST | requireRole, service-role, force-dynamic | 76 | `app/api/v1/assistente/executar/route.ts` |
| `/api/v1/atividades` | GET/POST | requireRole, force-dynamic | 95 | `app/api/v1/atividades/route.ts` |
| `/api/v1/attendants/availability` | GET | requireRole, service-role, force-dynamic | 108 | `app/api/v1/attendants/availability/route.ts` |
| `/api/v1/attendants/availability/:user_id` | PATCH | requireRole, force-dynamic | 120 | `app/api/v1/attendants/availability/[user_id]/route.ts` |
| `/api/v1/audit` | GET | requireRole, force-dynamic | 79 | `app/api/v1/audit/route.ts` |
| `/api/v1/audit/export` | GET | requireRole, force-dynamic | 104 | `app/api/v1/audit/export/route.ts` |
| `/api/v1/auth/realtime-token` | GET | force-dynamic | 62 | `app/api/v1/auth/realtime-token/route.ts` |
| `/api/v1/automatic-sales/campaigns` | GET/POST | requireRole, force-dynamic | 145 | `app/api/v1/automatic-sales/campaigns/route.ts` |
| `/api/v1/automatic-sales/campaigns/:id` | GET/PATCH/DELETE | requireRole, force-dynamic | 109 | `app/api/v1/automatic-sales/campaigns/[id]/route.ts` |
| `/api/v1/automatic-sales/campaigns/:id/painel` | GET | requireRole, force-dynamic | 71 | `app/api/v1/automatic-sales/campaigns/[id]/painel/route.ts` |
| `/api/v1/automatic-sales/campaigns/:id/queue` | GET | requireRole, force-dynamic | 54 | `app/api/v1/automatic-sales/campaigns/[id]/queue/route.ts` |
| `/api/v1/automatic-sales/queue/:id` | POST | requireRole, force-dynamic | 163 | `app/api/v1/automatic-sales/queue/[id]/route.ts` |
| `/api/v1/automation-rules` | GET/POST | requireRole, service-role, force-dynamic | 95 | `app/api/v1/automation-rules/route.ts` |
| `/api/v1/automation-rules/:id` | PATCH/DELETE | requireRole, service-role, force-dynamic | 131 | `app/api/v1/automation-rules/[id]/route.ts` |
| `/api/v1/automation-rules/:id/runs` | GET | requireRole, force-dynamic | 42 | `app/api/v1/automation-rules/[id]/runs/route.ts` |
| `/api/v1/automation-rules/runs` | GET | requireRole, force-dynamic | 37 | `app/api/v1/automation-rules/runs/route.ts` |
| `/api/v1/automation-rules/runs/:runId/resend` | POST | requireRole, service-role, force-dynamic | 154 | `app/api/v1/automation-rules/runs/[runId]/resend/route.ts` |
| `/api/v1/categories` | GET/POST | requireRole, force-dynamic | 89 | `app/api/v1/categories/route.ts` |
| `/api/v1/categories/:id` | GET/PATCH/DELETE | requireRole, force-dynamic | 143 | `app/api/v1/categories/[id]/route.ts` |
| `/api/v1/channel-sessions` | GET/POST | requireRole, force-dynamic | 195 | `app/api/v1/channel-sessions/route.ts` |
| `/api/v1/channel-sessions/:id` | GET/PATCH/DELETE | requireRole, service-role, force-dynamic | 524 | `app/api/v1/channel-sessions/[id]/route.ts` |
| `/api/v1/channel-sessions/:id/qr` | GET | force-dynamic | 105 | `app/api/v1/channel-sessions/[id]/qr/route.ts` |
| `/api/v1/channel-sessions/:id/reconnect` | POST | requireRole, force-dynamic | 158 | `app/api/v1/channel-sessions/[id]/reconnect/route.ts` |
| `/api/v1/channels/official` | GET/POST | requireRole, service-role, force-dynamic | 217 | `app/api/v1/channels/official/route.ts` |
| `/api/v1/channels/partner` | GET/POST | requireRole, service-role, force-dynamic | 164 | `app/api/v1/channels/partner/route.ts` |
| `/api/v1/channels/partner/templates` | GET/POST | service-role, force-dynamic | 255 | `app/api/v1/channels/partner/templates/route.ts` |
| `/api/v1/channels/partner/templates/media` | POST | service-role, force-dynamic | 100 | `app/api/v1/channels/partner/templates/media/route.ts` |
| `/api/v1/channels/templates` | GET/POST | requireRole, service-role, force-dynamic | 200 | `app/api/v1/channels/templates/route.ts` |
| `/api/v1/comercial/inativos` | GET | requireRole, force-dynamic | 48 | `app/api/v1/comercial/inativos/route.ts` |
| `/api/v1/commercial-goals` | GET/PUT | requireRole, force-dynamic | 101 | `app/api/v1/commercial-goals/route.ts` |
| `/api/v1/commercial-orders` | POST | requireRole, service-role, force-dynamic | 231 | `app/api/v1/commercial-orders/route.ts` |
| `/api/v1/commercial-orders/:id` | GET/PATCH/DELETE | requireRole, service-role, force-dynamic | 477 | `app/api/v1/commercial-orders/[id]/route.ts` |
| `/api/v1/commercial-orders/:id/duplicar` | POST | requireRole, service-role, force-dynamic | 195 | `app/api/v1/commercial-orders/[id]/duplicar/route.ts` |
| `/api/v1/commercial-orders/:id/itens` | PATCH | requireRole, service-role, force-dynamic | 190 | `app/api/v1/commercial-orders/[id]/itens/route.ts` |
| `/api/v1/commercial-orders/:id/mercos` | POST | requireRole, service-role, force-dynamic | 103 | `app/api/v1/commercial-orders/[id]/mercos/route.ts` |
| `/api/v1/commercial-orders/:id/orcamento` | POST | requireRole, service-role | 154 | `app/api/v1/commercial-orders/[id]/orcamento/route.ts` |
| `/api/v1/commercial-orders/:id/pdf` | GET | requireRole, force-dynamic | 62 | `app/api/v1/commercial-orders/[id]/pdf/route.ts` |
| `/api/v1/commercial-orders/:id/timeline` | GET | requireRole, service-role, force-dynamic | 77 | `app/api/v1/commercial-orders/[id]/timeline/route.ts` |
| `/api/v1/commercial-orders/importar-ia` | POST | requireRole, service-role, force-dynamic | 461 | `app/api/v1/commercial-orders/importar-ia/route.ts` |
| `/api/v1/commercial-orders/importar-mercos` | GET/POST | requireRole, service-role, force-dynamic | 82 | `app/api/v1/commercial-orders/importar-mercos/route.ts` |
| `/api/v1/commercial-orders/orcamentos-parados` | GET | requireRole, service-role, force-dynamic | 93 | `app/api/v1/commercial-orders/orcamentos-parados/route.ts` |
| `/api/v1/commercial-orders/pdf` | GET | requireRole, force-dynamic | 69 | `app/api/v1/commercial-orders/pdf/route.ts` |
| `/api/v1/commercial-policies` | GET | requireRole, force-dynamic | 30 | `app/api/v1/commercial-policies/route.ts` |
| `/api/v1/commissions` | GET | requireRole, force-dynamic | 140 | `app/api/v1/commissions/route.ts` |
| `/api/v1/commissions/baixas` | POST/DELETE | requireRole, force-dynamic | 109 | `app/api/v1/commissions/baixas/route.ts` |
| `/api/v1/contacts` | POST | requireRole, force-dynamic | 125 | `app/api/v1/contacts/route.ts` |
| `/api/v1/contacts/:id` | GET/PATCH/DELETE | requireRole, force-dynamic | 144 | `app/api/v1/contacts/[id]/route.ts` |
| `/api/v1/contacts/:id/avatar` | GET | redirect, service-role, force-dynamic | 95 | `app/api/v1/contacts/[id]/avatar/route.ts` |
| `/api/v1/contacts/:id/credito` | GET | requireRole, force-dynamic | 68 | `app/api/v1/contacts/[id]/credito/route.ts` |
| `/api/v1/contacts/:id/crm-summary` | GET | force-dynamic | 175 | `app/api/v1/contacts/[id]/crm-summary/route.ts` |
| `/api/v1/contacts/:id/proposals` | GET | requireRole, force-dynamic | 57 | `app/api/v1/contacts/[id]/proposals/route.ts` |
| `/api/v1/contacts/:id/proposals/:proposal_id` | POST | requireRole, force-dynamic | 193 | `app/api/v1/contacts/[id]/proposals/[proposal_id]/route.ts` |
| `/api/v1/contacts/:id/timeline` | GET | force-dynamic | 162 | `app/api/v1/contacts/[id]/timeline/route.ts` |
| `/api/v1/contacts/bulk-tag` | POST | requireRole, force-dynamic | 98 | `app/api/v1/contacts/bulk-tag/route.ts` |
| `/api/v1/contacts/cidades` | GET | requireRole, force-dynamic | 80 | `app/api/v1/contacts/cidades/route.ts` |
| `/api/v1/contacts/cnpj-lookup` | GET | requireRole, force-dynamic | 62 | `app/api/v1/contacts/cnpj-lookup/route.ts` |
| `/api/v1/contacts/import` | POST | requireRole, force-dynamic | 303 | `app/api/v1/contacts/import/route.ts` |
| `/api/v1/conversation-tags` | GET | requireRole, force-dynamic | 39 | `app/api/v1/conversation-tags/route.ts` |
| `/api/v1/conversations` | — | force-dynamic | 97 | `app/api/v1/conversations/route.ts` |
| `/api/v1/conversations/:id` | GET/PATCH | requireRole, force-dynamic | 108 | `app/api/v1/conversations/[id]/route.ts` |
| `/api/v1/conversations/:id/claim` | POST | requireRole, force-dynamic | 115 | `app/api/v1/conversations/[id]/claim/route.ts` |
| `/api/v1/conversations/:id/close` | POST | requireRole, force-dynamic | 110 | `app/api/v1/conversations/[id]/close/route.ts` |
| `/api/v1/conversations/:id/draft-reply` | POST | requireRole, force-dynamic | 91 | `app/api/v1/conversations/[id]/draft-reply/route.ts` |
| `/api/v1/conversations/:id/mark-read` | POST | requireRole, force-dynamic | 49 | `app/api/v1/conversations/[id]/mark-read/route.ts` |
| `/api/v1/conversations/:id/media` | POST | requireRole, service-role, force-dynamic | 107 | `app/api/v1/conversations/[id]/media/route.ts` |
| `/api/v1/conversations/:id/messages` | GET | force-dynamic | 72 | `app/api/v1/conversations/[id]/messages/route.ts` |
| `/api/v1/conversations/:id/no-send` | POST | requireRole, service-role, force-dynamic | 150 | `app/api/v1/conversations/[id]/no-send/route.ts` |
| `/api/v1/conversations/:id/notes` | GET/POST | requireRole, service-role, force-dynamic | 151 | `app/api/v1/conversations/[id]/notes/route.ts` |
| `/api/v1/conversations/:id/notes/:noteId` | DELETE | requireRole, force-dynamic | 65 | `app/api/v1/conversations/[id]/notes/[noteId]/route.ts` |
| `/api/v1/conversations/:id/pause-ai` | POST | requireRole, force-dynamic | 161 | `app/api/v1/conversations/[id]/pause-ai/route.ts` |
| `/api/v1/conversations/:id/reactivate-bot` | POST | requireRole, force-dynamic | 91 | `app/api/v1/conversations/[id]/reactivate-bot/route.ts` |
| `/api/v1/conversations/:id/release` | POST | requireRole, force-dynamic | 82 | `app/api/v1/conversations/[id]/release/route.ts` |
| `/api/v1/conversations/:id/retention` | GET | force-dynamic | 92 | `app/api/v1/conversations/[id]/retention/route.ts` |
| `/api/v1/conversations/:id/snooze` | POST/DELETE | requireRole, force-dynamic | 101 | `app/api/v1/conversations/[id]/snooze/route.ts` |
| `/api/v1/conversations/:id/transfer` | POST | requireRole, service-role, force-dynamic | 142 | `app/api/v1/conversations/[id]/transfer/route.ts` |
| `/api/v1/conversations/:id/usable-for-rag` | POST | requireRole, force-dynamic | 105 | `app/api/v1/conversations/[id]/usable-for-rag/route.ts` |
| `/api/v1/conversations/arquivar-todas` | POST | requireRole, service-role, force-dynamic | 120 | `app/api/v1/conversations/arquivar-todas/route.ts` |
| `/api/v1/conversations/counts` | GET | force-dynamic | 96 | `app/api/v1/conversations/counts/route.ts` |
| `/api/v1/conversations/open-with-contact` | POST | requireRole, service-role, force-dynamic | 61 | `app/api/v1/conversations/open-with-contact/route.ts` |
| `/api/v1/copilot/context` | GET | requireRole, force-dynamic | 253 | `app/api/v1/copilot/context/route.ts` |
| `/api/v1/cron/agenda-google-push` | GET/POST | service-role, force-dynamic | 260 | `app/api/v1/cron/agenda-google-push/route.ts` |
| `/api/v1/cron/agenda-google-refresh` | GET/POST | service-role, force-dynamic | 229 | `app/api/v1/cron/agenda-google-refresh/route.ts` |
| `/api/v1/cron/agenda-google-sync` | GET/POST | service-role, force-dynamic | 359 | `app/api/v1/cron/agenda-google-sync/route.ts` |
| `/api/v1/cron/agent-dispatcher` | GET/POST | force-dynamic | 53 | `app/api/v1/cron/agent-dispatcher/route.ts` |
| `/api/v1/cron/attendant-heartbeat` | GET | service-role, force-dynamic | 70 | `app/api/v1/cron/attendant-heartbeat/route.ts` |
| `/api/v1/cron/automatic-sales` | GET/POST | service-role, force-dynamic | 58 | `app/api/v1/cron/automatic-sales/route.ts` |
| `/api/v1/cron/channel-health` | — | service-role, force-dynamic | 158 | `app/api/v1/cron/channel-health/route.ts` |
| `/api/v1/cron/contact-avatars` | — | service-role, force-dynamic | 266 | `app/api/v1/cron/contact-avatars/route.ts` |
| `/api/v1/cron/contact-phones` | — | service-role, force-dynamic | 204 | `app/api/v1/cron/contact-phones/route.ts` |
| `/api/v1/cron/contact-proposals-watcher` | GET/POST | service-role, force-dynamic | 106 | `app/api/v1/cron/contact-proposals-watcher/route.ts` |
| `/api/v1/cron/data-retention` | GET/POST | service-role, force-dynamic | 305 | `app/api/v1/cron/data-retention/route.ts` |
| `/api/v1/cron/event-log-drain` | GET/POST | service-role, force-dynamic | 62 | `app/api/v1/cron/event-log-drain/route.ts` |
| `/api/v1/cron/expedition-notices` | GET/POST | service-role, force-dynamic | 62 | `app/api/v1/cron/expedition-notices/route.ts` |
| `/api/v1/cron/fiscal-drain` | GET/POST | service-role, force-dynamic | 68 | `app/api/v1/cron/fiscal-drain/route.ts` |
| `/api/v1/cron/fiscal-entradas-sync` | GET/POST | service-role, force-dynamic | 124 | `app/api/v1/cron/fiscal-entradas-sync/route.ts` |
| `/api/v1/cron/followup-flow-worker` | GET/POST | service-role, force-dynamic | 143 | `app/api/v1/cron/followup-flow-worker/route.ts` |
| `/api/v1/cron/kb-conversations-batch` | GET | service-role, force-dynamic | 138 | `app/api/v1/cron/kb-conversations-batch/route.ts` |
| `/api/v1/cron/lgpd-sla-watcher` | GET | service-role, force-dynamic | 210 | `app/api/v1/cron/lgpd-sla-watcher/route.ts` |
| `/api/v1/cron/mercos-import` | GET/POST | service-role, force-dynamic | 69 | `app/api/v1/cron/mercos-import/route.ts` |
| `/api/v1/cron/meu-dia-alertas` | GET/POST | service-role, force-dynamic | 644 | `app/api/v1/cron/meu-dia-alertas/route.ts` |
| `/api/v1/cron/prospecting-drain` | GET/POST | service-role, force-dynamic | 52 | `app/api/v1/cron/prospecting-drain/route.ts` |
| `/api/v1/cron/prospecting-fit` | GET/POST | service-role, force-dynamic | 82 | `app/api/v1/cron/prospecting-fit/route.ts` |
| `/api/v1/cron/prospecting-send` | GET/POST | service-role, force-dynamic | 66 | `app/api/v1/cron/prospecting-send/route.ts` |
| `/api/v1/cron/recover-stuck-messages` | GET/POST | service-role, force-dynamic | 391 | `app/api/v1/cron/recover-stuck-messages/route.ts` |
| `/api/v1/cron/risk-watcher` | GET/POST | service-role, force-dynamic | 163 | `app/api/v1/cron/risk-watcher/route.ts` |
| `/api/v1/cron/routing-worker` | GET/POST | force-dynamic | 82 | `app/api/v1/cron/routing-worker/route.ts` |
| `/api/v1/cron/sentinel` | — | force-dynamic | 108 | `app/api/v1/cron/sentinel/route.ts` |
| `/api/v1/cron/snooze-watcher` | GET/POST | service-role, force-dynamic | 130 | `app/api/v1/cron/snooze-watcher/route.ts` |
| `/api/v1/cron/storage-redaction` | GET | force-dynamic | 50 | `app/api/v1/cron/storage-redaction/route.ts` |
| `/api/v1/cron/sync-model-catalog` | — | service-role, force-dynamic | 174 | `app/api/v1/cron/sync-model-catalog/route.ts` |
| `/api/v1/cron/webhook-log-retention` | GET | service-role, force-dynamic | 76 | `app/api/v1/cron/webhook-log-retention/route.ts` |
| `/api/v1/demandas/:id` | PATCH | requireRole, service-role, force-dynamic | 115 | `app/api/v1/demandas/[id]/route.ts` |
| `/api/v1/device/catalog` | GET | service-role, force-dynamic | 189 | `app/api/v1/device/catalog/route.ts` |
| `/api/v1/device/me` | GET | service-role, force-dynamic | 61 | `app/api/v1/device/me/route.ts` |
| `/api/v1/device/orders` | POST | service-role, force-dynamic | 132 | `app/api/v1/device/orders/route.ts` |
| `/api/v1/faturamento` | GET | requireRole, force-dynamic | 110 | `app/api/v1/faturamento/route.ts` |
| `/api/v1/financeiro/conciliacao` | GET | requireRole, force-dynamic | 124 | `app/api/v1/financeiro/conciliacao/route.ts` |
| `/api/v1/financeiro/dashboard` | — | requireRole, force-dynamic | 126 | `app/api/v1/financeiro/dashboard/route.ts` |
| `/api/v1/financeiro/fluxo` | GET | requireRole, force-dynamic | 84 | `app/api/v1/financeiro/fluxo/route.ts` |
| `/api/v1/financeiro/gerar` | POST | requireRole, service-role, force-dynamic | 80 | `app/api/v1/financeiro/gerar/route.ts` |
| `/api/v1/financeiro/pagamentos/:id` | DELETE | requireRole, service-role, force-dynamic | 46 | `app/api/v1/financeiro/pagamentos/[id]/route.ts` |
| `/api/v1/financeiro/recebiveis` | GET/POST | requireRole, service-role, force-dynamic | 288 | `app/api/v1/financeiro/recebiveis/route.ts` |
| `/api/v1/financeiro/recebiveis/:id` | GET | requireRole, force-dynamic | 86 | `app/api/v1/financeiro/recebiveis/[id]/route.ts` |
| `/api/v1/financeiro/recebiveis/:id/pagamentos` | POST | requireRole, service-role, force-dynamic | 80 | `app/api/v1/financeiro/recebiveis/[id]/pagamentos/route.ts` |
| `/api/v1/financial-pagaveis` | GET | requireRole, force-dynamic | 38 | `app/api/v1/financial-pagaveis/route.ts` |
| `/api/v1/fiscal-cfop-equivalentes` | GET/POST | requireRole, force-dynamic | 77 | `app/api/v1/fiscal-cfop-equivalentes/route.ts` |
| `/api/v1/fiscal-cfop-equivalentes/:id` | PUT/DELETE | requireRole, force-dynamic | 91 | `app/api/v1/fiscal-cfop-equivalentes/[id]/route.ts` |
| `/api/v1/fiscal-entradas` | GET/POST | requireRole, service-role, force-dynamic | 167 | `app/api/v1/fiscal-entradas/route.ts` |
| `/api/v1/fiscal-entradas/:id` | GET | requireRole, force-dynamic | 94 | `app/api/v1/fiscal-entradas/[id]/route.ts` |
| `/api/v1/fiscal-entradas/:id/conferencia` | POST | requireRole, force-dynamic | 94 | `app/api/v1/fiscal-entradas/[id]/conferencia/route.ts` |
| `/api/v1/fiscal-entradas/:id/ignorar` | POST | requireRole, force-dynamic | 55 | `app/api/v1/fiscal-entradas/[id]/ignorar/route.ts` |
| `/api/v1/fiscal-entradas/:id/importar` | POST | requireRole, force-dynamic | 416 | `app/api/v1/fiscal-entradas/[id]/importar/route.ts` |
| `/api/v1/fiscal-entradas/:id/itens/:itemId` | PATCH | requireRole, force-dynamic | 117 | `app/api/v1/fiscal-entradas/[id]/itens/[itemId]/route.ts` |
| `/api/v1/fiscal-entradas/:id/manifestar` | POST | requireRole, force-dynamic | 267 | `app/api/v1/fiscal-entradas/[id]/manifestar/route.ts` |
| `/api/v1/fiscal-entradas/:id/xml` | GET | requireRole, force-dynamic | 60 | `app/api/v1/fiscal-entradas/[id]/xml/route.ts` |
| `/api/v1/fiscal-eventos` | GET | requireRole, force-dynamic | 58 | `app/api/v1/fiscal-eventos/route.ts` |
| `/api/v1/fiscal-events/:id/retransmitir` | POST | requireRole, service-role, force-dynamic | 124 | `app/api/v1/fiscal-events/[id]/retransmitir/route.ts` |
| `/api/v1/fiscal-fornecedores` | GET | requireRole, force-dynamic | 60 | `app/api/v1/fiscal-fornecedores/route.ts` |
| `/api/v1/fiscal-ibpt/consulta` | GET | requireRole, force-dynamic | 125 | `app/api/v1/fiscal-ibpt/consulta/route.ts` |
| `/api/v1/fiscal-ibpt/importar` | POST | requireRole, service-role, force-dynamic | 125 | `app/api/v1/fiscal-ibpt/importar/route.ts` |
| `/api/v1/fiscal-ibpt/importar-siscomex` | POST | requireRole, service-role, force-dynamic | 134 | `app/api/v1/fiscal-ibpt/importar-siscomex/route.ts` |
| `/api/v1/fiscal-inutilizacoes` | GET/POST | requireRole, service-role, force-dynamic | 191 | `app/api/v1/fiscal-inutilizacoes/route.ts` |
| `/api/v1/fiscal-inutilizacoes/:id/retransmitir` | POST | requireRole, service-role, force-dynamic | 105 | `app/api/v1/fiscal-inutilizacoes/[id]/retransmitir/route.ts` |
| `/api/v1/fiscal-inutilizacoes/lacunas` | POST | requireRole, service-role, force-dynamic | 45 | `app/api/v1/fiscal-inutilizacoes/lacunas/route.ts` |
| `/api/v1/fiscal-inutilizacoes/puladas` | GET | requireRole, service-role, force-dynamic | 149 | `app/api/v1/fiscal-inutilizacoes/puladas/route.ts` |
| `/api/v1/fiscal-jobs` | GET | requireRole, force-dynamic | 66 | `app/api/v1/fiscal-jobs/route.ts` |
| `/api/v1/fiscal-manifestacoes` | GET | requireRole, force-dynamic | 58 | `app/api/v1/fiscal-manifestacoes/route.ts` |
| `/api/v1/fiscal-produtos` | GET | requireRole, force-dynamic | 66 | `app/api/v1/fiscal-produtos/route.ts` |
| `/api/v1/fiscal-relatorios` | GET | requireRole, force-dynamic | 161 | `app/api/v1/fiscal-relatorios/route.ts` |
| `/api/v1/fiscal-settings` | GET/PUT | requireRole, service-role, force-dynamic | 204 | `app/api/v1/fiscal-settings/route.ts` |
| `/api/v1/fiscal-settings/certificado` | POST | requireRole, service-role, force-dynamic | 175 | `app/api/v1/fiscal-settings/certificado/route.ts` |
| `/api/v1/fiscal-sincronizacoes` | GET | requireRole, force-dynamic | 56 | `app/api/v1/fiscal-sincronizacoes/route.ts` |
| `/api/v1/fiscal/cadastro-do-cnpj` | GET | requireRole, force-dynamic | 95 | `app/api/v1/fiscal/cadastro-do-cnpj/route.ts` |
| `/api/v1/fleet` | GET | requireRole, force-dynamic | 45 | `app/api/v1/fleet/route.ts` |
| `/api/v1/fleet/drivers` | GET/POST | requireRole, force-dynamic | 85 | `app/api/v1/fleet/drivers/route.ts` |
| `/api/v1/fleet/drivers/:id` | PATCH/DELETE | requireRole, force-dynamic | 106 | `app/api/v1/fleet/drivers/[id]/route.ts` |
| `/api/v1/fleet/vehicles` | GET/POST | requireRole, force-dynamic | 79 | `app/api/v1/fleet/vehicles/route.ts` |
| `/api/v1/fleet/vehicles/:id` | PATCH/DELETE | requireRole, force-dynamic | 97 | `app/api/v1/fleet/vehicles/[id]/route.ts` |
| `/api/v1/health` | GET | force-dynamic | 315 | `app/api/v1/health/route.ts` |
| `/api/v1/home/mes` | GET | requireRole, force-dynamic | 126 | `app/api/v1/home/mes/route.ts` |
| `/api/v1/indicadores/perguntar` | POST | requireRole, force-dynamic | 133 | `app/api/v1/indicadores/perguntar/route.ts` |
| `/api/v1/integrations/nuvemshop/callback` | GET | redirect, service-role, force-dynamic | 171 | `app/api/v1/integrations/nuvemshop/callback/route.ts` |
| `/api/v1/inventory/movements` | GET/POST | requireRole, force-dynamic | 129 | `app/api/v1/inventory/movements/route.ts` |
| `/api/v1/inventory/sugestoes` | GET | requireRole, force-dynamic | 107 | `app/api/v1/inventory/sugestoes/route.ts` |
| `/api/v1/invoices` | POST | requireRole, service-role, force-dynamic | 161 | `app/api/v1/invoices/route.ts` |
| `/api/v1/invoices/:id` | GET | requireRole, force-dynamic | 207 | `app/api/v1/invoices/[id]/route.ts` |
| `/api/v1/invoices/:id/ajustes` | GET/PATCH | requireRole, service-role, force-dynamic | 91 | `app/api/v1/invoices/[id]/ajustes/route.ts` |
| `/api/v1/invoices/:id/cancel` | POST | requireRole, service-role, force-dynamic | 289 | `app/api/v1/invoices/[id]/cancel/route.ts` |
| `/api/v1/invoices/:id/carta-correcao` | POST | requireRole, service-role, force-dynamic | 109 | `app/api/v1/invoices/[id]/carta-correcao/route.ts` |
| `/api/v1/invoices/:id/danfe` | GET | requireRole, force-dynamic | 105 | `app/api/v1/invoices/[id]/danfe/route.ts` |
| `/api/v1/invoices/:id/reemitir` | POST | requireRole, service-role, force-dynamic | 153 | `app/api/v1/invoices/[id]/reemitir/route.ts` |
| `/api/v1/invoices/:id/xml` | GET | requireRole, force-dynamic | 46 | `app/api/v1/invoices/[id]/xml/route.ts` |
| `/api/v1/invoices/importar-xmls` | POST | requireRole, service-role, force-dynamic | 159 | `app/api/v1/invoices/importar-xmls/route.ts` |
| `/api/v1/invoices/validar` | POST | requireRole, force-dynamic | 254 | `app/api/v1/invoices/validar/route.ts` |
| `/api/v1/laya/saude` | GET | requireRole, service-role, force-dynamic | 34 | `app/api/v1/laya/saude/route.ts` |
| `/api/v1/lead-captures` | GET | requireRole, force-dynamic | 97 | `app/api/v1/lead-captures/route.ts` |
| `/api/v1/leads` | GET/POST | requireRole, force-dynamic | 89 | `app/api/v1/leads/route.ts` |
| `/api/v1/leads/:id` | PATCH | requireRole, force-dynamic | 63 | `app/api/v1/leads/[id]/route.ts` |
| `/api/v1/leads/:id/lose` | POST | requireRole, force-dynamic | 62 | `app/api/v1/leads/[id]/lose/route.ts` |
| `/api/v1/leads/:id/move` | POST | requireRole, force-dynamic | 203 | `app/api/v1/leads/[id]/move/route.ts` |
| `/api/v1/leads/:id/next-action` | POST | requireRole, force-dynamic | 143 | `app/api/v1/leads/[id]/next-action/route.ts` |
| `/api/v1/leads/:id/reactivation` | POST | requireRole, force-dynamic | 202 | `app/api/v1/leads/[id]/reactivation/route.ts` |
| `/api/v1/leads/:id/timeline` | GET | force-dynamic | 125 | `app/api/v1/leads/[id]/timeline/route.ts` |
| `/api/v1/leads/:id/win` | POST | requireRole, force-dynamic | 56 | `app/api/v1/leads/[id]/win/route.ts` |
| `/api/v1/leads/at-risk` | GET | requireRole, service-role, force-dynamic | 60 | `app/api/v1/leads/at-risk/route.ts` |
| `/api/v1/leads/bulk` | POST | requireRole, service-role, force-dynamic | 343 | `app/api/v1/leads/bulk/route.ts` |
| `/api/v1/leads/import` | GET/POST | requireRole, force-dynamic | 256 | `app/api/v1/leads/import/route.ts` |
| `/api/v1/leads/proposals` | GET | service-role, force-dynamic | 194 | `app/api/v1/leads/proposals/route.ts` |
| `/api/v1/leads/reactivations` | GET | requireRole, force-dynamic | 56 | `app/api/v1/leads/reactivations/route.ts` |
| `/api/v1/lgpd/anonymize` | POST | requireRole, force-dynamic | 177 | `app/api/v1/lgpd/anonymize/route.ts` |
| `/api/v1/lgpd/requests` | GET | requireRole, force-dynamic | 125 | `app/api/v1/lgpd/requests/route.ts` |
| `/api/v1/lgpd/requests/:id` | GET | requireRole, service-role, force-dynamic | 97 | `app/api/v1/lgpd/requests/[id]/route.ts` |
| `/api/v1/lgpd/requests/:id/approve` | POST | requireRole, service-role, force-dynamic | 205 | `app/api/v1/lgpd/requests/[id]/approve/route.ts` |
| `/api/v1/lgpd/requests/:id/preview` | GET | requireRole, service-role, force-dynamic | 124 | `app/api/v1/lgpd/requests/[id]/preview/route.ts` |
| `/api/v1/marca/logo` | POST/DELETE | platform-admin, service-role, force-dynamic | 490 | `app/api/v1/marca/logo/route.ts` |
| `/api/v1/mcp/tools` | GET | force-dynamic | 59 | `app/api/v1/mcp/tools/route.ts` |
| `/api/v1/message-templates` | GET/POST | requireRole, force-dynamic | 87 | `app/api/v1/message-templates/route.ts` |
| `/api/v1/message-templates/:id` | PATCH/DELETE | requireRole, force-dynamic | 94 | `app/api/v1/message-templates/[id]/route.ts` |
| `/api/v1/messages` | POST | requireRole, service-role, force-dynamic | 112 | `app/api/v1/messages/route.ts` |
| `/api/v1/messages/:id/media` | GET | redirect, service-role, force-dynamic | 148 | `app/api/v1/messages/[id]/media/route.ts` |
| `/api/v1/metrics/atrito` | GET/PATCH | requireRole, service-role, force-dynamic | 249 | `app/api/v1/metrics/atrito/route.ts` |
| `/api/v1/metrics/attendants` | GET | requireRole, service-role, force-dynamic | 119 | `app/api/v1/metrics/attendants/route.ts` |
| `/api/v1/notifications/push` | GET/PUT/DELETE | requireRole, force-dynamic | 117 | `app/api/v1/notifications/push/route.ts` |
| `/api/v1/offline-devices` | GET/POST | requireRole, service-role, force-dynamic | 164 | `app/api/v1/offline-devices/route.ts` |
| `/api/v1/offline-devices/:id/revoke` | POST | requireRole, force-dynamic | 67 | `app/api/v1/offline-devices/[id]/revoke/route.ts` |
| `/api/v1/onboarding/whatsapp/qr` | GET | — | 44 | `app/api/v1/onboarding/whatsapp/qr/route.ts` |
| `/api/v1/onboarding/whatsapp/session` | GET/POST | — | 199 | `app/api/v1/onboarding/whatsapp/session/route.ts` |
| `/api/v1/payment-methods` | GET/POST | requireRole, force-dynamic | 91 | `app/api/v1/payment-methods/route.ts` |
| `/api/v1/payment-methods/:id` | PATCH/DELETE | requireRole, force-dynamic | 87 | `app/api/v1/payment-methods/[id]/route.ts` |
| `/api/v1/pipelines` | GET/POST | requireRole, force-dynamic | 177 | `app/api/v1/pipelines/route.ts` |
| `/api/v1/pipelines/:id` | PATCH/DELETE | requireRole, force-dynamic | 291 | `app/api/v1/pipelines/[id]/route.ts` |
| `/api/v1/pipelines/:id/agent-mapping` | GET/PUT | requireRole, force-dynamic | 282 | `app/api/v1/pipelines/[id]/agent-mapping/route.ts` |
| `/api/v1/pipelines/:id/board` | GET | force-dynamic | 436 | `app/api/v1/pipelines/[id]/board/route.ts` |
| `/api/v1/pipelines/:id/stages` | POST | requireRole, force-dynamic | 77 | `app/api/v1/pipelines/[id]/stages/route.ts` |
| `/api/v1/pipelines/:id/stages/:stageId` | PATCH/DELETE | requireRole, force-dynamic | 112 | `app/api/v1/pipelines/[id]/stages/[stageId]/route.ts` |
| `/api/v1/pipelines/default` | GET | requireRole, force-dynamic | 55 | `app/api/v1/pipelines/default/route.ts` |
| `/api/v1/price-tables` | GET/POST | requireRole, force-dynamic | 85 | `app/api/v1/price-tables/route.ts` |
| `/api/v1/price-tables/:id` | GET/PATCH | requireRole, force-dynamic | 103 | `app/api/v1/price-tables/[id]/route.ts` |
| `/api/v1/price-tables/:id/items` | PUT | requireRole, force-dynamic | 99 | `app/api/v1/price-tables/[id]/items/route.ts` |
| `/api/v1/products` | GET/POST | requireRole, force-dynamic | 142 | `app/api/v1/products/route.ts` |
| `/api/v1/products/:id` | PATCH/DELETE | requireRole, force-dynamic | 118 | `app/api/v1/products/[id]/route.ts` |
| `/api/v1/products/:id/images` | GET/POST | requireRole, service-role, force-dynamic | 161 | `app/api/v1/products/[id]/images/route.ts` |
| `/api/v1/products/:id/images/:imageId` | GET/DELETE | requireRole, service-role, force-dynamic | 103 | `app/api/v1/products/[id]/images/[imageId]/route.ts` |
| `/api/v1/products/afins` | GET | requireRole, force-dynamic | 122 | `app/api/v1/products/afins/route.ts` |
| `/api/v1/products/images` | POST | requireRole, force-dynamic | 101 | `app/api/v1/products/images/route.ts` |
| `/api/v1/products/import` | GET/POST | requireRole, force-dynamic | 233 | `app/api/v1/products/import/route.ts` |
| `/api/v1/products/ncm-completar` | POST | requireRole, force-dynamic | 297 | `app/api/v1/products/ncm-completar/route.ts` |
| `/api/v1/products/ncm-sugestao` | GET | requireRole, force-dynamic | 91 | `app/api/v1/products/ncm-sugestao/route.ts` |
| `/api/v1/prospecting/campaigns` | GET/POST | requireRole, service-role, force-dynamic | 430 | `app/api/v1/prospecting/campaigns/route.ts` |
| `/api/v1/prospecting/campaigns/:id` | GET/PATCH/DELETE | requireRole, service-role, force-dynamic | 476 | `app/api/v1/prospecting/campaigns/[id]/route.ts` |
| `/api/v1/prospecting/campaigns/:id/controle` | GET | requireRole, service-role, force-dynamic | 636 | `app/api/v1/prospecting/campaigns/[id]/controle/route.ts` |
| `/api/v1/prospecting/campaigns/:id/executar` | POST | requireRole, service-role, force-dynamic | 218 | `app/api/v1/prospecting/campaigns/[id]/executar/route.ts` |
| `/api/v1/prospecting/campaigns/:id/gastos` | GET/POST | requireRole, force-dynamic | 92 | `app/api/v1/prospecting/campaigns/[id]/gastos/route.ts` |
| `/api/v1/prospecting/campaigns/:id/gastos/:spendId` | PATCH/DELETE | requireRole, force-dynamic | 90 | `app/api/v1/prospecting/campaigns/[id]/gastos/[spendId]/route.ts` |
| `/api/v1/prospecting/campaigns/:id/laboratorio` | GET/POST | requireRole, service-role, force-dynamic | 321 | `app/api/v1/prospecting/campaigns/[id]/laboratorio/route.ts` |
| `/api/v1/prospecting/campaigns/:id/liberar-reservas` | POST | requireRole, service-role, force-dynamic | 126 | `app/api/v1/prospecting/campaigns/[id]/liberar-reservas/route.ts` |
| `/api/v1/prospecting/campaigns/:id/painel` | GET | requireRole, force-dynamic | 175 | `app/api/v1/prospecting/campaigns/[id]/painel/route.ts` |
| `/api/v1/prospecting/campaigns/:id/publico` | GET | requireRole, service-role, force-dynamic | 152 | `app/api/v1/prospecting/campaigns/[id]/publico/route.ts` |
| `/api/v1/prospecting/campaigns/:id/reenviar-falhas-de-pagamento` | POST | requireRole, service-role, force-dynamic | 224 | `app/api/v1/prospecting/campaigns/[id]/reenviar-falhas-de-pagamento/route.ts` |
| `/api/v1/prospecting/campaigns/canais` | GET | requireRole, service-role, force-dynamic | 81 | `app/api/v1/prospecting/campaigns/canais/route.ts` |
| `/api/v1/prospecting/campaigns/midia` | POST | requireRole, service-role, force-dynamic | 119 | `app/api/v1/prospecting/campaigns/midia/route.ts` |
| `/api/v1/prospecting/campaigns/numeros` | GET | requireRole, service-role, force-dynamic | 52 | `app/api/v1/prospecting/campaigns/numeros/route.ts` |
| `/api/v1/prospecting/campaigns/opcoes` | GET | requireRole, service-role, force-dynamic | 106 | `app/api/v1/prospecting/campaigns/opcoes/route.ts` |
| `/api/v1/prospecting/campaigns/preview` | POST | requireRole, service-role, force-dynamic | 118 | `app/api/v1/prospecting/campaigns/preview/route.ts` |
| `/api/v1/prospecting/campaigns/recuperacao` | POST | requireRole, service-role | 162 | `app/api/v1/prospecting/campaigns/recuperacao/route.ts` |
| `/api/v1/prospecting/campaigns/recuperacao/preview` | POST | requireRole, service-role, force-dynamic | 126 | `app/api/v1/prospecting/campaigns/recuperacao/preview/route.ts` |
| `/api/v1/prospecting/campaigns/regiao` | POST | requireRole, service-role | 204 | `app/api/v1/prospecting/campaigns/regiao/route.ts` |
| `/api/v1/prospecting/campaigns/regiao/cidades` | GET | requireRole, service-role, force-dynamic | 62 | `app/api/v1/prospecting/campaigns/regiao/cidades/route.ts` |
| `/api/v1/prospecting/campaigns/regiao/preview` | POST | requireRole, service-role, force-dynamic | 126 | `app/api/v1/prospecting/campaigns/regiao/preview/route.ts` |
| `/api/v1/prospecting/consumo` | GET | requireRole, force-dynamic | 86 | `app/api/v1/prospecting/consumo/route.ts` |
| `/api/v1/prospecting/mensagens-por-categoria` | GET/PUT | requireRole, service-role, force-dynamic | 144 | `app/api/v1/prospecting/mensagens-por-categoria/route.ts` |
| `/api/v1/prospecting/mercado` | GET | requireRole, force-dynamic | 245 | `app/api/v1/prospecting/mercado/route.ts` |
| `/api/v1/prospecting/prospects` | GET | requireRole, service-role, force-dynamic | 413 | `app/api/v1/prospecting/prospects/route.ts` |
| `/api/v1/prospecting/prospects/:id` | PATCH/DELETE | requireRole, force-dynamic | 242 | `app/api/v1/prospecting/prospects/[id]/route.ts` |
| `/api/v1/prospecting/prospects/:id/raio-x` | POST | requireRole, service-role, force-dynamic | 152 | `app/api/v1/prospecting/prospects/[id]/raio-x/route.ts` |
| `/api/v1/prospecting/prospects/categorias` | GET | requireRole, service-role, force-dynamic | 189 | `app/api/v1/prospecting/prospects/categorias/route.ts` |
| `/api/v1/prospecting/prospects/disparar` | POST | requireRole, service-role, force-dynamic | 1054 | `app/api/v1/prospecting/prospects/disparar/route.ts` |
| `/api/v1/prospecting/prospects/import` | POST | requireRole, force-dynamic | 205 | `app/api/v1/prospecting/prospects/import/route.ts` |
| `/api/v1/prospecting/prospects/import-arquivo` | POST | requireRole, service-role, force-dynamic | 72 | `app/api/v1/prospecting/prospects/import-arquivo/route.ts` |
| `/api/v1/prospecting/relatorio-gastos` | GET | requireRole, service-role, force-dynamic | 115 | `app/api/v1/prospecting/relatorio-gastos/route.ts` |
| `/api/v1/prospecting/searches` | GET/POST | requireRole, service-role, force-dynamic | 295 | `app/api/v1/prospecting/searches/route.ts` |
| `/api/v1/prospecting/searches/:id` | GET/PATCH | requireRole, force-dynamic | 105 | `app/api/v1/prospecting/searches/[id]/route.ts` |
| `/api/v1/prospecting/settings` | GET/PUT | requireRole, service-role, force-dynamic | 108 | `app/api/v1/prospecting/settings/route.ts` |
| `/api/v1/public/orcamento/:token` | GET/POST | service-role | 71 | `app/api/v1/public/orcamento/[token]/route.ts` |
| `/api/v1/purchase-orders` | GET/POST | requireRole, force-dynamic | 144 | `app/api/v1/purchase-orders/route.ts` |
| `/api/v1/purchase-orders/:id` | GET/PATCH | requireRole, service-role, force-dynamic | 166 | `app/api/v1/purchase-orders/[id]/route.ts` |
| `/api/v1/purchase-orders/:id/receber` | POST | requireRole, force-dynamic | 220 | `app/api/v1/purchase-orders/[id]/receber/route.ts` |
| `/api/v1/radar-compras` | GET | requireRole, service-role, force-dynamic | 210 | `app/api/v1/radar-compras/route.ts` |
| `/api/v1/roadmap` | GET | requireRole, force-dynamic | 110 | `app/api/v1/roadmap/route.ts` |
| `/api/v1/rotas` | GET | requireRole, force-dynamic | 59 | `app/api/v1/rotas/route.ts` |
| `/api/v1/sales-brain` | GET | requireRole, service-role, force-dynamic | 117 | `app/api/v1/sales-brain/route.ts` |
| `/api/v1/sentinel/occurrences` | GET | requireRole, force-dynamic | 84 | `app/api/v1/sentinel/occurrences/route.ts` |
| `/api/v1/sentinel/occurrences/:id` | GET/PATCH | requireRole, service-role, force-dynamic | 195 | `app/api/v1/sentinel/occurrences/[id]/route.ts` |
| `/api/v1/sentinel/occurrences/:id/correcao` | POST | requireRole, service-role, force-dynamic | 152 | `app/api/v1/sentinel/occurrences/[id]/correcao/route.ts` |
| `/api/v1/sentinel/occurrences/:id/correcao/conversa` | POST | requireRole, service-role, force-dynamic | 163 | `app/api/v1/sentinel/occurrences/[id]/correcao/conversa/route.ts` |
| `/api/v1/sentinel/occurrences/:id/correcao/conversa/reverter` | POST | requireRole, service-role, force-dynamic | 94 | `app/api/v1/sentinel/occurrences/[id]/correcao/conversa/reverter/route.ts` |
| `/api/v1/sentinel/occurrences/:id/correcao/conversa/simular` | POST | requireRole, force-dynamic | 77 | `app/api/v1/sentinel/occurrences/[id]/correcao/conversa/simular/route.ts` |
| `/api/v1/sentinel/occurrences/:id/correcao/reverter` | POST | requireRole, service-role, force-dynamic | 89 | `app/api/v1/sentinel/occurrences/[id]/correcao/reverter/route.ts` |
| `/api/v1/sentinel/occurrences/:id/correcao/simular` | POST | requireRole, force-dynamic | 79 | `app/api/v1/sentinel/occurrences/[id]/correcao/simular/route.ts` |
| `/api/v1/sentinel/scan` | POST | requireRole, force-dynamic | 60 | `app/api/v1/sentinel/scan/route.ts` |
| `/api/v1/sentinel/settings` | GET/PATCH | requireRole, force-dynamic | 132 | `app/api/v1/sentinel/settings/route.ts` |
| `/api/v1/settings/api-tokens` | GET/POST | requireRole, force-dynamic | 104 | `app/api/v1/settings/api-tokens/route.ts` |
| `/api/v1/settings/api-tokens/:id/revoke` | POST | requireRole, force-dynamic | 57 | `app/api/v1/settings/api-tokens/[id]/revoke/route.ts` |
| `/api/v1/settings/routing` | GET/PATCH | requireRole, service-role, force-dynamic | 151 | `app/api/v1/settings/routing/route.ts` |
| `/api/v1/shipments` | GET/POST | requireRole, force-dynamic | 217 | `app/api/v1/shipments/route.ts` |
| `/api/v1/shipments/:id` | GET/PATCH/DELETE | requireRole, force-dynamic | 332 | `app/api/v1/shipments/[id]/route.ts` |
| `/api/v1/shipments/:id/conciliar` | POST | requireRole, service-role, force-dynamic | 277 | `app/api/v1/shipments/[id]/conciliar/route.ts` |
| `/api/v1/shipments/:id/destinos/:destinationId/confirmar` | POST | requireRole, force-dynamic | 125 | `app/api/v1/shipments/[id]/destinos/[destinationId]/confirmar/route.ts` |
| `/api/v1/shipments/:id/destinos/:destinationId/entrada/confirmar` | POST | requireRole, force-dynamic | 200 | `app/api/v1/shipments/[id]/destinos/[destinationId]/entrada/confirmar/route.ts` |
| `/api/v1/shipments/:id/destinos/:destinationId/rejeitar` | POST | requireRole, force-dynamic | 103 | `app/api/v1/shipments/[id]/destinos/[destinationId]/rejeitar/route.ts` |
| `/api/v1/shipments/:id/destinos/:destinationId/reverter` | POST | requireRole, force-dynamic | 113 | `app/api/v1/shipments/[id]/destinos/[destinationId]/reverter/route.ts` |
| `/api/v1/shipments/:id/fechamento` | GET/PUT | requireRole, service-role, force-dynamic | 294 | `app/api/v1/shipments/[id]/fechamento/route.ts` |
| `/api/v1/shipments/:id/fechamento/pdf` | GET | requireRole, service-role, force-dynamic | 84 | `app/api/v1/shipments/[id]/fechamento/pdf/route.ts` |
| `/api/v1/shipments/:id/orders` | GET/POST | requireRole, force-dynamic | 240 | `app/api/v1/shipments/[id]/orders/route.ts` |
| `/api/v1/shipments/:id/orders/:orderId` | PATCH/DELETE | requireRole, force-dynamic | 267 | `app/api/v1/shipments/[id]/orders/[orderId]/route.ts` |
| `/api/v1/shipments/:id/orders/:orderId/proof` | GET/POST | redirect, requireRole, service-role, force-dynamic | 135 | `app/api/v1/shipments/[id]/orders/[orderId]/proof/route.ts` |
| `/api/v1/shipments/:id/romaneio` | GET | requireRole, force-dynamic | 192 | `app/api/v1/shipments/[id]/romaneio/route.ts` |
| `/api/v1/shipments/:id/rota` | GET | requireRole, force-dynamic | 75 | `app/api/v1/shipments/[id]/rota/route.ts` |
| `/api/v1/shipments/:id/rota/confirmar` | POST | requireRole, force-dynamic | 59 | `app/api/v1/shipments/[id]/rota/confirmar/route.ts` |
| `/api/v1/shipments/:id/rota/distribuicao` | PATCH | requireRole, force-dynamic | 513 | `app/api/v1/shipments/[id]/rota/distribuicao/route.ts` |
| `/api/v1/shipments/:id/rota/finalizar` | POST | force-dynamic | 17 | `app/api/v1/shipments/[id]/rota/finalizar/route.ts` |
| `/api/v1/shipments/:id/rota/geocodificar` | POST | requireRole, force-dynamic | 156 | `app/api/v1/shipments/[id]/rota/geocodificar/route.ts` |
| `/api/v1/shipments/:id/rota/iniciar` | POST | force-dynamic | 16 | `app/api/v1/shipments/[id]/rota/iniciar/route.ts` |
| `/api/v1/shipments/:id/rota/manual` | POST | requireRole, force-dynamic | 152 | `app/api/v1/shipments/[id]/rota/manual/route.ts` |
| `/api/v1/shipments/:id/rota/ordem` | PATCH | requireRole, force-dynamic | 195 | `app/api/v1/shipments/[id]/rota/ordem/route.ts` |
| `/api/v1/shipments/:id/rota/otimizar` | POST | requireRole, force-dynamic | 196 | `app/api/v1/shipments/[id]/rota/otimizar/route.ts` |
| `/api/v1/shipments/:id/rota/otimizar/veiculos` | POST | requireRole, force-dynamic | 370 | `app/api/v1/shipments/[id]/rota/otimizar/veiculos/route.ts` |
| `/api/v1/shipments/:id/rota/posicao` | GET/POST | requireRole, force-dynamic | 101 | `app/api/v1/shipments/[id]/rota/posicao/route.ts` |
| `/api/v1/shipments/:id/rota/recuperacoes` | GET | requireRole, force-dynamic | 208 | `app/api/v1/shipments/[id]/rota/recuperacoes/route.ts` |
| `/api/v1/shipments/:id/rota/recuperar` | POST | requireRole, force-dynamic | 207 | `app/api/v1/shipments/[id]/rota/recuperar/route.ts` |
| `/api/v1/sped/arquivo` | GET | requireRole, force-dynamic | 282 | `app/api/v1/sped/arquivo/route.ts` |
| `/api/v1/suppliers` | GET/POST | requireRole, force-dynamic | 86 | `app/api/v1/suppliers/route.ts` |
| `/api/v1/system/agent` | POST | service-role, force-dynamic | 210 | `app/api/v1/system/agent/route.ts` |
| `/api/v1/system/instalacao` | GET | requireRole, service-role, force-dynamic | 141 | `app/api/v1/system/instalacao/route.ts` |
| `/api/v1/system/relogio/tick` | GET/POST | requireRole, force-dynamic | 91 | `app/api/v1/system/relogio/tick/route.ts` |
| `/api/v1/system/update` | POST | service-role, force-dynamic | 134 | `app/api/v1/system/update/route.ts` |
| `/api/v1/system/version` | GET | service-role, force-dynamic | 156 | `app/api/v1/system/version/route.ts` |
| `/api/v1/tarefas` | GET/POST | requireRole, force-dynamic | 116 | `app/api/v1/tarefas/route.ts` |
| `/api/v1/tarefas/:id` | PATCH | requireRole, force-dynamic | 95 | `app/api/v1/tarefas/[id]/route.ts` |
| `/api/v1/team` | GET | requireRole, service-role, force-dynamic | 88 | `app/api/v1/team/route.ts` |
| `/api/v1/team/:user_id` | PATCH | force-dynamic | 17 | `app/api/v1/team/[user_id]/route.ts` |
| `/api/v1/team/:user_id/canais` | PATCH | — | 19 | `app/api/v1/team/[user_id]/canais/route.ts` |
| `/api/v1/team/:user_id/motorista` | PATCH | — | 18 | `app/api/v1/team/[user_id]/motorista/route.ts` |
| `/api/v1/team/:user_id/nome` | PATCH | — | 17 | `app/api/v1/team/[user_id]/nome/route.ts` |
| `/api/v1/team/:user_id/revoke` | POST | requireRole, force-dynamic | 84 | `app/api/v1/team/[user_id]/revoke/route.ts` |
| `/api/v1/team/:user_id/role` | PATCH | force-dynamic | 17 | `app/api/v1/team/[user_id]/role/route.ts` |
| `/api/v1/team/:user_id/setor` | PATCH | — | 17 | `app/api/v1/team/[user_id]/setor/route.ts` |
| `/api/v1/team/assignable` | GET | requireRole, service-role, force-dynamic | 65 | `app/api/v1/team/assignable/route.ts` |
| `/api/v1/team/invite` | POST | requireRole, service-role, force-dynamic | 160 | `app/api/v1/team/invite/route.ts` |
| `/api/v1/titulos` | GET | requireRole, force-dynamic | 114 | `app/api/v1/titulos/route.ts` |
| `/api/v1/titulos/baixas` | POST/DELETE | requireRole, force-dynamic | 112 | `app/api/v1/titulos/baixas/route.ts` |
| `/api/v1/webhook-sources` | GET/POST | requireRole, service-role, force-dynamic | 111 | `app/api/v1/webhook-sources/route.ts` |
| `/api/v1/webhook-sources/:id` | PATCH/DELETE | requireRole, service-role, force-dynamic | 136 | `app/api/v1/webhook-sources/[id]/route.ts` |
| `/api/v1/webhook-sources/:id/events` | GET | requireRole, force-dynamic | 45 | `app/api/v1/webhook-sources/[id]/events/route.ts` |
| `/api/v1/webhooks/channel/:token` | POST | service-role, force-dynamic | 160 | `app/api/v1/webhooks/channel/[token]/route.ts` |
| `/api/v1/webhooks/in/:token` | POST | redirect, service-role, force-dynamic | 645 | `app/api/v1/webhooks/in/[token]/route.ts` |
| `/api/v1/webhooks/meta/:token` | GET/POST | service-role, force-dynamic | 260 | `app/api/v1/webhooks/meta/[token]/route.ts` |
| `/api/v1/webhooks/nuvemshop/:event` | POST | service-role, force-dynamic | 175 | `app/api/v1/webhooks/nuvemshop/[event]/route.ts` |
| `/api/v1/webhooks/nuvemshop/customer-data-request` | POST | service-role, force-dynamic | 302 | `app/api/v1/webhooks/nuvemshop/customer-data-request/route.ts` |
| `/api/v1/webhooks/nuvemshop/customer-redact` | POST | service-role, force-dynamic | 275 | `app/api/v1/webhooks/nuvemshop/customer-redact/route.ts` |
| `/api/v1/webhooks/nuvemshop/store-redact` | POST | service-role, force-dynamic | 273 | `app/api/v1/webhooks/nuvemshop/store-redact/route.ts` |
| `/api/v1/webhooks/waha` | POST | service-role, force-dynamic | 185 | `app/api/v1/webhooks/waha/route.ts` |
| `/api/v1/webhooks/waha/:token` | POST | service-role, force-dynamic | 182 | `app/api/v1/webhooks/waha/[token]/route.ts` |
| `/auth/confirm` | GET | redirect | 154 | `app/auth/confirm/route.ts` |
| `/icone-512` | GET | force-dynamic | 53 | `app/icone-512/route.ts` |

## Delta de handlers desde o baseline de 17/11 (419 → 449)

Baseline = lista versionada de caminhos (`scripts/auditoria/inventario-baseline-1711.txt`), não um número decorado. O total do gerador acima inclui dois `route.ts` fora de `app/api` (`/auth/confirm`, `/icone-512`); esta seção compara só `app/api/**`.

| Área | Novas | Por que entraram | Rotas |
|---|---:|---|---|
| Observabilidade | 1 | Sonda sem cookie para o instrumento de métricas. | `/api/internal/observabilidade/sonda` |
| Observabilidade — painel | 1 | Painel de SLOs lido por platform_admin, alimentado pela série 0330–0332. | `/api/v1/admin/observabilidade` |
| Outros | 1 | Sem razão declarada. | `/api/v1/commercial-orders/orcamentos-parados` |
| Contatos | 2 | Crédito do cliente e busca de cidades — apoio à venda. | `/api/v1/contacts/:id/credito`<br>`/api/v1/contacts/cidades` |
| Sentinel — cron | 1 | Gatilho agendado da rodada; organização suspensa é ignorada na origem (0329). | `/api/v1/cron/sentinel` |
| Offline — shell | 3 | Catálogo, identidade e pedidos do APK sem cookie de sessão. | `/api/v1/device/catalog`<br>`/api/v1/device/me`<br>`/api/v1/device/orders` |
| Laya | 1 | Health check do agente Laya. | `/api/v1/laya/saude` |
| Mercos — colisões | 1 | Pedidos do ERP que não entraram porque o número já estava usado por outro pedido aqui (0344). | `/api/v1/mercos/colisoes` |
| Mercos — reconciliação | 1 | Tick diário às 21:00 UTC: enfileira o censo e a comparação no worker, sem `--aplicar` — detectar é obrigação, importar é decisão do dono. | `/api/v1/cron/mercos-reconciliacao` |
| Offline — credencial | 2 | Aparelho do APK: token hasheado `nod_...`, escopo e revogação (0322). | `/api/v1/offline-devices`<br>`/api/v1/offline-devices/:id/revoke` |
| Configuração — formas de pagamento | 2 | 0334 separa forma (t pag NT 2020.006) de prazo; lista e manutenção para a tela de configuração do tenant. | `/api/v1/payment-methods`<br>`/api/v1/payment-methods/:id` |
| Prospecção — gastos da campanha | 2 | Painel de gastos no detalhe da campanha: lanca e edita midia manual para comparar orcado com gasto (rotas GET/POST/PATCH/DELETE). | `/api/v1/prospecting/campaigns/:id/gastos`<br>`/api/v1/prospecting/campaigns/:id/gastos/:spendId` |
| Prospecção — relatório | 1 | Relatório mensal de gastos da campanha (orçado × prospecção × mídia), com CSV. | `/api/v1/prospecting/relatorio-gastos` |
| Sentinel — detecção | 4 | Rodada, ocorrências e config: Nível 1 do sistema vivo (0321–0329). | `/api/v1/sentinel/occurrences`<br>`/api/v1/sentinel/occurrences/:id`<br>`/api/v1/sentinel/scan`<br>`/api/v1/sentinel/settings` |
| Sentinel — job | 3 | Nível 2 para job travado: simular/aplicar/reverter com CAS (0325). | `/api/v1/sentinel/occurrences/:id/correcao`<br>`/api/v1/sentinel/occurrences/:id/correcao/reverter`<br>`/api/v1/sentinel/occurrences/:id/correcao/simular` |
| Sentinel — conversa | 3 | Nível 2 para claim parado: simular/aplicar/reverter com CAS e motivo (0328). | `/api/v1/sentinel/occurrences/:id/correcao/conversa`<br>`/api/v1/sentinel/occurrences/:id/correcao/conversa/reverter`<br>`/api/v1/sentinel/occurrences/:id/correcao/conversa/simular` |
| Expedição — aceite do motorista | 1 | 0336 grava a versão da rota aplicada no aparelho, com CAS na versão atual; sem isto o escritório não sabia se o motorista estava na nova sequência. | `/api/v1/shipments/:id/rota/confirmar` |

Nenhuma rota removida no período — o delta é só acréscimo.

## Layouts (13)

| Rota | Flags | Linhas | Arquivo |
|---|---|---|---|
| `/` | — | 93 | `app/(public)/layout.tsx` |
| `/` | client, metadata | 314 | `app/layout.tsx` |
| `/admin` | redirect, platform-admin, metadata | 47 | `app/admin/(protected)/layout.tsx` |
| `/admin` | — | 13 | `app/admin/layout.tsx` |
| `/admin/inbox` | — | 23 | `app/admin/(protected)/inbox/layout.tsx` |
| `/admin/tenants/:id` | platform-admin, service-role | 93 | `app/admin/(protected)/tenants/[id]/layout.tsx` |
| `/app` | redirect, service-role, metadata | 279 | `app/app/layout.tsx` |
| `/app/ai` | — | 14 | `app/app/ai/layout.tsx` |
| `/app/fiscal` | — | 17 | `app/app/fiscal/layout.tsx` |
| `/app/radar` | force-dynamic | 20 | `app/app/radar/layout.tsx` |
| `/design` | — | 21 | `app/design/layout.tsx` |
| `/legal` | — | 45 | `app/legal/layout.tsx` |
| `/onboarding` | redirect, metadata | 79 | `app/onboarding/layout.tsx` |

## Estados de rota (9)

| Rota | Flags | Linhas | Arquivo |
|---|---|---|---|
| `/app` | — | 12 | `app/app/loading.tsx` |
| `/app/agenda` | — | 17 | `app/app/agenda/loading.tsx` |
| `/app/audit` | — | 20 | `app/app/audit/loading.tsx` |
| `/app/contacts` | — | 16 | `app/app/contacts/loading.tsx` |
| `/app/inbox` | — | 26 | `app/app/inbox/loading.tsx` |
| `/app/inteligencia` | — | 12 | `app/app/inteligencia/loading.tsx` |
| `/app/kanban` | — | 20 | `app/app/kanban/loading.tsx` |
| `/app/pedidos` | — | 32 | `app/app/pedidos/loading.tsx` |
| `/app/prospeccao/campanhas/:id` | — | 16 | `app/app/prospeccao/campanhas/[id]/loading.tsx` |

## Páginas de erro (8)

| Rota | Flags | Linhas | Arquivo |
|---|---|---|---|
| `/` | client | 8 | `app/(public)/error.tsx` |
| `/` | client | 8 | `app/error.tsx` |
| `/` | client | 123 | `app/global-error.tsx` |
| `/` | — | 7 | `app/not-found.tsx` |
| `/app` | client | 8 | `app/app/error.tsx` |
| `/app/agenda` | client | 8 | `app/app/agenda/error.tsx` |
| `/app/inteligencia` | client | 11 | `app/app/inteligencia/error.tsx` |
| `/app/pedidos` | client | 16 | `app/app/pedidos/error.tsx` |

## Arquivos especiais (2)

| Rota | Flags | Linhas | Arquivo |
|---|---|---|---|
| `/` | force-dynamic | 104 | `app/icon.tsx` |
| `/` | — | 43 | `app/manifest.ts` |

