# NEXUS 2.0 — Routes (121 pages)

> Fonte: `Get-ChildItem app -Filter page.tsx -Recurse` = 121.

## 1. Mapa por grupo

| Grupo | N | Rotas |
|---|---|---|
| raiz | 1 | `/` |
| (public) | 6 | `/login`, `/login/forgot`, `/login/mfa`, `/login/recovery`, `/login/reset`, `/signup` |
| sistema | 4 | `/403`, `/500`, `/503`, `/account-suspended` |
| admin | 21 | `/admin`, `/admin/dashboard`, `/admin/audit`, `/admin/inbox`, `/admin/incidents`, `/admin/lgpd`, `/admin/marca`, `/admin/platform-admins`, `/admin/tenants`, `/admin/usage`, `/admin/users`, `/admin/google` (+ subids) |
| onboarding | 9 | `/onboarding/*` (welcome, connect-whatsapp, connect-nuvemshop, setup-ai, funil, invite-team, testar, done) |
| legal/design/extras | 5 | `/legal/terms`, `/legal/privacy`, `/design`, `/team/accept-invite/[token]`, `/vitrine-agenda` |
| tenant `app/app` | 74 | ver §2 |

## 2. Tenant (74) — espinha NEXUS

- **IA (20)**: `/app/ai`, `/agents`, `/cases`, `/credentials`, `/evolution`, `/followups`, `/inbox`, `/knowledge/sources`, `/memory`, `/proposals`, `/providers`, `/routers`, `/runs`, `/skills`, `/usage`
- **Settings (15)**: `/settings/*` (api-tokens, atendimento, atualizacao, billing, canal-oficial, marca, notifications, profile, security, templates, tenant+agenda+pipelines+whatsapp)
- **Operação (39)**: `/` (home), `/agenda`, `/audit`, `/carteira`, `/comissoes`, `/connections`, `/contacts`, `/expedicao`, `/faturamento`, `/financeiro`, `/inbox`, `/indicadores`, `/integrations/nuvemshop`, `/inteligencia`, `/kanban`, `/leads/[id]`, `/lgpd`, `/metrics`, `/notas`, `/pedidos`, `/pipelines/[id]`, `/products`, `/prospeccao`, `/radar`, `/recuperacao`, `/relatorios`, `/tarefas`, `/team`, `/templates`, `/titulos`, `/webhooks`

## 3. Gaps vs NEXUS §19–§60

Sidebar atual: 6 grupos (`atendimento,crm,ia,canais,analise,organizacao`), 27 links. Sidebar NEXUS exige: VISÃO GERAL (Dashboard, Meu Dia) · VENDAS (Pedidos, Clientes, Produtos, Oportunidades, Campanhas, Prospecção) · ATENDIMENTO (Inbox, Radar, Follow-ups) · INTELIGÊNCIA (Sales Brain, Previsões, Recomendações, AI Sales Control) · OPERAÇÃO (Estoque, Compras, Expedição, Cargas, Rotas) · FINANCEIRO (Receber, Pagar, Cobranças, Fluxo) · FISCAL (NFs) · EQUIPE (Vendedores, Metas, Comissões) · CONFIG.

Faltam como rota dedicada: **Meu Dia, Sales Brain, Previsões, AI Sales Control, Estoque, Compras, Cargas, Rotas, Contas a Receber/Pagar, Fluxo de Caixa**. `inteligencia/` existe (base do Sales Brain). `financeiro/` existe monolito (fatiar). `expedicao/` existe (fatiar cargas/rotas). `radar/` existe (expandir filtros §28).

## 4. Regra

`lib/navigation/registry.ts` é a ÚNICA fonte (sidebar, hubs, ⌘K, atalhos, breadcrumbs). Toda rota nova entra no registry + teste `navegacao-completude`. Nunca três listas paralelas. Redesign 100% (§100): auditar `app/**`, dialogs, drawers, forms, tables, charts, filters, modals, empty/loading/error states, mobile — classificar NOVO DESIGN / REFATORAR / CONSOLIDAR / REMOVER.
