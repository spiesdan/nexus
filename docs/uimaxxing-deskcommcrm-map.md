# UImaxxing → DeskcommCRM — Mapa componente → módulo → tela → finalidade

> Todos os 60 componentes instalados avaliados. Nenhum inventado.
> Status: USE (direto) · ADAPT (mesma estrutura, dados/labels/props do CRM) · COMBINE (com outros UImaxxing) · NOT APPLICABLE (com motivo).

## Settings & Account

```
Settings Panel → Settings → /settings → Configuração da organização (ADAPT)
Account Settings → Account → /profile → Configuração da conta (ADAPT)
Usage Limits → AI Operations/Settings → /settings/usage → Consumo de IA e budget (ADAPT)
Account Switcher → App Shell → troca de organização multi-tenant (ADAPT)
Auth Card → Auth → /login → referência visual, auth preservada (COMBINE)
Consent Card → LGPD → banner de consentimento (ADAPT)
```

## Command Center & Busca

```
Command Dock → App Shell → navegação mobile + dock de comando (ADAPT)
Compact Ask Bar → Command Center → trigger ⌘K / busca global (USE)
Floating Ask Bar → Inbox/CRM → buscar cliente (ADAPT)
Neon Prompt Bar → AI/Campaigns → gerar campanha, mensagem, follow-up, consultar IA (ADAPT)
Generate Button → Campaigns/Automations → gerar conteúdo via IA (ADAPT)
```

## Dashboard — SALES INTELLIGENCE

```
Trading Chart → Dashboard → /app → Sales Performance / Receita (ADAPT)
Rates Chart → Dashboard/Finance → receita, ticket médio (ADAPT)
Live Ticker Chart → Dashboard → meta vs realizado em tempo real (ADAPT)
Market Heatmap → Dashboard/Radar → mapa risco×oportunidade por cliente/vendedor (ADAPT)
Counter Progress Ring → Dashboard → KPI ring (vendas, conversão) (ADAPT)
Donut Progress Ring → Dashboard → KPI ring (pipeline, recompra) (ADAPT)
Linear Progress → Dashboard → progresso de metas/onboarding (USE)
Insight Card → Dashboard/Radar/Customer 360 → AI Insights (ADAPT)
Pie Progress Dial → Dashboard → gauge de meta (ADAPT)
```

## Tables (clientes, pedidos, produtos, campanhas, cobranças, financeiro, logs, execuções IA)

```
Markets Table → Tabelas → /app/contacts|pedidos|products|campanhas → tabela canônica (stats + tabs + search + star + tags) (ADAPT)
Top Addresses → Tabelas/Rankings → top clientes, receita por cliente/vendedor (ADAPT)
Collateral Table → Produtos/Financeiro → tabelas simples Asset→Factor (ADAPT)
Order Book → Pedidos → book/fila de pedidos, spread (ADAPT)
Depth Book → Pedidos/Pipeline → pedidos por faixa de valor (ADAPT)
```

## Radar — SALES INTELLIGENCE (Risco/Oportunidade/Recompra/Inativo/Follow-up/Pedido parado/Pagamento)

```
Market Heatmap → Radar → /app/radar → visão mapa (ADAPT)
Hot Topics → Radar → clientes quentes em ranking (ADAPT)
Mini Market Card → Radar → cards de sinal (probabilidade) (ADAPT)
Match Card → Radar/Campaigns → comparativos A×B (ADAPT)
Prediction Market Card → Radar → probabilidade recompra/churn (ADAPT)
Quick Trade Panel → Radar → ações rápidas (aprovar follow-up, confirmar pagamento) (ADAPT)
Issue Activity Card → Radar/Activity → eventos do radar (ADAPT)
```

## Customer 360 (Overview/Revenue/Pedidos/Produtos/WhatsApp/Timeline/Radar/Financeiro/AI)

```
Asset Header → Customer 360 → header do cliente (receita, pedidos, ticket, risco) (ADAPT)
Protocol Parameters → Customer 360 → bloco financeiro (capacity, health) (ADAPT)
Top Addresses → Customer 360 → produtos/receita por produto (ADAPT)
Issue Activity Card → Customer 360 → Timeline (ADAPT)
Insight Card → Customer 360 → AI Insights (ADAPT)
```

## Inbox & WhatsApp (Conversas → Chat → Customer Context)

```
AI Chat Thread → Inbox → thread com contexto + ferramentas usadas (ADAPT)
Command Dock → Inbox → nav mobile (ADAPT)
Account Switcher → Inbox → atribuir conversa / trocar identidade (COMBINE)
Emoji Reaction Button → Inbox → reações rápidas + CSAT (ADAPT)
Toggle Stack → Inbox/WhatsApp → AI active/human active, online/offline (ADAPT)
Linear/Arc/Dot loaders → Inbox → sending/typing/reconnect (USE)
```

## Pedidos (Número/Cliente/Itens/Valor/Status/Pagamento/Vendedor/Data/Expedição)

