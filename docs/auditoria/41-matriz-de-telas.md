# 41 — Matriz das telas de `app/app`

**Data:** 19/11/2026 · **Base:** `nexus/main` @ `1675f90a` · **Método:** uma tela
por linha, no MESMO build, em claro/escuro × 1440/390, com captura antes/depois
quando a tela muda e **número para todas**.

## O que a matriz mede — e o que ela não mede

Por tela e por combinação (4 por tela):

| Coluna                | Como foi medida                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overflow**          | `documentElement.scrollWidth - clientWidth`, depois de 1,8 s do `domcontentloaded` (em dev o `networkidle` nunca chega: o HMR mantém socket aberto) |
| **axe crítico/sério** | `@axe-core/playwright`, só `critical` e `serious`, com o **alvo** de cada violação                                                                  |
| **Console**           | `console.error` e `pageerror` da navegação, até 5 por tela                                                                                          |
| **Veredito**          | o que foi decidido: aplicado, sem mudança (e por quê), pendência com o número, ou defeito aberto                                                    |

O que ela **não** mede: contraste par a par (isso é o instrumento do
`docs/auditoria/11-auditoria-visual.md`, que lê a cor composta), tempo de
interação e fidelidade de dado. Uma tela pode passar aqui e continuar feia.

## Regra do antes/depois

- **Antes** é o estado do commit ANTERIOR ao passe de design daquela tela;
  **depois** é o mesmo build com o passe aplicado. Nunca é "build velho contra
  build novo": seria medir duas bases.
- Tela que ainda **não** recebeu passe não tem "antes": a linha diz
  `sem passe` e carrega só a medição de hoje. Inventar um "antes" para essas
  seria produzir prova de uma mudança que não existiu.
- Ordem de trabalho: **ordem de uso diário** — pedidos, atendimento, fiscal,
  expedição, financeiro, depois configuração e IA.

## Instrumento

`tests/captura-matriz.ts` (reproduzível: `next dev` + `tsx`, sem build).

```bash
BASE=http://localhost:3311 npx tsx tests/captura-matriz.ts depois --grupo pedidos-e-vendas
BASE=http://localhost:3311 npx tsx tests/captura-matriz.ts depois --rotas /pedidos,/pedidos/novo
BASE=http://localhost:3311 npx tsx tests/captura-matriz.ts depois --so-capturar
```

A lista de telas, com grupo e ordem, é `docs/auditoria/41-matriz-rotas.json`
(gerada de `find app/app -name page.tsx` — a contagem tem comando, não número
escrito à mão).

## A matriz

> Gerada por `node_modules/.bin/tsx tests/matriz-doc.ts` a partir de `41-matriz-rotas.json` e das
> medições. **Como ler o `axe`:** `0/1` nas telas de 1440 é o seletor de empresa
> do SHELL (`[data-testid="tenant-switcher"]`, `label-content-name-mismatch`),
> pré-existente, igual em toda tela e fora do recorte de cada linha; quando o
> número vem acompanhado do nome da regra no veredito, o defeito é da tela. A coluna "Overflow" é o pior caso das duas larguras (1440/390) e o
> "axe" o pior caso dos dois temas; o parêntese "(antes …)" só existe quando há
> medição de antes.

<!-- MATRIZ:INICIO -->

### 1. Pedidos e vendas — 12 telas, 12 medidas

