# Reconciliação — rotas do prompt mestre × checkout

> **Gerado por comando.** `pnpm exec tsx scripts/auditoria/reconciliar-rotas.ts`
> Extrai a lista de rotas da seção *Inventário inicial de rotas a reconciliar* de
> `PROMPT-MESTRE-AAA.md` e cruza com `inventario.json` (gerado do filesystem).
> Rota do prompt sem correspondência no código aparece como **ausente** — e ausência
> aqui não é remoção autorizada: é achado a justificar na Fase 1.

| Medida | Valor |
|---|---|
| Rotas citadas no prompt | **156** |
| Telas encontradas | 143 |
| Resolvers/redirects | 13 |
| Handlers de API | 0 |
| Ausentes no código | **0** |
| Rotas do código fora da lista do prompt | **0** |

## Raiz, público, autenticação, onboarding e legal

| Rota | Estado | Evidência |
|---|---|---|
| `/` | resolver | `app/page.tsx` · redirect |
| `/403` | tela | `app/403/page.tsx` ·  |
| `/500` | tela | `app/500/page.tsx` ·  |
| `/503` | tela | `app/503/page.tsx` ·  |
| `/design` | tela | `app/design/page.tsx` · client |
| `/vitrine-agenda` | tela | `app/vitrine-agenda/page.tsx` ·  |
| `/signup` | tela | `app/(public)/signup/page.tsx` ·  |
| `/login` | tela | `app/(public)/login/page.tsx` ·  |
| `/login/forgot` | tela | `app/(public)/login/forgot/page.tsx` ·  |
| `/login/mfa` | tela | `app/(public)/login/mfa/page.tsx` · redirect |
| `/login/recovery` | tela | `app/(public)/login/recovery/page.tsx` ·  |
| `/login/reset` | tela | `app/(public)/login/reset/page.tsx` ·  |
| `/account-suspended` | tela | `app/account-suspended/page.tsx` ·  |
| `/legal/privacy` | tela | `app/legal/privacy/page.tsx` · redirect, force-dynamic |
| `/legal/terms` | tela | `app/legal/terms/page.tsx` · force-dynamic |
| `/o/[token]` | tela | `app/o/[token]/page.tsx` · service-role, force-dynamic |
| `/team/accept-invite/[token]` | tela | `app/team/accept-invite/[token]/page.tsx` · force-dynamic |
| `/onboarding` | resolver | `app/onboarding/page.tsx` · redirect, force-dynamic |
| `/onboarding/welcome` | tela | `app/onboarding/welcome/page.tsx` · redirect, force-dynamic |
| `/onboarding/connect-nuvemshop` | tela | `app/onboarding/connect-nuvemshop/page.tsx` · force-dynamic |
| `/onboarding/connect-whatsapp` | tela | `app/onboarding/connect-whatsapp/page.tsx` · redirect, force-dynamic |
| `/onboarding/done` | tela | `app/onboarding/done/page.tsx` · redirect, force-dynamic |
| `/onboarding/funil` | tela | `app/onboarding/funil/page.tsx` · redirect, force-dynamic |
| `/onboarding/invite-team` | tela | `app/onboarding/invite-team/page.tsx` · force-dynamic |
| `/onboarding/setup-ai` | tela | `app/onboarding/setup-ai/page.tsx` · redirect, force-dynamic |
| `/onboarding/testar` | tela | `app/onboarding/testar/page.tsx` · redirect, service-role, force-dynamic |
## Administração global