```
Order Book → Pedidos → fila e spread (ADAPT)
Cart Split Button → Pedidos → itens + ver carrinho (ADAPT)
Request Button → Pedidos/Cobranças → CTAs (USE)
Pie Success Loader → Pedidos → Processing→Complete (USE)
Back Next Pills → Pedidos → wizard de criação (USE)
```

## Kanban (Lead/Contato/Qualificação/Proposta/Negociação/Pedido/Concluído)

```
Task List Card → Kanban → cards Pinned/Today (ADAPT)
Category Nav → Kanban → filtros/colunas por categoria (ADAPT)
Issue Activity Card → Kanban → histórico do card (ADAPT)
```

## Campaigns (Campanhas/Segmentos/Público/Mensagens/Automação/Resultados)

```
Neon Prompt Bar → Campaigns → gerar campanha/segmentação/mensagem (ADAPT)
Generate Button → Campaigns → gerar conteúdo (ADAPT)
Prediction Market Card → Campaigns → teste A/B por probabilidade (ADAPT)
Category Nav → Campaigns → segmentos (ADAPT)
Markets Table → Campaigns → tabela de campanhas + resultados (ADAPT)
```

## AI Operations (Agents/Status/Executions/Tasks/Insights/Errors/Usage/Budget)

```
AI Chat Thread → AI Operations → execução (timestamp/agent/input/steps/tools/result/status/duration) (ADAPT)
Terminal Card → AI Operations → logs de execução (ADAPT)
Code Diff Card → AI Operations → diff antes/depois de ação da IA (ADAPT)
Issue Activity Card → AI Operations → trilha de eventos (ADAPT)
Toggle Stack → AI Operations → liga/desliga agentes (Sales/Radar/Follow-up Running/Idle) (ADAPT)
Usage Limits → AI Operations → usage/budget (ADAPT)
Dot Strobe Stack → AI Operations → indicador "pensando" (USE)
```

## Analytics (Sales/Customer/Product/AI/Financial/Team)

```
Trading Chart → Analytics → sales analytics (ADAPT)
Rates Chart → Analytics → financial analytics (ADAPT)
Rate Model Chart → Analytics → funil real vs ideal, conversão (ADAPT)
Live Ticker Chart → Analytics → realtime (ADAPT)
Market Heatmap → Analytics → team analytics (ADAPT)
Opinion Slider → Analytics → CSAT/NPS/qualificação (ADAPT)
```

## Finance (Receita/Contas a receber/Pagamentos/Ticket/Fluxo/Inadimplência/Por cliente/vendedor)

```
Rates Chart → Finance → receita, contas a receber (ADAPT)
Rate Model Chart → Finance → fluxo vs capacidade (ADAPT)
Collateral Table → Finance → cobranças/títulos (ADAPT)
Protocol Parameters → Finance → limites e saúde financeira (ADAPT)
Top Addresses → Finance → receita por cliente/vendedor (ADAPT)
```

## Automations (Trigger→Condition→AI→Action→Result, React Flow preservado)

```
Task List Card → Automations → nós de tarefa (ADAPT)
Terminal Card → Automations → log de run (ADAPT)
Code Diff Card → Automations → diff de execução (ADAPT)
Toggle Stack → Automations → ativa/inativa fluxos (ADAPT)
Generate Button → Automations → gerar passo IA (ADAPT)
```

## Forms / Drawers / Dialogs / Filters / Notifications

```
Settings Panel → Forms → base de formulários seccionados (ADAPT)
Back Next Pills → Forms/Wizards → passos (USE)
Continue Press Button → Dialogs → ações críticas press-to-confirm (ADAPT)
Category Nav → Filters → filtros combinados (Período/Status/Cliente/Vendedor/Origem/Canal) (ADAPT)
Opinion Slider → Forms → score/qualificação (ADAPT)
Toggle Stack → Forms → switches (ADAPT)
Arc/Dot/Equalizer/Linear/Pie loaders → Loading/Empty/Error/Success/Offline (USE/ADAPT)
Orb Button Set → Ações pareadas (Aprovar/Rejeitar) (ADAPT)
Exchange CTA → CTA hero (USE)
Glass/Gradient Glow → CTAs IA/hero (COMBINE)
```

## NOT APPLICABLE (com motivo)

```
Cursor Glow CTA → marketing com glow de cursor; sem uso no app operacional interno.
Pricing Tiers → página pública de planos; fora do tenant app (pode servir vitrine self-host, fora do escopo do redesign interno).
Plan Compare → idem, comparativo público.
```

## Resumo da cobertura

- Total com JSON público: 60 showcase + 1 base
- USE: 8 (compact-ask-bar, request-button, exchange-cta, back-next-pills, arc-spinner, dot-ring-loader, dot-strobe-stack, linear-progress, pie-success-loader → 9; consolidado na tabela)
- ADAPT: maioria (~45) — estrutura preservada, dados do CRM
- COMBINE: 4 (auth-card, account-switcher no inbox, swap-widget no pedido, glass/gradient buttons)
- NOT APPLICABLE: 3 (cursor-glow-cta, pricing-tiers*, plan-compare* — *fora do app interno)
- Pro-only sem JSON (51): fora do escopo, motivo registrado em `uimaxxing-registry.md`
