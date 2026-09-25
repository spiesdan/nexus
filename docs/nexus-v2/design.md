# NEXUS 2.0 — Design (system + shell + redesign 100%)

> Direção §14: ERP moderno + Sales OS + operação comercial. Premium, limpo, rápido, denso, consistente. **Sem** glassmorphism, gradientes, sombras pesadas, cards gigantes, AI gimmick.

## 1. Estado atual

- Tema `beUI black premium` (branch atual) + `Visitors` como style reference (`DESIGN.md`, `globals.css` tokens dark-first) + `Nexus UI` (`components/nexus-ui/*`: `NexusPageHeader`, `NexusDataTable`, `NexusEmptyState`, `NexusIntelligence`, `NexusGraphCanvas`, `NexusAiBriefing`…) + `uimaxxing/` (66) + `motion/` (50 micro-interações).
- Shell existe: `Sidebar`, `MobileSidebar`, `TopBar`, `CommandPalette` (⌘K), `MobileDock`, `UserMenu`, `TenantSwitcher`, `AlertsBell`, `SearchTrigger`, `NavHub` (12 arquivos em `components/shell/`).
- Registry canônico alimenta sidebar/hubs/⌘K/atalhos/breadcrumbs.

## 2. Design System NEXUS (único — consolidar `ui`+`nexus-ui`+`uimaxxing`)

Tokens: `colors, typography, spacing (escala única), radius, borders (1px), surfaces (white), backgrounds (gray sutil), shadows (poucos níveis), motion`.
Componentes: `buttons, inputs, selects, tables (busca/filtros/ordenação/paginação/seleção/ações/loading/empty/error/atalhos/colunas), badges, tabs, cards (compactos), drawers, dialogs, tooltips, charts, timeline, empty/loading/error/success/partial/disabled/permission-denied`.
Micro-animações sutis (hover, focus, fade, slide, tab indicator, drawer, dialogs, status, skeletons, count-up, AI thinking, success) — nunca atrasam o usuário.

## 3. Shell alvo (§17)

```
┌ TOPBAR (search, ⌘K, notificações, usuário) ─────────┐
│ SIDEBAR │ CONTENT (breadcrumb + contextual drawer)  │
└─────────┴───────────────────────────────────────────┘
+ Command Palette + Global Search + Notifications + Contextual Drawer + Breadcrumb + User Menu
```

## 4. Sidebar alvo (§19) — remapear registry

```
VISÃO GERAL: Dashboard, Meu Dia (CRIAR)
VENDAS: Pedidos, Clientes, Produtos, Oportunidades, Campanhas, Prospecção
ATENDIMENTO: Inbox, Radar, Follow-ups
INTELIGÊNCIA: Sales Brain (CRIAR), Previsões, Recomendações, AI Sales Control (CRIAR)
OPERAÇÃO: Estoque (CRIAR), Compras (CRIAR), Expedição, Cargas, Rotas
FINANCEIRO: Receber, Pagar, Cobranças, Fluxo de Caixa (fatiar financeiro/)
FISCAL: Notas Fiscais
EQUIPE: Vendedores, Metas, Comissões
CONFIGURAÇÕES
```

## 5. Páginas-chave (§20–§25)

- **Dashboard**: centro de comando (vendas hoje, meta, projeção + clientes p/ agir + roadmap mensal + radar + IA) — não cards gigantes.
- **Meu Dia**: "o que fazer agora?" (compromissos, follow-ups, mensagens, oportunidades, tarefas, mapa, prioridades). Mobile-first.
- **Clientes**: busca/filtros/ordenação/paginação/seleção/massa + status, vendedor, última compra, ticket, ciclo, financeiro, prioridade.
- **Customer 360**: Resumo, Pedidos, Produtos, WhatsApp, Financeiro, Oportunidades, Inteligência, Timeline, IA, Próxima ação (+ticket, frequência, ciclo, recorrentes, inadimplência, risco). IA consome o contexto.
- **Pedidos/Novo pedido**: fluxo Cliente→Produtos→Qtd→Preço→Desconto→Pagamento→Entrega→Resumo→Confirmar; cálculo auto, políticas, desconto máximo, estoque, crédito, aprovação, comissão; busca SKU/código/descrição, atalhos teclado, inline, duplicação, recorrentes, sugestão IA (X→Y).
- Responsivo: 1920/1440/1280/1024/768/430/390; mobile-first p/ Meu Dia, Clientes, Inbox, Pedidos, Radar, Rotas (drawer + bottom nav + touch).

## 6. White-label (§67)

Suportar logo, nome, favicon, cores, tema, empresa (`lib/branding/*` + `settings/marca`). Eliminar residual: `DeskcommCRM` (default → `NEXUS`), `Visitors` (só referência interna), nomes antigos. Produto final: **NEXUS — Plataforma Inteligente de Vendas**.

## 7. Critério §100

Auditar `app/**`, layouts, dialogs, drawers, forms, tables, charts, filters, modals, nav, menus, empty/loading/error, mobile. Classificar NOVO DESIGN/REFATORAR/CONSOLIDAR/REMOVER. Aceite: nenhuma tela importante legada; tabelas/forms/estados/mobile/animações/tipografia/espaçamento/cores consistentes.