| Rota | Estado | Evidência |
|---|---|---|
| `/admin` | resolver | `app/admin/(protected)/page.tsx` · redirect |
| `/admin/dashboard` | tela | `app/admin/(protected)/dashboard/page.tsx` ·  |
| `/admin/forbidden` | tela | `app/admin/forbidden/page.tsx` · platform-admin |
| `/admin/audit` | tela | `app/admin/(protected)/audit/page.tsx` ·  |
| `/admin/audit/[entryId]` | tela | `app/admin/(protected)/audit/[entryId]/page.tsx` ·  |
| `/admin/google` | tela | `app/admin/(protected)/google/page.tsx` · redirect, notFound, platform-admin, service-role, force-dynamic |
| `/admin/inbox` | tela | `app/admin/(protected)/inbox/page.tsx` · platform-admin |
| `/admin/inbox/[conversationId]` | tela | `app/admin/(protected)/inbox/[conversationId]/page.tsx` ·  |
| `/admin/incidents` | tela | `app/admin/(protected)/incidents/page.tsx` ·  |
| `/admin/incidents/[id]` | tela | `app/admin/(protected)/incidents/[id]/page.tsx` ·  |
| `/admin/lgpd` | tela | `app/admin/(protected)/lgpd/page.tsx` ·  |
| `/admin/lgpd/requests/[id]` | tela | `app/admin/(protected)/lgpd/requests/[id]/page.tsx` ·  |
| `/admin/marca` | tela | `app/admin/(protected)/marca/page.tsx` · redirect, notFound, platform-admin, force-dynamic |
| `/admin/platform-admins` | tela | `app/admin/(protected)/platform-admins/page.tsx` ·  |
| `/admin/tenants` | tela | `app/admin/(protected)/tenants/page.tsx` ·  |
| `/admin/tenants/new` | tela | `app/admin/(protected)/tenants/new/page.tsx` ·  |
| `/admin/tenants/[id]` | tela | `app/admin/(protected)/tenants/[id]/page.tsx` ·  |
| `/admin/tenants/[id]/health` | tela | `app/admin/(protected)/tenants/[id]/health/page.tsx` ·  |
| `/admin/usage` | tela | `app/admin/(protected)/usage/page.tsx` ·  |
| `/admin/users` | tela | `app/admin/(protected)/users/page.tsx` ·  |
| `/admin/users/[id]` | tela | `app/admin/(protected)/users/[id]/page.tsx` ·  |
## Aplicação tenant e CRM

