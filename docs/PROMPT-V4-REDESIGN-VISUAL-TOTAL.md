# DESKCOMMCRM — REDESIGN VISUAL TOTAL

## TRANSFORMAR O SISTEMA INTEIRO EM UM SaaS DARK PREMIUM NO PADRÃO VISUAL UImaxxing

> Spec entregue pelo usuário. O backport completo do prompt original está no commit de
> criação deste arquivo. Esta é a doutrina visual que substitui/refina o V3
> (`docs/PROMPT-V3-REDESIGN-UIMAXXING.md`): não é só "adicionar componentes UImaxxing",
> é **reconstruir a composição inteira** no DNA visual da referência (Interest Rates).

## 1. OBJETIVO PRINCIPAL

NÃO é: adicionar componentes, trocar alguns cards, aplicar tema escuro, trocar
componentes antigos por UImaxxing, modificar apenas o Dashboard, copiar gráficos.

É: **RECONSTRUIR VISUALMENTE O DESKCOMCRM INTEIRO**, para que pareça que foi
originalmente projetado na mesma linguagem visual do UImaxxing da referência.

Referência:
```
painel escuro
bordas extremamente sutis
tipografia branca
cinzas discretos
gráfico integrado
accent colors muito controladas
grande quantidade de espaço negativo
cards sofisticados
layout financeiro/premium
```

## 2. NÃO FAZER "DARK MODE"

Não é definir `background: #111`. É redesenhar desde a composição visual:
dark premium, minimalista, sofisticado, financeiro, moderno, denso quando
necessário, com muito espaço negativo.

## 3. DNA VISUAL OBRIGATÓRIO — fundo

Níveis: App background / Surface / Elevated surface / Panel / Nested panel /
Hover surface / Active surface. Conceitual: `#0A0A0A #0D0D0D #101010 #121212 #151515`.
Valores exatos definidos durante implementação conforme componentes UImaxxing.

## 4. Bordas

1px, low contrast, subtle. Nunca borda branca forte. Borda quase se misturando ao fundo.

## 5. Radius

Cantos médios/grandes e sofisticados (`rounded-md`/`rounded-lg`/`rounded-xl`),
consistentes em cards, panels, tables, inputs, dialogs, drawers, charts, buttons.
Evitar `rounded-full` e exagero como padrão.

## 6. Tipografia

Clareza, contraste, hierarquia, números grandes, labels pequenos, descrições
discretas. Ex.: `Title` / `descrição` / métrica grande / chart. Mesma lógica no CRM:
`Revenue / Total revenue generated this month. / R$ 182.430`.

## 7. Cores

Maioria em preto/cinza/branco/off-white. Acents com extrema moderação:
verde=positivo, laranja=atenção, vermelho=erro, azul=ação. Proibido 10 cards/10 cores/10 gradients.

## 8. Proibido — dashboard colorido genérico

`🟢 R$` `🔵 324` `🟣 92`. A referência é panel com título + descrição + métrica + chart integrado.

## 9. Site inteiro na mesma aparência

Login, Onboarding, Dashboard, Sidebar, Topbar, Customers, Customer 360, Contacts,
Orders, Order Details, Products, Kanban, Inbox, Conversation, Radar, Campaigns,
Analytics, Finance, AI, Agents, Executions, Knowledge, RAG, Memory, Skills,
Automations, Webhooks, Integrations, Team, Permissions, Settings, Account,
Notifications, Modals, Drawers, Tables, Forms, Charts, Mobile.
Não pode existir página nova e página antiga.

## 10. App Shell novo

Sidebar fina, contraste baixo, ícones discretos, labels limpos, active state
sofisticado, separadores sutis, topbar minimalista, muito espaço, conteúdo
centralizado, densidade controlada.

## 11. Sidebar

Dark, minimal, thin, subtle border, small typography, subtle hover, subtle active
(background sutil + highlight discreto). Sem blocos coloridos.

## 12. Topbar

Workspace, breadcrumbs, search, command palette, notifications, user. Minimalista.

## 13. Page Header

Título + descrição + ações + filtros contextuais (padrão `CrmPageHeader`).

## 14. Cards

Como sections/panels/data surfaces, não caixas independentes.

## 15. Gráficos