| #   | Tela                       | Overflow 1440/390 | axe crítico/sério | Console | Veredito                                                                                                                     |
| --- | -------------------------- | ----------------- | ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/carteira`                | 0/0 px            | 0/1               | 0       | sem passe; 1 contraste (link em card, só no claro)                                                                           |
| 2   | `/comissoes`               | 0/0 px            | 0/1               | 0       | **corrigido**: Select "Vendedor" sem nome acessível (`button-name` crítico) → `aria-label`; contraste de link no claro segue |
| 3   | `/compras`                 | 0/0 px            | 0/1               | 0       | sem passe; limpo                                                                                                             |
| 4   | `/compras/[id]` · dinâmica | 0/0 px            | 0/1               | 0       | sem passe; `scrollable-region-focusable` (sério) na caixa da tabela → `tabIndex` no `Table`                                  |
| 5   | `/estoque`                 | 0/0 px            | 0/1               | 0       | sem passe; limpo                                                                                                             |
| 6   | `/faturamento`             | 0/0 px            | 0/1               | 0       | sem passe; 1 contraste (link em card, só no claro)                                                                           |
| 7   | `/notas`                   | 0/0 px            | 0/1               | 0       | sem passe; limpo                                                                                                             |
| 8   | `/pedidos`                 | 0/0 px            | 0/1               | 0       | passe #620: hierarquia da lista; overflow 0 nas 4 combinações                                                                |
| 9   | `/pedidos/[id]` · dinâmica | 0/0 px            | 0/1               | 0       | passe #620: h1 12→499px, ações no "Mais opções"; `scrollable-region-focusable` corrigido no `Table`                          |
| 10  | `/pedidos/imprimir`        | 0/0 px            | 0/1               | 0       | sem passe; limpo                                                                                                             |
| 11  | `/pedidos/novo`            | 0/0 px            | 0/1               | 0       | sem passe (docs 43/44); limpo                                                                                                |
| 12  | `/titulos`                 | — (redirect)      | —                 | —       | **é redirect** para `/financeiro` (medido lá): Select "Situação" sem nome acessível corrigido → `/financeiro`                |

### 2. Atendimento (inbox, contatos, funil, agenda) — 13 telas, 0 medidas

| #   | Tela                         | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
| --- | ---------------------------- | ----------------- | ----------------- | ------- | -------- |
| 1   | `/agenda`                    | —                 | —                 | —       | pendente |
| 2   | `/busca`                     | —                 | —                 | —       | pendente |
| 3   | `/campanhas`                 | —                 | —                 | —       | pendente |
| 4   | `/contacts`                  | —                 | —                 | —       | pendente |
| 5   | `/contacts/[id]` · dinâmica  | —                 | —                 | —       | pendente |
| 6   | `/inbox`                     | —                 | —                 | —       | pendente |
| 7   | `/inbox/[id]` · dinâmica     | —                 | —                 | —       | pendente |
| 8   | `/kanban`                    | —                 | —                 | —       | pendente |
| 9   | `/leads/[id]` · dinâmica     | —                 | —                 | —       | pendente |
| 10  | `/meu-dia`                   | —                 | —                 | —       | pendente |
| 11  | `/pipelines/[id]` · dinâmica | —                 | —                 | —       | pendente |
| 12  | `/tarefas`                   | —                 | —                 | —       | pendente |
| 13  | `/templates`                 | —                 | —                 | —       | pendente |

### 3. Fiscal — 13 telas, 0 medidas

| #   | Tela                            | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
| --- | ------------------------------- | ----------------- | ----------------- | ------- | -------- |
| 1   | `/fiscal`                       | —                 | —                 | —       | pendente |
| 2   | `/fiscal/configuracoes`         | —                 | —                 | —       | pendente |
| 3   | `/fiscal/eventos`               | —                 | —                 | —       | pendente |
| 4   | `/fiscal/fornecedores`          | —                 | —                 | —       | pendente |
| 5   | `/fiscal/manifestacoes`         | —                 | —                 | —       | pendente |
| 6   | `/fiscal/notas`                 | —                 | —                 | —       | pendente |
| 7   | `/fiscal/notas/[id]` · dinâmica | —                 | —                 | —       | pendente |
| 8   | `/fiscal/pendentes`             | —                 | —                 | —       | pendente |
| 9   | `/fiscal/produtos`              | —                 | —                 | —       | pendente |
| 10  | `/fiscal/relatorios`            | —                 | —                 | —       | pendente |
| 11  | `/fiscal/resumos`               | —                 | —                 | —       | pendente |
| 12  | `/fiscal/sincronizacoes`        | —                 | —                 | —       | pendente |
| 13  | `/fiscal/xml`                   | —                 | —                 | —       | pendente |

### 4. Expedição — 7 telas, 0 medidas

| #   | Tela                                    | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
| --- | --------------------------------------- | ----------------- | ----------------- | ------- | -------- |
| 1   | `/expedicao`                            | —                 | —                 | —       | pendente |
| 2   | `/expedicao/[id]` · dinâmica            | —                 | —                 | —       | pendente |
| 3   | `/expedicao/[id]/fechamento` · dinâmica | —                 | —                 | —       | pendente |
| 4   | `/expedicao/[id]/motorista` · dinâmica  | —                 | —                 | —       | pendente |
| 5   | `/expedicao/[id]/rota` · dinâmica       | —                 | —                 | —       | pendente |
| 6   | `/expedicao/nova`                       | —                 | —                 | —       | pendente |
| 7   | `/frota`                                | —                 | —                 | —       | pendente |

### 5. Financeiro e indicadores — 5 telas, 0 medidas

| #   | Tela           | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
| --- | -------------- | ----------------- | ----------------- | ------- | -------- |
| 1   | `/financeiro`  | —                 | —                 | —       | pendente |
| 2   | `/indicadores` | —                 | —                 | —       | pendente |
| 3   | `/laboratorio` | —                 | —                 | —       | pendente |
| 4   | `/metrics`     | —                 | —                 | —       | pendente |
| 5   | `/relatorios`  | —                 | —                 | —       | pendente |

### 6. Configuração, time e inteligência de mercado — 38 telas, 0 medidas

| #   | Tela                                    | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
| --- | --------------------------------------- | ----------------- | ----------------- | ------- | -------- |
| 1   | `/audit`                                | —                 | —                 | —       | pendente |
| 2   | `/connections`                          | —                 | —                 | —       | pendente |
| 3   | `/integrations/nuvemshop`               | —                 | —                 | —       | pendente |
| 4   | `/inteligencia`                         | —                 | —                 | —       | pendente |
| 5   | `/lgpd/requests`                        | —                 | —                 | —       | pendente |
| 6   | `/lgpd/requests/[id]` · dinâmica        | —                 | —                 | —       | pendente |
| 7   | `/products`                             | —                 | —                 | —       | pendente |
| 8   | `/prospeccao`                           | —                 | —                 | —       | pendente |
| 9   | `/prospeccao/campanhas/[id]` · dinâmica | —                 | —                 | —       | pendente |
| 10  | `/prospeccao/nova`                      | —                 | —                 | —       | pendente |
| 11  | `/radar`                                | —                 | —                 | —       | pendente |
| 12  | `/radar/categorias`                     | —                 | —                 | —       | pendente |
| 13  | `/radar/oportunidades`                  | —                 | —                 | —       | pendente |
| 14  | `/radar/prospeccao`                     | —                 | —                 | —       | pendente |
| 15  | `/radar/recuperacao`                    | —                 | —                 | —       | pendente |
| 16  | `/radar/risco`                          | —                 | —                 | —       | pendente |
| 17  | `/recuperacao`                          | —                 | —                 | —       | pendente |
| 18  | `/sentinel`                             | —                 | —                 | —       | pendente |
| 19  | `/settings`                             | —                 | —                 | —       | pendente |
| 20  | `/settings/api-tokens`                  | —                 | —                 | —       | pendente |
| 21  | `/settings/atendimento`                 | —                 | —                 | —       | pendente |
| 22  | `/settings/atualizacao`                 | —                 | —                 | —       | pendente |
| 23  | `/settings/billing`                     | —                 | —                 | —       | pendente |
| 24  | `/settings/canal-oficial`               | —                 | —                 | —       | pendente |
| 25  | `/settings/devices`                     | —                 | —                 | —       | pendente |
| 26  | `/settings/marca`                       | —                 | —                 | —       | pendente |
| 27  | `/settings/notifications`               | —                 | —                 | —       | pendente |
| 28  | `/settings/profile`                     | —                 | —                 | —       | pendente |
| 29  | `/settings/security`                    | —                 | —                 | —       | pendente |
| 30  | `/settings/templates`                   | —                 | —                 | —       | pendente |
| 31  | `/settings/tenant`                      | —                 | —                 | —       | pendente |
| 32  | `/settings/tenant/agenda`               | —                 | —                 | —       | pendente |
| 33  | `/settings/tenant/pipelines`            | —                 | —                 | —       | pendente |
| 34  | `/settings/tenant/whatsapp`             | —                 | —                 | —       | pendente |
| 35  | `/team`                                 | —                 | —                 | —       | pendente |
| 36  | `/team/invite`                          | —                 | —                 | —       | pendente |
| 37  | `/venda-automatica`                     | —                 | —                 | —       | pendente |
| 38  | `/webhooks`                             | —                 | —                 | —       | pendente |

### 7. IA (agentes, runs, conhecimento) — 22 telas, 0 medidas

| #   | Tela                                        | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
| --- | ------------------------------------------- | ----------------- | ----------------- | ------- | -------- |
| 1   | `/ai`                                       | —                 | —                 | —       | pendente |
| 2   | `/ai/agents`                                | —                 | —                 | —       | pendente |
| 3   | `/ai/agents/[id]` · dinâmica                | —                 | —                 | —       | pendente |
| 4   | `/ai/agents/new`                            | —                 | —                 | —       | pendente |
| 5   | `/ai/cases`                                 | —                 | —                 | —       | pendente |
| 6   | `/ai/controle`                              | —                 | —                 | —       | pendente |
| 7   | `/ai/credentials`                           | —                 | —                 | —       | pendente |
| 8   | `/ai/decisoes`                              | —                 | —                 | —       | pendente |
| 9   | `/ai/evolution`                             | —                 | —                 | —       | pendente |
| 10  | `/ai/followups`                             | —                 | —                 | —       | pendente |
| 11  | `/ai/followups/[id]` · dinâmica             | —                 | —                 | —       | pendente |
| 12  | `/ai/followups/enrollments/[id]` · dinâmica | —                 | —                 | —       | pendente |
| 13  | `/ai/inbox`                                 | —                 | —                 | —       | pendente |
| 14  | `/ai/knowledge/sources`                     | —                 | —                 | —       | pendente |
| 15  | `/ai/memory`                                | —                 | —                 | —       | pendente |
| 16  | `/ai/proposals`                             | —                 | —                 | —       | pendente |
| 17  | `/ai/providers`                             | —                 | —                 | —       | pendente |
| 18  | `/ai/routers`                               | —                 | —                 | —       | pendente |
| 19  | `/ai/routers/[id]` · dinâmica               | —                 | —                 | —       | pendente |
| 20  | `/ai/runs`                                  | —                 | —                 | —       | pendente |
| 21  | `/ai/skills`                                | —                 | —                 | —       | pendente |
| 22  | `/ai/usage`                                 | —                 | —                 | —       | pendente |

<!-- MATRIZ:FIM -->