| Rota | Estado | Evidência |
|---|---|---|
| `/app` | tela | `app/app/page.tsx` · redirect, force-dynamic |
| `/app/meu-dia` | tela | `app/app/meu-dia/page.tsx` · redirect, force-dynamic |
| `/app/contacts` | tela | `app/app/contacts/page.tsx` · force-dynamic |
| `/app/contacts/[id]` | tela | `app/app/contacts/[id]/page.tsx` · redirect, notFound, force-dynamic |
| `/app/leads/[id]` | resolver | `app/app/leads/[id]/page.tsx` · redirect, notFound, force-dynamic |
| `/app/inbox` | tela | `app/app/inbox/page.tsx` · redirect, force-dynamic |
| `/app/inbox/[id]` | resolver | `app/app/inbox/[id]/page.tsx` · redirect, force-dynamic |
| `/app/busca` | tela | `app/app/busca/page.tsx` · redirect, force-dynamic |
| `/app/carteira` | tela | `app/app/carteira/page.tsx` · redirect, force-dynamic |
| `/app/kanban` | tela | `app/app/kanban/page.tsx` · redirect, requireRole, force-dynamic |
| `/app/pipelines/[id]` | tela | `app/app/pipelines/[id]/page.tsx` · redirect, notFound, force-dynamic |
| `/app/tarefas` | tela | `app/app/tarefas/page.tsx` · redirect, force-dynamic |
| `/app/agenda` | tela | `app/app/agenda/page.tsx` · redirect, notFound, force-dynamic |
| `/app/notas` | tela | `app/app/notas/page.tsx` · redirect, force-dynamic |
| `/app/team` | tela | `app/app/team/page.tsx` · force-dynamic |
| `/app/team/invite` | tela | `app/app/team/invite/page.tsx` · redirect, force-dynamic |
| `/app/templates` | tela | `app/app/templates/page.tsx` · redirect, force-dynamic |
| `/app/connections` | tela | `app/app/connections/page.tsx` · redirect, force-dynamic |
| `/app/audit` | tela | `app/app/audit/page.tsx` · redirect, force-dynamic |
| `/app/lgpd/requests` | tela | `app/app/lgpd/requests/page.tsx` · redirect, force-dynamic |
| `/app/lgpd/requests/[id]` | tela | `app/app/lgpd/requests/[id]/page.tsx` · redirect, force-dynamic |
| `/app/settings` | tela | `app/app/settings/page.tsx` · force-dynamic |
| `/app/settings/api-tokens` | tela | `app/app/settings/api-tokens/page.tsx` · redirect, force-dynamic |
| `/app/settings/atendimento` | tela | `app/app/settings/atendimento/page.tsx` · redirect, force-dynamic |
| `/app/settings/atualizacao` | tela | `app/app/settings/atualizacao/page.tsx` · notFound, force-dynamic |
| `/app/settings/billing` | tela | `app/app/settings/billing/page.tsx` · redirect, force-dynamic |
| `/app/settings/canal-oficial` | resolver | `app/app/settings/canal-oficial/page.tsx` · redirect |
| `/app/settings/marca` | tela | `app/app/settings/marca/page.tsx` · redirect, notFound, force-dynamic |
| `/app/settings/notifications` | tela | `app/app/settings/notifications/page.tsx` · force-dynamic |
| `/app/settings/profile` | tela | `app/app/settings/profile/page.tsx` · force-dynamic |
| `/app/settings/security` | tela | `app/app/settings/security/page.tsx` · service-role, force-dynamic |
| `/app/settings/templates` | resolver | `app/app/settings/templates/page.tsx` · redirect |
| `/app/settings/tenant` | tela | `app/app/settings/tenant/page.tsx` · redirect, force-dynamic |
| `/app/settings/tenant/agenda` | tela | `app/app/settings/tenant/agenda/page.tsx` · redirect, force-dynamic |
| `/app/settings/tenant/pipelines` | tela | `app/app/settings/tenant/pipelines/page.tsx` · redirect, force-dynamic |
| `/app/settings/tenant/whatsapp` | resolver | `app/app/settings/tenant/whatsapp/page.tsx` · redirect |
| `/app/integrations/nuvemshop` | tela | `app/app/integrations/nuvemshop/page.tsx` · service-role, suspense |
| `/app/webhooks` | tela | `app/app/webhooks/page.tsx` · redirect, force-dynamic |
## Vendas, operação comercial e receita

