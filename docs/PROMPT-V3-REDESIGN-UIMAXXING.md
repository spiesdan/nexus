# PROMPT V3 — REDESIGN COMPLETO DO DESKCOMMCRM UTILIZANDO O REGISTRY UImaxxing
## OBJETIVO

Refatorar completamente a interface do **DeskcommCRM** utilizando os componentes reais disponibilizados pelo UImaxxing através do registry oficial:

```bash
npx shadcn@latest add https://uimaxx.ing/r/uimaxxing.json
```

O objetivo deste trabalho é **usar a biblioteca de componentes do UImaxxing dentro do DeskcommCRM**.

Não tratar o UImaxxing apenas como referência visual.

Não criar uma implementação genérica inspirada no site.

O trabalho deve utilizar os **componentes reais disponibilizados pelo registry** e adaptá-los às funcionalidades existentes do DeskcommCRM.

---

# 1. PRIMEIRA ETAPA — INSTALAR O REGISTRY

Antes de modificar qualquer tela, executar:

```bash
npx shadcn@latest add https://uimaxx.ing/r/uimaxxing.json
```

Não começar o redesign antes de entender o conteúdo disponibilizado pelo registry.

---

# 2. INVENTÁRIO COMPLETO DO UImaxxing

Depois da instalação:

## INSPECIONAR TODOS OS COMPONENTES DISPONIBILIZADOS

Não selecionar apenas alguns componentes.

Fazer um inventário completo.

Identificar:

```text
nome
categoria
arquivo
componente
dependências
props
variants
hooks
estilos
utilidades
```

Criar:

```text
docs/uimaxxing-registry.md
```

Estrutura:

```md
# UImaxxing Registry

## Componentes encontrados

### Component 1

Arquivo:
...

Categoria:
...

Uso potencial:
...

### Component 2

Arquivo:
...

Categoria:
...

Uso potencial:
...
```

---

# 3. DESCOBRIR OS COMPONENTES INDIVIDUAIS

Quando um componente individual possuir um registry próprio, registrar também seu comando.

Exemplo:

```bash
npx shadcn@latest add https://uimaxx.ing/r/settings-panel.json
```

E:

```bash
npx shadcn@latest add https://uimaxx.ing/r/account-settings.json
```

Não assumir que esses são os únicos.

O agente deve descobrir **todos os componentes reais existentes no registry**.

---

# 4. REGRA ABSOLUTA — NÃO INVENTAR COMPONENTES

Nunca inventar:

```text
nome de componente
URL
arquivo
registry
command
```

Não criar:

```text
https://uimaxx.ing/r/fake-component.json
```

Não assumir que determinado componente existe.

A fonte para determinar os componentes disponíveis deve ser o próprio registry:

```bash
npx shadcn@latest add https://uimaxx.ing/r/uimaxxing.json
```

e os arquivos disponibilizados por ele.

---

# 5. CLASSIFICAR TODOS OS COMPONENTES

Depois de descobrir todos os componentes, classificá-los.

Categorias sugeridas:

```text
Navigation
Dashboard
Metrics
Finance
Charts
Tables
Forms
Filters
Data Display
Activity
Communication
CRM
Settings
Account
AI
Agents
Command
Dialogs
Drawers
Panels
Cards
Lists
Calendar
Date/Time
Status
Notifications
Feedback
Loading
Empty States
Error States
Maps
Workflow
Other
```

Se o registry possuir categorias diferentes, preservar as categorias reais.

---

# 6. MAPEAR COMPONENTE → DESKCOMMCRM

Para cada componente encontrado, determinar se ele possui aplicação no produto.

Criar:

```text
docs/uimaxxing-deskcommcrm-map.md
```

Formato:

```text
UImaxxing Component
        ↓
DeskcommCRM Module
        ↓
Tela
        ↓
Finalidade
```

Exemplo:

```text
Settings Panel
        ↓
Settings
        ↓
/settings
        ↓
Configuração da organização
```

Outro:

```text
Account Settings
        ↓
Account
        ↓
/profile
        ↓
Configuração da conta
```

---

# 7. NÃO DEIXAR COMPONENTES SEM AVALIAÇÃO

Todos os componentes descobertos devem receber uma classificação:

```text
USE
ADAPT
COMBINE
NOT APPLICABLE
```

### USE

Utilizar diretamente.

### ADAPT

Utilizar modificando:

* dados
* labels
* props
* integração
* comportamento

sem destruir a estrutura do componente.

### COMBINE

Combinar com outros componentes UImaxxing.

### NOT APPLICABLE

Não possui aplicação real no DeskcommCRM.

