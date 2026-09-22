# UImaxxing Registry — Inventário completo (verificado via HTTP)

> Fonte: `https://uimaxx.ing/r/*.json` — 112 IDs extraídos do chunk
> `_next/static/immutable/chunks/40a0yds09qbv6.js` (`copyText = REGISTRY_URL/id.json`).
> Probados um a um: **61 OK (60 showcase + base `uimaxxing`)**, 51 FAIL 404 (Pro-only, sem JSON público).
> Instalado em: `components/uimaxxing/` (60), `app/uimaxxing.css` (base), primitivas em `components/ui/` + `lib/series.ts`.
> Data: 2026-09-22. Nada abaixo foi inventado — slug sem `OK` não é instalável.

## Base

### uimaxxing
- Arquivo: `app/uimaxxing.css` (1876 linhas, ~66KB)
- Categoria: Stylesheet / Design tokens
- Comando: `npx shadcn@latest add https://uimaxx.ing/r/uimaxxing.json`
- Conteúdo: `@theme` com surfaces (`bg/surface/stage/frame/well/sunk/raised/chip/hairline`), texto (`fg/fg-secondary/fg-muted`), accents (indigo/violet/peach/blue), semânticas (positive/negative), fills nomeados (`.bg-orb`, `.fill-exchange`), 3 tiers de hairline, keyframes de motion. Requer Tailwind v4.
- Dependências: `clsx`, `tailwind-merge`
- Uso potencial: fundação de TODOS os componentes abaixo. Importado em `app/globals.css` após o Tailwind.

## Primitivas (registryDependencies, instaladas junto)

| Primitive | Instalado em | Usado por |
|---|---|---|
| `badge.json` | `components/ui/badge.tsx` (já existia, skip) | markets-table, plan-compare, account-switcher |
| `pill-button.json` | `components/ui/pill-button.tsx` | asset-header, consent-card, pricing-tiers, plan-compare |
| `gradient-button.json` | `components/ui/gradient-button.tsx` | auth-card, compact-ask-bar, neon-prompt-bar, swap-widget |
| `typing-field.json` | `components/ui/typing-field.tsx` | compact/floating-ask-bar, generate-button, neon-prompt-bar, swap-widget |
| `select-menu.json` | `components/ui/select-menu.tsx` | neon-prompt-bar, quick-trade-panel |
| `tabs.json` | `components/ui/tabs.tsx` (já existia, skip) | markets-table, order-book, trading-chart |
| `avatar.json` | `components/ui/avatar.tsx` (já existia, skip) | issue-activity-card, prediction-market-card |
| `orb-button.json` | `components/ui/orb-button.tsx` | match-card, mini-market-card, orb-button-set, quick-trade-panel |
| `series.json` | `lib/series.ts` | live-ticker-chart, prediction-market-card, rates-chart |
| `dot-matrix.json` | `components/ui/dot-matrix.tsx` | dot-strobe-stack |

## Settings & Account (6)

### settings-panel
- Arquivo: `components/uimaxxing/settings-panel.tsx` (192 linhas, `SettingsPanel`)
- Comando: `.../r/settings-panel.json`
- Deps: `@phosphor-icons/react` + base
- Estrutura: nav lateral (General/Account/Usage/Capabilities/Studio Code/Teamspace + Customize: Skills/Connectors/Plugins/Memory) + painel Profile (avatar, nome, role, instructions) + Preferences (Appearance System/Light/Dark).
- Uso potencial: **`/settings`** — shell de configurações da organização. ADAPT (trocar itens Studio por Gerais/Equipe/Integrações/WhatsApp/IA/LGPD).

### account-settings
- Arquivo: `components/uimaxxing/account-settings.tsx` (89 linhas, `AccountSettings`)
- Estrutura: Account (logout all, close account, role, owner, org ID) + Trusted devices.
- Uso potencial: **`/profile` ou `/account`** — conta do usuário. ADAPT.

### usage-limits
- Arquivo: `components/uimaxxing/usage-limits.tsx` (107 linhas, `UsageLimits`)
- Estrutura: limites de sessão/semana com barras (13%, 86%, 84%).
- Uso potencial: **`/settings/usage` ou AI Operations** — consumo de IA/budget. ADAPT (tokens/execuções por agente).

### account-switcher
- Arquivo: `components/uimaxxing/account-switcher.tsx` (213 linhas, `AccountSwitcher`)
- Estrutura: troca de workspace (Team/Free), planos, logout.
- Uso potencial: **AppShell** — troca de organização (multi-tenant). ADAPT.