| Rota | Estado | Evidência |
|---|---|---|
| `/app/campanhas` | tela | `app/app/campanhas/page.tsx` · redirect, force-dynamic |
| `/app/prospeccao` | resolver | `app/app/prospeccao/page.tsx` · redirect, force-dynamic |
| `/app/prospeccao/nova` | tela | `app/app/prospeccao/nova/page.tsx` · redirect, force-dynamic |
| `/app/prospeccao/campanhas/[id]` | tela | `app/app/prospeccao/campanhas/[id]/page.tsx` · redirect, force-dynamic |
| `/app/radar` | tela | `app/app/radar/page.tsx` · force-dynamic |
| `/app/radar/categorias` | tela | `app/app/radar/categorias/page.tsx` · force-dynamic |
| `/app/radar/oportunidades` | tela | `app/app/radar/oportunidades/page.tsx` · force-dynamic |
| `/app/radar/prospeccao` | tela | `app/app/radar/prospeccao/page.tsx` · force-dynamic |
| `/app/radar/recuperacao` | tela | `app/app/radar/recuperacao/page.tsx` · force-dynamic |
| `/app/radar/risco` | tela | `app/app/radar/risco/page.tsx` · force-dynamic |
| `/app/recuperacao` | resolver | `app/app/recuperacao/page.tsx` · redirect |
| `/app/venda-automatica` | tela | `app/app/venda-automatica/page.tsx` · redirect, force-dynamic |
| `/app/pedidos` | tela | `app/app/pedidos/page.tsx` · redirect, service-role, force-dynamic |
| `/app/pedidos/novo` | tela | `app/app/pedidos/novo/page.tsx` · redirect, force-dynamic |
| `/app/pedidos/[id]` | tela | `app/app/pedidos/[id]/page.tsx` · redirect, service-role, force-dynamic |
| `/app/pedidos/imprimir` | tela | `app/app/pedidos/imprimir/page.tsx` · redirect, force-dynamic |
| `/app/products` | tela | `app/app/products/page.tsx` · redirect, force-dynamic |
| `/app/estoque` | tela | `app/app/estoque/page.tsx` · redirect, force-dynamic |
| `/app/compras` | tela | `app/app/compras/page.tsx` · redirect, force-dynamic |
| `/app/compras/[id]` | tela | `app/app/compras/[id]/page.tsx` · redirect, notFound, force-dynamic |
| `/app/expedicao` | tela | `app/app/expedicao/page.tsx` · redirect, force-dynamic |
| `/app/expedicao/nova` | tela | `app/app/expedicao/nova/page.tsx` · redirect, force-dynamic |
| `/app/expedicao/[id]` | tela | `app/app/expedicao/[id]/page.tsx` · redirect, force-dynamic |
| `/app/expedicao/[id]/fechamento` | tela | `app/app/expedicao/[id]/fechamento/page.tsx` · force-dynamic |
| `/app/expedicao/[id]/motorista` | tela | `app/app/expedicao/[id]/motorista/page.tsx` · force-dynamic |
| `/app/expedicao/[id]/rota` | tela | `app/app/expedicao/[id]/rota/page.tsx` · force-dynamic |
| `/app/frota` | tela | `app/app/frota/page.tsx` · force-dynamic |
| `/app/faturamento` | tela | `app/app/faturamento/page.tsx` · redirect, service-role, force-dynamic |
| `/app/financeiro` | resolver | `app/app/financeiro/page.tsx` · redirect, force-dynamic |
| `/app/titulos` | resolver | `app/app/titulos/page.tsx` · redirect |
| `/app/comissoes` | tela | `app/app/comissoes/page.tsx` · redirect, service-role, force-dynamic |
## Inteligência, indicadores e relatórios

| Rota | Estado | Evidência |
|---|---|---|
| `/app/relatorios` | tela | `app/app/relatorios/page.tsx` · redirect, service-role, force-dynamic |
| `/app/indicadores` | tela | `app/app/indicadores/page.tsx` · redirect, service-role, force-dynamic |
| `/app/metrics` | resolver | `app/app/metrics/page.tsx` · redirect |
| `/app/inteligencia` | tela | `app/app/inteligencia/page.tsx` · redirect, force-dynamic |
| `/app/laboratorio` | tela | `app/app/laboratorio/page.tsx` · redirect, force-dynamic |
## Fiscal