Integrados ao painel, não "Recharts dentro de Card". Preferir componentes reais do
registry (`rate-model-chart`, `rates-chart`) quando adequados.

## 16. Gráfico como parte do layout

`Title / Description / metric metric / ───── / chart` ou `metric / chart / legend`.
Sem container enorme, grid pesada, fundo branco, border forte.

## 17. Dashboard

Página de produto financeiro/analítico: Overview + métricas + painel Revenue com
chart + painéis Orders/Recent activity. Tudo na mesma linguagem.

## 18. Financeiro

Revenue, Expenses, Cash Flow, A/R, A/P, Margins, Collections. Números grandes,
gráficos, tabelas, labels pequenas, descrições, linhas divisórias, painéis.

## 19. CRM (Customers)

`1,842 customers` + `[Search] [Filters] [Add]` + tabela limpa (Customer/Status/
Revenue/Last order/Orders/Owner). Sem excesso de badges coloridos.

## 20. Customer 360

Sofisticado: header (Company, Active customer, Revenue, Orders, Last order) +
Revenue chart + Orders table + Activity timeline.

## 21. Orders

Sistema comercial premium: table, filters, status, details drawer, timeline,
metrics. Nada de card colorido por pedido.

## 22. WhatsApp Inbox

`conversations | conversation | customer profile` — painéis escuros, discretos,
bordas sutis, sem excesso de cor.

## 23. Radar

Centro analítico: Customers at risk, Reorder opportunities, Inactive customers,
Follow-ups, Open demands. Metrics+charts+tables+signals na mesma linguagem.

## 24. IA

Sem festival de gradients roxos/neon/glow. IA integrada ao produto, mesma estética premium.

## 25. Settings

Mesma identidade (`settings-panel`, `account-settings` quando apropriados); a página
inteira, não só o componente.

## 26. UImaxxing Registry

Biblioteca real de implementação. Para cada componente relevante: instalar,
inspecionar, entender, adaptar, compor, utilizar. Não inventar URLs/componentes.

## 27. UImaxxing não é o design inteiro

UImaxxing components + DeskcommCRM data + novo layout + nova hierarquia + nova
tipografia + nova navegação + nova densidade + novo sistema de cores + novo
espaçamento = NOVO DESKCOMCRM.

## 28. Todas as telas redesenhadas

Auditoria de todas as rotas; para cada: rota atual → estrutura → funcionalidades →
reconstruir layout → design system → UImaxxing → dados existentes. Não envolver o
componente antigo numa div nova.

## 29. Componentes legados

Podem ser substituídos se incompatíveis/UX ruim/não seguem o sistema/redundantes.
Backend não refeito sem necessidade. Frontend tratado como reconstrução.

## 30. Responsividade

Desktop/laptop/tablet/mobile com o mesmo sistema. Mobile não é só `width:100%` —
reorganizar informação.

## 31. Animações

Discretas: fade, slide, scale, hover, chart transitions, drawer, modal. Evitar
bounce, neon, glow, parallax, gradients excessivos.

## 32. Densidade

Informação suficiente + muito espaço negativo + hierarquia forte. Nem tudo gigante,
nem tudo card, nem tabela apertada.

## 33. Design Tokens

Centralizados: background, surface, surface-hover, surface-active, border,
border-subtle, text-primary, text-secondary, text-muted, accent, success, warning,
danger, radius, spacing, shadow. Nenhuma tela inventa valor próprio.

## 34. Resultado visual

"A sensação de que esse sistema inteiro pertence à mesma família visual do produto
da referência", não "tem alguns componentes parecidos".

## 35. Teste final

Revisar cada tela perguntando: paleta/tipografia/borders/radius/cards/gráficos/
tabelas/filtros/estados/densidade/navegação consistentes? Se parecer com o antigo — REDESENHE.

## 36. Aceitação final

Frontend todo revisado, telas principais redesenhadas, antigo design não dominante,
identidade única, UImaxxing usado de verdade, componentes não parecem peças
isoladas, gráficos integrados, tabelas/filtros/cards/formulários no mesmo sistema,
Dashboard/CRM/Financeiro/Inbox/Radar/IA/Settings como partes do mesmo produto,
desktop/mobile na mesma linguagem, backend funcional.