### auth-card
- Arquivo: `components/uimaxxing/auth-card.tsx` (107 linhas, `AuthCard`)
- Estrutura: card de login (email + OAuth Orbit/Zenith).
- Uso potencial: **`/login`** — referência visual apenas; auth existente preservada. COMBINE com brand do tenant.

### consent-card
- Arquivo: `components/uimaxxing/consent-card.tsx` (35 linhas, `ConsentCard`)
- Estrutura: cookie consent (Decline/Got it).
- Uso potencial: **LGPD** — banner de consentimento. ADAPT (texto LGPD + preferências).

## Prompt & Conversation (4)

### neon-prompt-bar
- Arquivo: `components/uimaxxing/neon-prompt-bar.tsx` (134 linhas, `NeonPromptBar`)
- Deps: gradient-button, select-menu, typing-field
- Estrutura: barra de prompt com Boost (Balanced/Precise), Draft (Outline/Full essay), Talk.
- Uso potencial: **Command Center + Campaigns + AI** — entrada de IA ("Gerar campanha", "Consultar IA"). ADAPT.

### compact-ask-bar
- Arquivo: `components/uimaxxing/compact-ask-bar.tsx` (37 linhas, `CompactAskBar`)
- Estrutura: mini ask bar com ⌘K.
- Uso potencial: **Command Center trigger / busca global**. USE.

### floating-ask-bar
- Arquivo: `components/uimaxxing/floating-ask-bar.tsx` (77 linhas, `FloatingAskBar`)
- Estrutura: ask bar flutuante ("Find me some restaurants nearby").
- Uso potencial: **busca de cliente no Inbox/CRM**. ADAPT.

### generate-button
- Arquivo: `components/uimaxxing/generate-button.tsx` (174 linhas, `GenerateButton`)
- Estrutura: input "Describe a scene…" + Generate.
- Uso potencial: **Campaigns/Automations** — gerar mensagem/segmentação/follow-up via IA. ADAPT.

## Agentic & Developer Tools (4)

### ai-chat-thread
- Arquivo: `components/uimaxxing/ai-chat-thread.tsx` (138 linhas, `AiChatThread`)
- Estrutura: thread agente (resposta longa, "Used 3 tools", reply, command run, diff result).
- Uso potencial: **AI Operations (execução) + Inbox AI context**. ADAPT (timestamp/agent/input/steps/tools/result/status/duration).

### code-diff-card
- Arquivo: `components/uimaxxing/code-diff-card.tsx` (200 linhas, `CodeDiffCard`)
- Estrutura: diff viewer (main vs working tree, file list, +/- lines).
- Uso potencial: **Automations (antes/depois) + AI execution steps**. ADAPT.

### terminal-card
- Arquivo: `components/uimaxxing/terminal-card.tsx` (65 linhas, `TerminalCard`)
- Estrutura: terminal (shell reconnected, prompt).
- Uso potencial: **AI Operations logs + Automations run log**. ADAPT (execução/steps).