| Rota | Estado | Evidência |
|---|---|---|
| `/app/fiscal` | tela | `app/app/fiscal/page.tsx` · force-dynamic |
| `/app/fiscal/configuracoes` | tela | `app/app/fiscal/configuracoes/page.tsx` · force-dynamic |
| `/app/fiscal/eventos` | tela | `app/app/fiscal/eventos/page.tsx` · force-dynamic |
| `/app/fiscal/fornecedores` | tela | `app/app/fiscal/fornecedores/page.tsx` · force-dynamic |
| `/app/fiscal/manifestacoes` | tela | `app/app/fiscal/manifestacoes/page.tsx` · force-dynamic |
| `/app/fiscal/notas` | tela | `app/app/fiscal/notas/page.tsx` · force-dynamic |
| `/app/fiscal/notas/[id]` | tela | `app/app/fiscal/notas/[id]/page.tsx` · notFound, force-dynamic |
| `/app/fiscal/pendentes` | tela | `app/app/fiscal/pendentes/page.tsx` · force-dynamic |
| `/app/fiscal/produtos` | tela | `app/app/fiscal/produtos/page.tsx` · force-dynamic |
| `/app/fiscal/relatorios` | tela | `app/app/fiscal/relatorios/page.tsx` · force-dynamic |
| `/app/fiscal/resumos` | tela | `app/app/fiscal/resumos/page.tsx` · force-dynamic |
| `/app/fiscal/sincronizacoes` | tela | `app/app/fiscal/sincronizacoes/page.tsx` · force-dynamic |
| `/app/fiscal/xml` | tela | `app/app/fiscal/xml/page.tsx` · force-dynamic |
## IA e automações

| Rota | Estado | Evidência |
|---|---|---|
| `/app/ai` | tela | `app/app/ai/page.tsx` · force-dynamic |
| `/app/ai/agents` | tela | `app/app/ai/agents/page.tsx` · redirect, force-dynamic |
| `/app/ai/agents/new` | tela | `app/app/ai/agents/new/page.tsx` · redirect, force-dynamic |
| `/app/ai/agents/[id]` | tela | `app/app/ai/agents/[id]/page.tsx` · redirect, notFound, force-dynamic |
| `/app/ai/cases` | tela | `app/app/ai/cases/page.tsx` · redirect, requireRole, force-dynamic |
| `/app/ai/controle` | tela | `app/app/ai/controle/page.tsx` · redirect, force-dynamic |
| `/app/ai/credentials` | tela | `app/app/ai/credentials/page.tsx` · redirect, force-dynamic |
| `/app/ai/decisoes` | tela | `app/app/ai/decisoes/page.tsx` · redirect, force-dynamic |
| `/app/ai/evolution` | tela | `app/app/ai/evolution/page.tsx` · redirect, force-dynamic |
| `/app/ai/followups` | tela | `app/app/ai/followups/page.tsx` · redirect, force-dynamic |
| `/app/ai/followups/[id]` | tela | `app/app/ai/followups/[id]/page.tsx` · redirect, notFound, force-dynamic |
| `/app/ai/followups/enrollments/[id]` | tela | `app/app/ai/followups/enrollments/[id]/page.tsx` · redirect, force-dynamic |
| `/app/ai/inbox` | tela | `app/app/ai/inbox/page.tsx` · redirect, force-dynamic |
| `/app/ai/knowledge/sources` | tela | `app/app/ai/knowledge/sources/page.tsx` · redirect, force-dynamic |
| `/app/ai/memory` | tela | `app/app/ai/memory/page.tsx` · redirect, force-dynamic |
| `/app/ai/proposals` | tela | `app/app/ai/proposals/page.tsx` · redirect, force-dynamic |
| `/app/ai/providers` | tela | `app/app/ai/providers/page.tsx` · redirect, force-dynamic |
| `/app/ai/routers` | tela | `app/app/ai/routers/page.tsx` · redirect, force-dynamic |
| `/app/ai/routers/[id]` | tela | `app/app/ai/routers/[id]/page.tsx` · redirect, notFound, force-dynamic |
| `/app/ai/runs` | tela | `app/app/ai/runs/page.tsx` · redirect, force-dynamic |
| `/app/ai/skills` | tela | `app/app/ai/skills/page.tsx` · redirect, service-role, force-dynamic |
| `/app/ai/usage` | tela | `app/app/ai/usage/page.tsx` · redirect, force-dynamic |

## Acréscimos — existem no código e não estão na lista do prompt

O prompt manda acrescentar toda rota que não estiver na lista. Estas são telas e
resolvers (APIs ficam no inventário completo, para não inflar esta tabela).

| Rota | Tipo | Arquivo |
|---|---|---|

