# Cobertura de testes por rota

> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/inventario-completo.ts`.
> Fonte: `tests/, app/, lib/, components/, hooks/, workers/`. Gerado em 2026-11-17T16:38:51.452Z. Não editar à mão.

| Medida | Valor |
|---|---|
| Arquivos de teste encontrados | 1144 |
| Telas | 156 |
| Telas com teste próprio na pasta | 15 |
| Telas citadas em algum teste | 62 |
| Telas **sem nenhum sinal de teste** | 91 |

## Método — e o limite dele

"Citada" = a rota aparece como string em algum teste. Isso **não** prova que a tela é
exercitada; prova que alguém a mencionou (às vezes só num comentário). É o teto do que
dá para medir sem executar. A Fase 2 confirma por execução.

## Telas sem nenhum sinal de teste (91)

- `/(public)/login/forgot`
- `/(public)/login/mfa`
- `/(public)/login`
- `/(public)/login/recovery`
- `/(public)/login/reset`
- `/(public)/signup`
- `/500`
- `/503`
- `/account-suspended`
- `/admin/(protected)/audit/[entryId]`
- `/admin/(protected)/audit`
- `/admin/(protected)/dashboard`
- `/admin/(protected)/google`
- `/admin/(protected)/inbox/[conversationId]`
- `/admin/(protected)/inbox`
- `/admin/(protected)/incidents/[id]`
- `/admin/(protected)/incidents`
- `/admin/(protected)/lgpd`
- `/admin/(protected)/lgpd/requests/[id]`
- `/admin/(protected)/marca`
- `/admin/(protected)`
- `/admin/(protected)/platform-admins`
- `/admin/(protected)/tenants/[id]/health`
- `/admin/(protected)/tenants/[id]`
- `/admin/(protected)/tenants/new`
- `/admin/(protected)/tenants`
- `/admin/(protected)/usage`
- `/admin/(protected)/users/[id]`
- `/admin/(protected)/users`
- `/app/ai/cases`
- `/app/ai/controle`
- `/app/ai/decisoes`
- `/app/ai/followups/enrollments/[id]`
- `/app/ai/memory`
- `/app/ai/proposals`
- `/app/ai/providers`
- `/app/ai/routers/[id]`
- `/app/ai/routers`
- `/app/ai/skills`
- `/app/ai/usage`
- `/app/carteira`
- `/app/comissoes`
- `/app/compras/[id]`
- `/app/compras`
- `/app/contacts/[id]`
- `/app/expedicao/[id]/fechamento`
- `/app/expedicao/[id]/motorista`
- `/app/expedicao/[id]`
- `/app/expedicao/[id]/rota`
- `/app/faturamento`
- `/app/fiscal/configuracoes`
- `/app/fiscal/eventos`
- `/app/fiscal/fornecedores`
- `/app/fiscal/manifestacoes`
- `/app/fiscal/notas/[id]`
- `/app/fiscal/pendentes`
- `/app/fiscal/produtos`
- `/app/fiscal/relatorios`
- `/app/fiscal/resumos`
- `/app/fiscal/sincronizacoes`
- `/app/fiscal/xml`
- `/app/inbox/[id]`
- `/app/integrations/nuvemshop`
- `/app/laboratorio`
- `/app/leads/[id]`
- `/app/lgpd/requests/[id]`
- `/app/lgpd/requests`
- `/app/metrics`
- `/app/meu-dia`
- `/app/prospeccao/campanhas/[id]`
- `/app/recuperacao`
- `/app/relatorios`
- `/app/settings/atendimento`
- `/app/settings/billing`
- `/app/settings/marca`
- `/app/settings/notifications`
- `/app/settings/security`
- `/app/tarefas`
- `/app/templates`
- `/app/titulos`
- `/app/venda-automatica`
- `/app/webhooks`
- `/o/[token]`
- `/onboarding/connect-nuvemshop`
- `/onboarding/connect-whatsapp`
- `/onboarding/done`
- `/onboarding/funil`
- `/onboarding/setup-ai`
- `/onboarding/testar`
- `/team/accept-invite/[token]`
- `/vitrine-agenda`

## Todas as telas

| Tela | Teste na pasta | Citada em teste |
|---|---|---|
| `/(public)/login/forgot` | — | — |
| `/(public)/login/mfa` | — | — |
| `/(public)/login` | — | — |
| `/(public)/login/recovery` | — | — |
| `/(public)/login/reset` | — | — |
| `/(public)/signup` | — | — |
| `/403` | — | ✓ |
| `/500` | — | — |
| `/503` | — | — |
| `/account-suspended` | — | — |
| `/admin/(protected)/audit/[entryId]` | — | — |
| `/admin/(protected)/audit` | — | — |
| `/admin/(protected)/dashboard` | — | — |
| `/admin/(protected)/google` | — | — |
| `/admin/(protected)/inbox/[conversationId]` | — | — |
| `/admin/(protected)/inbox` | — | — |
| `/admin/(protected)/incidents/[id]` | — | — |
| `/admin/(protected)/incidents` | — | — |
| `/admin/(protected)/lgpd` | — | — |
| `/admin/(protected)/lgpd/requests/[id]` | — | — |
| `/admin/(protected)/marca` | — | — |
| `/admin/(protected)` | — | — |
| `/admin/(protected)/platform-admins` | — | — |
| `/admin/(protected)/tenants/[id]/health` | — | — |
| `/admin/(protected)/tenants/[id]` | — | — |
| `/admin/(protected)/tenants/new` | — | — |
| `/admin/(protected)/tenants` | — | — |
| `/admin/(protected)/usage` | — | — |
| `/admin/(protected)/users/[id]` | — | — |
| `/admin/(protected)/users` | — | — |
| `/admin/forbidden` | — | ✓ |
| `/app/agenda` | — | ✓ |
| `/app/ai/agents/[id]` | — | ✓ |
| `/app/ai/agents/new` | — | ✓ |
| `/app/ai/agents` | 1 | ✓ |
| `/app/ai/cases` | — | — |
| `/app/ai/controle` | — | — |
| `/app/ai/credentials` | 2 | ✓ |
| `/app/ai/decisoes` | — | — |
| `/app/ai/evolution` | — | ✓ |
| `/app/ai/followups/[id]` | 3 | — |
| `/app/ai/followups/enrollments/[id]` | — | — |
| `/app/ai/followups` | 4 | ✓ |
| `/app/ai/inbox` | — | ✓ |
| `/app/ai/knowledge/sources` | — | ✓ |
| `/app/ai/memory` | — | — |
| `/app/ai` | 7 | ✓ |
| `/app/ai/proposals` | — | — |
| `/app/ai/providers` | — | — |
| `/app/ai/routers/[id]` | — | — |
| `/app/ai/routers` | — | — |
| `/app/ai/runs` | — | ✓ |
| `/app/ai/skills` | — | — |
| `/app/ai/usage` | — | — |
| `/app/audit` | — | ✓ |
| `/app/busca` | — | ✓ |
| `/app/campanhas` | — | ✓ |
| `/app/carteira` | — | — |
| `/app/comissoes` | — | — |
| `/app/compras/[id]` | — | — |
| `/app/compras` | — | — |
| `/app/connections` | — | ✓ |
| `/app/contacts/[id]` | — | — |
| `/app/contacts` | — | ✓ |
| `/app/estoque` | — | ✓ |
| `/app/expedicao/[id]/fechamento` | — | — |
| `/app/expedicao/[id]/motorista` | — | — |
| `/app/expedicao/[id]` | — | — |
| `/app/expedicao/[id]/rota` | — | — |
| `/app/expedicao/nova` | — | ✓ |
| `/app/expedicao` | — | ✓ |
| `/app/faturamento` | — | — |
| `/app/financeiro` | — | ✓ |
| `/app/fiscal/configuracoes` | — | — |
| `/app/fiscal/eventos` | — | — |
| `/app/fiscal/fornecedores` | — | — |
| `/app/fiscal/manifestacoes` | — | — |
| `/app/fiscal/notas/[id]` | — | — |
| `/app/fiscal/notas` | — | ✓ |
| `/app/fiscal` | — | ✓ |
| `/app/fiscal/pendentes` | — | — |
| `/app/fiscal/produtos` | — | — |
| `/app/fiscal/relatorios` | — | — |
| `/app/fiscal/resumos` | — | — |
| `/app/fiscal/sincronizacoes` | — | — |
| `/app/fiscal/xml` | — | — |
| `/app/frota` | — | ✓ |
| `/app/inbox/[id]` | — | — |
| `/app/inbox` | — | ✓ |
| `/app/indicadores` | — | ✓ |
| `/app/integrations/nuvemshop` | — | — |
| `/app/inteligencia` | — | ✓ |
| `/app/kanban` | 1 | ✓ |
| `/app/laboratorio` | — | — |
| `/app/leads/[id]` | — | — |
| `/app/lgpd/requests/[id]` | — | — |
| `/app/lgpd/requests` | — | — |
| `/app/metrics` | — | — |
| `/app/meu-dia` | — | — |
| `/app/notas` | — | ✓ |
| `/app` | 13 | ✓ |
| `/app/pedidos/[id]` | 1 | — |
| `/app/pedidos/imprimir` | — | ✓ |
| `/app/pedidos/novo` | — | ✓ |
| `/app/pedidos` | 1 | ✓ |
| `/app/pipelines/[id]` | — | ✓ |
| `/app/products` | — | ✓ |
| `/app/prospeccao/campanhas/[id]` | — | — |
| `/app/prospeccao/nova` | — | ✓ |
| `/app/prospeccao` | — | ✓ |
| `/app/radar/categorias` | — | ✓ |
| `/app/radar/oportunidades` | — | ✓ |
| `/app/radar` | — | ✓ |
| `/app/radar/prospeccao` | — | ✓ |
| `/app/radar/recuperacao` | — | ✓ |
| `/app/radar/risco` | — | ✓ |
| `/app/recuperacao` | — | — |
| `/app/relatorios` | — | — |
| `/app/settings/api-tokens` | — | ✓ |
| `/app/settings/atendimento` | — | — |
| `/app/settings/atualizacao` | — | ✓ |
| `/app/settings/billing` | — | — |
| `/app/settings/canal-oficial` | — | ✓ |
| `/app/settings/marca` | — | — |
| `/app/settings/notifications` | — | — |
| `/app/settings` | 3 | ✓ |
| `/app/settings/profile` | 1 | ✓ |
| `/app/settings/security` | — | — |
| `/app/settings/templates` | — | ✓ |
| `/app/settings/tenant/agenda` | — | ✓ |
| `/app/settings/tenant` | 2 | ✓ |
| `/app/settings/tenant/pipelines` | 2 | ✓ |
| `/app/settings/tenant/whatsapp` | — | ✓ |
| `/app/tarefas` | — | — |
| `/app/team/invite` | — | ✓ |
| `/app/team` | 1 | ✓ |
| `/app/templates` | — | — |
| `/app/titulos` | — | — |
| `/app/venda-automatica` | — | — |
| `/app/webhooks` | — | — |
| `/design` | — | ✓ |
| `/legal/privacy` | — | ✓ |
| `/legal/terms` | — | ✓ |
| `/o/[token]` | — | — |
| `/onboarding/connect-nuvemshop` | — | — |
| `/onboarding/connect-whatsapp` | — | — |
| `/onboarding/done` | — | — |
| `/onboarding/funil` | — | — |
| `/onboarding/invite-team` | — | ✓ |
| `/onboarding` | — | ✓ |
| `/onboarding/setup-ai` | — | — |
| `/onboarding/testar` | — | — |
| `/onboarding/welcome` | — | ✓ |
| `/page.tsx` | 61 | — |
| `/team/accept-invite/[token]` | — | — |
| `/vitrine-agenda` | — | — |