Mesmo quando classificado como `NOT APPLICABLE`, registrar o motivo.

---

# 8. COMPONENTES PRIORITÁRIOS

Os componentes que possuírem maior aderência ao produto devem ser priorizados.

Especialmente componentes relacionados a:

```text
dashboard
finance
markets
metrics
tables
charts
activity
settings
account
data
analytics
navigation
filters
status
command
panels
dialogs
```

---

# 9. SETTINGS & ACCOUNT

Utilizar os componentes oficiais disponíveis.

Exemplo confirmado:

```bash
npx shadcn@latest add https://uimaxx.ing/r/settings-panel.json
```

Utilizar em:

```text
/settings
```

Também utilizar:

```bash
npx shadcn@latest add https://uimaxx.ing/r/account-settings.json
```

Utilizar em:

```text
/profile
/account
```

Não criar versões paralelas caso os componentes oficiais sejam adequados.

---

# 10. DASHBOARD

Reconstruir o Dashboard utilizando os componentes UImaxxing apropriados encontrados no registry.

Objetivo:

# SALES INTELLIGENCE

Estrutura:

```text
Dashboard
│
├── KPI / Metrics
├── Sales Performance
├── Revenue
├── Orders
├── Customers
├── Pipeline
├── Radar
├── Activity
└── AI Insights
```

Utilizar componentes reais do registry sempre que houver correspondência.

---

# 11. MÉTRICAS

Criar métricas para:

```text
Vendas
Pedidos
Clientes
Ticket médio
Pipeline
Conversão
Receita
Clientes em risco
Oportunidades
Recompras
```

Cada métrica pode apresentar:

```text
label
value
variation
trend
comparison
period
```

---

# 12. FINANCE

Adaptar os componentes financeiros do UImaxxing para:

```text
Receita
Contas a receber
Pagamentos
Pedidos
Ticket médio
Fluxo financeiro
Inadimplência
Receita por cliente
Receita por vendedor
```

Não criar um módulo financeiro visualmente separado do restante do produto.

Ele deve fazer parte do mesmo Design System.

---

# 13. TABLES

Usar os componentes de tabela disponíveis.

Aplicações:

```text
Clientes
Pedidos
Produtos
Usuários
Campanhas
Conversas
Cobranças
Financeiro
Logs
Execuções de IA
```

As tabelas devem possuir:

```text
sorting
filtering
pagination
column visibility
row actions
bulk actions
search
selection
status
```

Quando suportado pelo componente, utilizar suas funcionalidades existentes.

---

# 14. CHARTS

Utilizar componentes de gráficos disponíveis no registry.

Aplicações:

```text
Vendas
Receita
Pedidos
Clientes
Performance
Pipeline
Conversão
IA
Financeiro
```

Não utilizar gráficos somente como decoração.

Cada gráfico precisa responder uma pergunta operacional.

---

# 15. FILTERS

Utilizar componentes oficiais para filtros quando disponíveis.

Exemplos:

```text
Período
Status
Cliente
Vendedor
Equipe
Valor
Origem
Canal
Produto
```

Permitir filtros combinados.

---

# 16. RADAR

O Radar será:

# SALES INTELLIGENCE

Categorias:

```text
Risco
Oportunidade
Recompra
Cliente inativo
Follow-up
Pedido parado
Pagamento
```

Usar componentes UImaxxing adequados para:

* status
* métricas
* cards
* listas
* activity
* panels
* dialogs
* actions

---

# 17. CUSTOMER 360

Criar Customer 360 usando componentes reais do registry.

Estrutura:

```text
Cliente
│
├── Overview
├── Revenue
├── Pedidos
├── Produtos
├── WhatsApp
├── Timeline
├── Radar
├── Financeiro
└── AI Insights
```

---

# 18. INBOX

Transformar Inbox em uma interface de comunicação profissional.

Layout:

```text
Conversas
      ↓
Chat
      ↓
Customer Context
```

Painel do cliente:

```text
Cliente
Empresa
Último pedido
Revenue
Pedidos
Radar
Produtos
Timeline
AI
```

Utilizar os componentes do registry adequados para:

* listas
* conversas
* painéis
* badges
* status
* drawers
* dialogs
* inputs
* ações

---

# 19. WHATSAPP

Integrar a interface aos dados reais do WhatsApp.

Mostrar:

```text
online
offline
connecting
error
last message
unread
assigned
AI active
human active
```

---

# 20. PEDIDOS

Utilizar os componentes de:

```text
table
panel
drawer
dialog
form
status
filters
```

quando disponíveis.