### issue-activity-card
- Arquivo: `components/uimaxxing/issue-activity-card.tsx` (145 linhas, `IssueActivityCard`)
- Estrutura: activity (#48127, linked, status changes).
- Uso potencial: **Activity feed global + Timeline do Customer 360**. ADAPT (eventos do CRM).

## Markets & Finance → Sales/Finance analogues (18)

> Todos com dados demo hardcoded (NRW-USD etc.) — padrão é ADAPT: manter estrutura/estilo, trocar dataset.

### markets-table
- Arquivo: `components/uimaxxing/markets-table.tsx` (322 linhas, `MarketsTable`)
- Estrutura: stats header (Mark/Oracle/24h Change/Volume/OI) + tabs (Favorites/All/Perps/Spot…) + tabela (Market/Last/24h/Funding/Volume/OI, star, NEW/SPOT tags, search).
- Uso potencial: **Clientes/Pedidos/Produtos/Campanhas/Cobranças** — tabela canônica com sorting/filtering/search/seleção. ADAPT.

### market-heatmap
- Arquivo: `components/uimaxxing/market-heatmap.tsx` (385 linhas, `MarketHeatmap`)
- Estrutura: heatmap (tiles por símbolo ±%, escala -8..+8%).
- Uso potencial: **Radar + Dashboard** — mapa de risco/oportunidade por cliente/vendedor. ADAPT.

### order-book
- Arquivo: `components/uimaxxing/order-book.tsx` (115 linhas, `OrderBook`)
- Estrutura: Order Book/Trades tabs, Price/Size/Total, spread, LIVE.
- Uso potencial: **Pedidos (book de pedidos / fila)** + Kanban lado numérico. ADAPT.

### trading-chart
- Arquivo: `components/uimaxxing/trading-chart.tsx` (381 linhas, `TradingChart`)
- Estrutura: candlestick (Chart/Funding, 5m/1h/D, indicators, OHLC, volume, SMA, range 5y..1d).
- Uso potencial: **Sales/Revenue analytics** — performance de vendas. ADAPT (candles → barras/linhas de vendas).

### live-ticker-chart
- Arquivo: `components/uimaxxing/live-ticker-chart.tsx` (274 linhas, `LiveTickerChart`)
- Deps: `lib/series.ts`
- Estrutura: price ticker (Price To Beat, countdown, target, source).
- Uso potencial: **metas de vendas em tempo real** (vs meta). ADAPT.

### rates-chart
- Arquivo: `components/uimaxxing/rates-chart.tsx` (145 linhas, `RatesChart`)
- Estrutura: Deposit/Borrow APY + range 1D..All.
- Uso potencial: **Finance (receita, ticket médio, inadimplência)**. ADAPT.

### rate-model-chart
- Arquivo: `components/uimaxxing/rate-model-chart.tsx` (110 linhas, `RateModelChart`)
- Estrutura: utilisation vs optimal, slopes.
- Uso potencial: **Pipeline/conversão (funil real vs ideal)**. ADAPT.

### depth-book
- Arquivo: `components/uimaxxing/depth-book.tsx` (146 linhas, `DepthBook`)
- Estrutura: asks/bids, spread, last price.
- Uso potencial: **Pedidos parados / Pipeline por faixa de valor**. ADAPT.

### swap-widget
- Arquivo: `components/uimaxxing/swap-widget.tsx` (152 linhas, `SwapWidget`)
- Estrutura: Send/Receive, exchange.
- Uso potencial: **criação rápida de pedido/cotação** (de→para). COMBINE com form de pedido.

### quick-trade-panel
- Arquivo: `components/uimaxxing/quick-trade-panel.tsx` (99 linhas, `QuickTradePanel`)
- Estrutura: Buy/Sell, 1-Tap, limites, terms.
- Uso potencial: **ações rápidas no Radar** (aprovar follow-up, confirmar pagamento). ADAPT.

### prediction-market-card
- Arquivo: `components/uimaxxing/prediction-market-card.tsx` (238 linhas, `PredictionMarketCard`)
- Estrutura: questão + probabilidades + barras + volume.
- Uso potencial: **Radar (probabilidade de recompra/churn)** + Campaigns (A/B). ADAPT.

### mini-market-card
- Arquivo: `components/uimaxxing/mini-market-card.tsx` (112 linhas, `MiniMarketCard`)
- Estrutura: mini card Up/Down 51%.
- Uso potencial: **Radar cards / AI insights**. ADAPT.

### match-card
- Arquivo: `components/uimaxxing/match-card.tsx` (60 linhas, `MatchCard`)
- Estrutura: Vantage 79% vs Zenith 22%, volume, arena.
- Uso potencial: **comparativo vendedor×vendedor / campanha A×B**. ADAPT.

### top-addresses
- Arquivo: `components/uimaxxing/top-addresses.tsx` (106 linhas, `TopAddresses`)
- Estrutura: ranking (Holder/Share/Deposited, Deposits/Borrows tabs).
- Uso potencial: **Top clientes / receita por cliente/vendedor**. ADAPT.

### asset-header
- Arquivo: `components/uimaxxing/asset-header.tsx` (137 linhas, `AssetHeader`)
- Estrutura: header Northwind NRWD (Deposit/Borrow, Total Deposits/Borrows/Liquidity/Utilisation/Fee).
- Uso potencial: **Customer 360 header** (cliente, receita, pedidos, ticket, risco). ADAPT.

### collateral-table
- Arquivo: `components/uimaxxing/collateral-table.tsx` (109 linhas, `CollateralTable`)
- Estrutura: Supported Collateral (Asset/Collateral Factor).
- Uso potencial: **Produtos / Cobranças / Financeiro**. ADAPT.

### protocol-parameters
- Arquivo: `components/uimaxxing/protocol-parameters.tsx` (173 linhas, `ProtocolParameters`)
- Estrutura: Total Deposits/Borrows barras 58%/4%, Hub/Market, capacity, collateral factor, penalty, health factor.
- Uso potencial: **Customer 360 Financeiro + Finance dashboard**. ADAPT.

### protocol-sidebar
- Arquivo: `components/uimaxxing/protocol-sidebar.tsx` (137 linhas, `ProtocolSidebar`)
- Estrutura: sidebar PRO (Dashboard/Activity/Explore/Deposit/Borrow/Protocol/Insights/Security/Governance/Docs/Support).
- Uso potencial: **AppShell nav** — referência para sidebar do CRM. ADAPT (itens do CRM).

## Product Surfaces (4)

### command-dock
- Arquivo: `components/uimaxxing/command-dock.tsx` (131 linhas, `CommandDock`)
- Estrutura: dock Home/Chat/Activity/Account (mobile bottom nav).
- Uso potencial: **mobile navigation + Command Center**. ADAPT.

### task-list-card
- Arquivo: `components/uimaxxing/task-list-card.tsx` (93 linhas, `TaskListCard`)
- Estrutura: Task List (PINNED/TODAY/AUG 21).
- Uso potencial: **Kanban cards + Follow-ups + Automations tasks**. ADAPT.

### category-nav
- Arquivo: `components/uimaxxing/category-nav.tsx` (96 linhas, `CategoryNav`)
- Estrutura: Category Nav (Trending/Combos/Perps/Breaking/…).
- Uso potencial: **filtros por categoria** (Radar, Campaigns, Kanban colunas). ADAPT.

### hot-topics
- Arquivo: `components/uimaxxing/hot-topics.tsx` (56 linhas, `HotTopics`)
- Estrutura: Hot topics ranking (1 Vantage $3.6K…).
- Uso potencial: **Radar "hot" (clientes quentes) + Activity highlights**. ADAPT.

## Commerce & Callouts (5)

### request-button
- Arquivo: `components/uimaxxing/request-button.tsx` (28 linhas, `RequestButton`)
- Uso potencial: **CTAs de pedido/cobrança**. USE.

### orb-button-set
- Arquivo: `components/uimaxxing/orb-button-set.tsx` (16 linhas, `OrbButtonSet`)
- Estrutura: Deposit/Withdraw.
- Uso potencial: **ações primárias pareadas** (Aprovar/Rejeitar, Enviar/Cancelar). ADAPT.

### exchange-cta
- Arquivo: `components/uimaxxing/exchange-cta.tsx` (12 linhas, `ExchangeCta`)
- Uso potencial: **CTA hero dashboard**. USE.

### insight-card
- Arquivo: `components/uimaxxing/insight-card.tsx` (36 linhas, `InsightCard`)
- Estrutura: "Meshing…" + Read more.
- Uso potencial: **AI Insights cards (Dashboard/Radar/Customer 360)**. ADAPT.

### cart-split-button
- Arquivo: `components/uimaxxing/cart-split-button.tsx` (156 linhas, `CartSplitButton`)
- Estrutura: split button (3 + View cart).
- Uso potencial: **Pedido (itens + ver carrinho)**. ADAPT.

## Buttons & Actions (6)

### back-next-pills
- Arquivo: `components/uimaxxing/back-next-pills.tsx` (62 linhas, `BackNextPills`)
- Uso potencial: **wizards (onboarding, criação de campanha/pedido)**. USE.

### continue-press-button
- Arquivo: `components/uimaxxing/continue-press-button.tsx` (241 linhas, `ContinuePressButton`)
- Estrutura: press-to-confirm.
- Uso potencial: **ações críticas (excluir, estornar, fechar pedido)**. ADAPT.

### cursor-glow-cta
- Arquivo: `components/uimaxxing/cursor-glow-cta.tsx` (159 linhas, `CursorGlowCta`)
- Uso potencial: **CTA marketing/vitrine**. NOT APPLICABLE ao app interno (manter fora do CRM).

### glass-light-button
- Arquivo: `components/uimaxxing/glass-light-button.tsx` (195 linhas, `GlassLightButton`)
- Uso potencial: **botões secundários/hero**. COMBINE.

### gradient-glow-button
- Arquivo: `components/uimaxxing/gradient-glow-button.tsx` (74 linhas)
- Uso potencial: **CTA primário IA**. COMBINE.

### emoji-reaction-button
- Arquivo: `components/uimaxxing/emoji-reaction-button.tsx` (104 linhas, `EmojiReactionButton`)
- Uso potencial: **reações rápidas no Inbox (👍/👋/🙌)** + CSAT. ADAPT.

## Toggles & Controls (2)

### toggle-stack
- Arquivo: `components/uimaxxing/toggle-stack.tsx` (214 linhas, `ToggleStack`)
- Estrutura: Live prices/Fill alerts/Testnet mode.
- Uso potencial: **switches (AI active, WhatsApp conectado, automação on/off)**. ADAPT.

### opinion-slider
- Arquivo: `components/uimaxxing/opinion-slider.tsx` (511 linhas, `OpinionSlider`)
- Estrutura: Conviction slider Disagree/Neutral/Agree 62.
- Uso potencial: **CSAT/NPS, qualificação de lead, score de intenção**. ADAPT.

## Loaders & Progress (9)

| Component | Arquivo | Uso potencial |
|---|---|---|
| `arc-spinner` | `arc-spinner.tsx` (90) | spinner global. USE |
| `dot-ring-loader` | `dot-ring-loader.tsx` (95) | loading inline. USE |
| `dot-strobe-stack` | `dot-strobe-stack.tsx` (114) | loading IA. USE |
| `equalizer-loader` | `equalizer-loader.tsx` (73) | loading WhatsApp/audio. ADAPT |
| `linear-progress` | `linear-progress.tsx` (137) | progresso (metas, onboarding, uso). USE |
| `pie-progress-dial` | `pie-progress-dial.tsx` (84) | gauge de meta. ADAPT |
| `pie-success-loader` | `pie-success-loader.tsx` (196) | Processing→Complete. USE (pedidos, pagamentos) |
| `counter-progress-ring` | `counter-progress-ring.tsx` (82) | KPI ring. ADAPT |
| `donut-progress-ring` | `donut-progress-ring.tsx` (84) | KPI ring. ADAPT |

## Pricing & Plans (2)

### pricing-tiers
- Arquivo: `components/uimaxxing/pricing-tiers.tsx` (196 linhas, `PricingTiers`)
- Uso potencial: **planos self-host/white-label (página pública)**. ADAPT. NOT APPLICABLE ao app tenant interno.

### plan-compare
- Arquivo: `components/uimaxxing/plan-compare.tsx` (157 linhas, `PlanCompare`)
- Uso potencial: **comparativo de planos (público)**. NOT APPLICABLE ao app interno.

## Pro-only sem JSON (51) — NÃO instaláveis, NÃO usar

`blend-poster-cycler`, `card-word-scroller`, `crypto-holding-card`, `curtain-montage-hero`, `depth-marquee-poster`, `dot-altitude-wave`, `dot-block-drop`, `dot-braille-beat`, `dot-checker-shift`, `dot-column-rake`, `dot-core-spiral`, `dot-echo-ring`, `dot-halo-pulse`, `dot-hollow-shell`, `dot-neon-drift`, `dot-pulse-ladder`, `dot-radar-arc`, `dot-rail-scan`, `dot-row-sweep`, `dot-sound-bars`, `dot-tripod-handoff`, `dot-twin-orbit`, `dot-updraft`, `dot-wheel-picker`, `fanned-card-carousel`, `filmstrip-expander`, `glitch-slice-cycler`, `hero-section`, `interleave-collage-banner`, `kinetic-word-hero`, `layout-showreel`, `lt-plot`, `nebula-orb`, `orbit-collage-intro`, `palette-accordion-card`, `palette-cascade-queue`, `palette-poster-stack`, `parallax-fling-gallery`, `pixel-wipe-poster`, `pmc-plot`, `portal-zoom-chapters`, `poster-drift-collage`, `rates-plot`, `scatter-type-poster`, `sliced-promo-banner`, `spec-slide-carousel`, `split-word-reveal`, `swatch-strip-accordion`, `ticker-card-stack`, `velocity-stream-marquee`, `zoom-collage-marquee`.
Motivo: HTTP 404 em `/r/<id>.json` — são vitrines Pro (carrosséis, pôsteres cinéticos, paletas, dot-matrix extras). Não replicar no CRM; loaders gráficos já cobertos pelos 9 livres.

## Cobertura (parcial — pós-instalação, pré-uso)

- Total IDs no site: 112 (111 componentes + `library`)
- Com JSON público: 60 showcase + 1 base + 10 primitivas
- Instalados: 60 showcase + base + primitivas
- Classificação de uso: ver `docs/uimaxxing-deskcommcrm-map.md` e `docs/uimaxxing-components.md`