Pedido:

```text
Número
Cliente
Itens
Valor
Status
Pagamento
Vendedor
Data
Expedição
```

---

# 21. KANBAN

Utilizar componentes apropriados para:

```text
Leads
Oportunidades
Pipeline
Pedidos
Follow-ups
```

Colunas:

```text
Lead
Contato
Qualificação
Proposta
Negociação
Pedido
Concluído
```

---

# 22. AI OPERATIONS

Criar uma área de controle da IA.

Mostrar:

```text
Agents
Status
Executions
Tasks
Insights
Errors
Usage
Budget
```

Exemplo:

```text
Sales Agent
● Running

Radar Agent
● Running

Follow-up Agent
● Idle
```

---

# 23. AI EXECUTION

Cada execução precisa possuir:

```text
timestamp
agent
input
steps
tools
result
status
duration
```

Estados:

```text
queued
running
waiting
completed
failed
cancelled
```

---

# 24. COMMAND CENTER

Utilizar componentes do registry relacionados a:

```text
command
search
navigation
actions
```

Permitir:

```text
Buscar cliente
Criar pedido
Abrir Radar
Ver vendas
Criar campanha
Consultar IA
Abrir Inbox
```

---

# 25. AUTOMATIONS

Utilizar componentes disponíveis que possam ser aplicados à área de automações.

A arquitetura atual com React Flow deve ser preservada.

Criar:

```text
Trigger
    ↓
Condition
    ↓
AI
    ↓
Action
    ↓
Result
```

---

# 26. CAMPAIGNS

Criar interface para:

```text
Campanhas
Segmentos
Público
Mensagens
Automação
Resultados
```

IA pode gerar:

```text
campanha
segmentação
mensagem
follow-up
```

---

# 27. ANALYTICS

Utilizar componentes UImaxxing para criar:

```text
Sales Analytics
Customer Analytics
Product Analytics
AI Analytics
Financial Analytics
Team Analytics
```

---

# 28. ACTIVITY

Criar activity feed global.

Eventos:

```text
Pedido criado
Pedido alterado
Cliente criado
WhatsApp recebido
Pagamento recebido
IA executada
Campanha criada
Follow-up realizado
```

---

# 29. NOTIFICATIONS

Utilizar componentes disponíveis para:

```text
notifications
alerts
toasts
status
```

Tipos:

```text
success
warning
error
info
```

---

# 30. FORMS

Utilizar componentes UImaxxing disponíveis para formulários.

Aplicações:

```text
Cliente
Pedido
Produto
Campanha
Usuário
Integração
Configuração
IA
```

---

# 31. DRAWERS / PANELS / DIALOGS

Priorizar componentes oficiais para ações contextuais.

Utilizar drawer quando:

```text
visualizar cliente
visualizar pedido
visualizar conversa
visualizar execução
visualizar evento
```

Utilizar dialog para:

```text
confirmação
criação
edição
ações críticas
```

---

# 32. MOBILE

Todos os componentes utilizados devem ser avaliados no mobile.

Não simplesmente esconder elementos.

Adaptar:

```text
tables → mobile views
panels → drawers
filters → filter sheet
sidebar → mobile navigation
actions → bottom/action menus
```

---

# 33. DESIGN SYSTEM

Não criar um segundo Design System.

Integrar UImaxxing com:

```text
components/ui
```

existente.

Quando houver componente equivalente:

```text
UImaxxing
    ↓
usar/adaptar
```

em vez de:

```text
criar outro componente
```

---

# 34. PRESERVAR O BACKEND

NÃO reescrever:

```text
Supabase
Database
RLS
RBAC
Auth
Multi-tenancy
APIs
Webhooks
AI agents
RAG
MCP
WAHA
Workers
Automations
```

O trabalho principal é:

```text
UI
UX
Component Architecture
Design System
Interaction
```

---

# 35. PRESERVAR FUNCIONALIDADES

Antes de modificar uma tela:

```text
identificar funcionalidades atuais
identificar APIs
identificar hooks
identificar queries
identificar mutations
identificar permissões
```

Depois remodelar a interface.

Nenhuma funcionalidade existente deve desaparecer apenas porque a tela foi redesenhada.

---

# 36. ESTRUTURA DO PROJETO

Organizar componentes sem duplicação.

Exemplo:

```text
components/
│
├── ui/
│   └── UImaxxing / shadcn primitives
│
├── dashboard/
├── inbox/
├── radar/
├── customers/
├── orders/
├── campaigns/
├── ai/
├── analytics/
├── finance/
├── automations/
├── settings/
└── shared/
```

---

# 37. COMPONENT DISCOVERY REPORT

Criar:

```text
docs/uimaxxing-components.md
```

Com uma tabela:

```text
| Component | Registry | Category | DeskcommCRM Usage | Status |
```

Status:

```text
Installed
Used
Adapted
Combined
Not Applicable
```

---

# 38. COMPONENT COVERAGE

Depois da implementação, gerar relatório:

```text
Total UImaxxing components encontrados: X

Utilizados diretamente: X

Adaptados: X

Combinados: X

Não aplicáveis: X
```

Não considerar o trabalho concluído sem fazer essa avaliação.

---

# 39. NÃO FAZER

Não:

```text
inventar componentes
inventar URLs
duplicar componentes
criar versões paralelas sem necessidade
remover funcionalidades
reescrever backend
alterar RLS
alterar autenticação
alterar banco sem necessidade
```

Não instalar dezenas de bibliotecas externas para reproduzir algo que já existe no registry.

---

# 40. ORDEM DE EXECUÇÃO

Executar exatamente nesta ordem:

## FASE 1

Auditar DeskcommCRM.

## FASE 2

Instalar:

```bash
npx shadcn@latest add https://uimaxx.ing/r/uimaxxing.json
```

## FASE 3

Inventariar TODOS os componentes.

## FASE 4

Criar:

```text
docs/uimaxxing-registry.md
```

## FASE 5

Mapear:

```text
UImaxxing → DeskcommCRM
```

## FASE 6

Integrar componentes ao Design System.

## FASE 7

Refazer App Shell.

## FASE 8

Refazer Dashboard.

## FASE 9

Refazer Inbox.

## FASE 10

Refazer Radar.

## FASE 11

Refazer Customer 360.

## FASE 12

Refazer Pedidos.

## FASE 13

Refazer Kanban.

## FASE 14

Refazer Campaigns.

## FASE 15

Refazer AI Operations.

## FASE 16

Refazer Analytics.

## FASE 17

Refazer Finance.

## FASE 18

Refazer Automations.

## FASE 19

Refazer Settings.

## FASE 20

Mobile.

## FASE 21

Visual QA.

---

# 41. VISUAL QA

Depois de cada módulo:

```text
npm run lint
npm run typecheck
npm run build
```

Se existirem scripts específicos no package.json, utilizá-los.

Também verificar:

```text
desktop
tablet
mobile
dark mode
light mode
loading
empty
error
permission denied
offline
```

---

# 42. REGRA DE QUALIDADE

Uma tela somente está concluída quando:

```text
[ ] Usa componentes oficiais quando disponíveis
[ ] Não possui componentes duplicados
[ ] Está integrada aos dados reais
[ ] Possui loading
[ ] Possui empty state
[ ] Possui error state
[ ] Possui estados de sucesso
[ ] Possui estados de permissão
[ ] Funciona no mobile
[ ] Funciona no dark mode
[ ] Funciona no light mode
[ ] Não quebra APIs
[ ] Não quebra Supabase
[ ] Não quebra RLS
[ ] Não quebra RBAC
[ ] Não remove funcionalidades existentes
```

---

# 43. RESULTADO FINAL

O resultado deve ser um DeskcommCRM completamente modernizado utilizando:

```text
UImaxxing Registry
        +
shadcn/ui
        +
Design System existente
        +
CRM
        +
Sales Intelligence
        +
AI Operations
        +
WhatsApp
        +
Analytics
        +
Finance
        +
Operations
```

O ponto central deste projeto é:

> **O UImaxxing não deve ser utilizado apenas como inspiração. Seus componentes reais devem ser descobertos através do registry, instalados, catalogados, avaliados e utilizados dentro do DeskcommCRM sempre que houver aplicação.**

Começar obrigatoriamente executando:

```bash
npx shadcn@latest add https://uimaxx.ing/r/uimaxxing.json
```

Depois disso, **não implementar o redesign no escuro**.

Primeiro descobrir o que foi instalado.

Depois mapear.

Depois implementar.

---

> Este é um REDESIGN COMPLETO do frontend. Não faça apenas ajustes incrementais no design atual. Todas as telas, layouts, componentes, hierarquia visual, navegação, espaçamentos, tabelas, cards, formulários, filtros, gráficos, drawers, modais e estados de interface devem ser reavaliados e, quando necessário, reconstruídos utilizando os componentes do UImaxxing Registry. Preserve funcionalidades, dados, APIs, regras de negócio, autenticação, permissões, Supabase, RLS e integrações, mas NÃO preserve a aparência atual do DeskcommCRM.
