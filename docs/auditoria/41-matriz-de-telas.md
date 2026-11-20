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

## Medido ≠ visitado

O `medidas.json` de cada lado tem `total`, `validas` e `invalidas` — e a linha
de uma tela que não abriu é `valida: false` com `motivo`, `overflow: null` e
`axe: null`. **Zero medido e zero não-medido são coisas diferentes**: até
20/11/2026 o instrumento gravava zero nas duas e o placar contava 6 rotas
dinâmicas que ninguém visitou como aprovadas. No artefato de 20/11: **368
linhas, 341 válidas, 27 não medidas** (24 das 6 dinâmicas sem id + 3 falhas de
instrumento em `/titulos`, `/ai/providers` e `/ai/runs`).

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

| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
|---|---|---|---|---|---|
| 1 | `/carteira` | 0/0 px | 0/1 | 0 | sério de contraste medido (claro, 390) |
| 2 | `/comissoes` | 0/0 px | 0/1 | 0 | sério de contraste medido (claro, 390) |
| 3 | `/compras` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 4 | `/compras/[id]` · dinâmica | 0/0 px | 0/1 | 0 | sério de contraste medido (claro, 390) |
| 5 | `/estoque` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 6 | `/faturamento` | 0/0 px | 0/1 | 0 | sério de contraste medido (claro, 390) |
| 7 | `/notas` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 8 | `/pedidos` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 9 | `/pedidos/[id]` · dinâmica | 0/0 px | 0/1 | 0 | sério de contraste medido (claro, 390) |
| 10 | `/pedidos/imprimir` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 11 | `/pedidos/novo` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 12 | `/titulos` | — (redirect) | — | — | **redirect → `/financeiro`, medido lá** — **3/4**: a combinação light/1440 perdeu o contexto no redirect e ficou fora |

### 2. Atendimento (inbox, contatos, funil, agenda) — 13 telas, 2 medidas

| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
|---|---|---|---|---|---|
| 1 | `/agenda` | — | — | — | pendente |
| 2 | `/busca` | — | — | — | pendente |
| 3 | `/campanhas` | — | — | — | pendente |
| 4 | `/contacts` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 5 | `/contacts/[id]` · dinâmica | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 6 | `/inbox` | — | — | — | pendente |
| 7 | `/inbox/[id]` · dinâmica | — | — | — | pendente |
| 8 | `/kanban` | — | — | — | pendente |
| 9 | `/leads/[id]` · dinâmica | — | — | — | pendente |
| 10 | `/meu-dia` | — | — | — | pendente |
| 11 | `/pipelines/[id]` · dinâmica | — | — | — | pendente |
| 12 | `/tarefas` | — | — | — | pendente |
| 13 | `/templates` | — | — | — | pendente |

### 3. Fiscal — 13 telas, 13 medidas

| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
|---|---|---|---|---|---|
| 1 | `/fiscal` | 0/0 px | 0/2 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 2 | `/fiscal/configuracoes` | 0/0 px | 0/2 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 3 | `/fiscal/eventos` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 4 | `/fiscal/fornecedores` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 5 | `/fiscal/manifestacoes` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 6 | `/fiscal/notas` | 0/0 px | 0/1 | 0 | **pílula da aba ativa corrigida** (`text-accent` → `text-accent-ink`: 3,63:1 no claro); limpo nas outras medidas |
| 7 | `/fiscal/notas/[id]` · dinâmica | — (pulada) | — | — | pulada: sem nota de exemplo no banco local — o banco de teste não tem linha em `fiscal_entradas` — a rota responde 404 para qualquer id |
| 8 | `/fiscal/pendentes` | 0/0 px | 0/2 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 9 | `/fiscal/produtos` | 0/0 px | 0/2 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 10 | `/fiscal/relatorios` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 11 | `/fiscal/resumos` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 12 | `/fiscal/sincronizacoes` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 13 | `/fiscal/xml` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0, só o seletor de empresa do shell) |

### 4. Expedição — 7 telas, 0 medidas

| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
|---|---|---|---|---|---|
| 1 | `/expedicao` | — | — | — | pendente |
| 2 | `/expedicao/[id]` · dinâmica | — | — | — | pendente |
| 3 | `/expedicao/[id]/fechamento` · dinâmica | — | — | — | pendente |
| 4 | `/expedicao/[id]/motorista` · dinâmica | — | — | — | pendente |
| 5 | `/expedicao/[id]/rota` · dinâmica | — | — | — | pendente |
| 6 | `/expedicao/nova` | — | — | — | pendente |
| 7 | `/frota` | — | — | — | pendente |

### 5. Financeiro e indicadores — 5 telas, 5 medidas

| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
|---|---|---|---|---|---|
| 1 | `/financeiro` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0) |
| 2 | `/indicadores` | 0/0 px | 0/1 | 0 | **dois críticos corrigidos**: as barras `role="progressbar"` sem nome (`aria-progressbar-name`) ganharam rótulo por contexto, e o gatilho de atendente ganhou `aria-label` (`button-name`). Depois: axe crítico 0, overflow 0, console 0 |
| 3 | `/laboratorio` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0) |
| 4 | `/metrics` | 0/0 px | 0/1 | 0 | **mesma tela** de `/indicadores` (h1 «Indicadores»): os dois críticos foram corrigidos lá. Depois: axe crítico 0 |
| 5 | `/relatorios` | 0/0 px | 0/1 | 0 | sem passe; limpo (overflow 0, console 0) |

### 6. Configuração, time e inteligência de mercado — 38 telas, 36 medidas

| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
|---|---|---|---|---|---|
| 1 | `/audit` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 2 | `/connections` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 3 | `/integrations/nuvemshop` | 0/0 px | 0/1 | 0 | redireciona para a home no estado atual (recurso desligado ou sem permissão) |
| 4 | `/inteligencia` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 5 | `/lgpd/requests` | 0/0 px | 0/1 | 0 | redireciona para a home no estado atual (recurso desligado ou sem permissão) |
| 6 | `/lgpd/requests/[id]` · dinâmica | — (não medida) | — | — | **pendente** — bloqueada: sem id de exemplo; no estado atual também redireciona para a home |
| 7 | `/products` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 8 | `/prospeccao` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 9 | `/prospeccao/campanhas/[id]` · dinâmica | — (não medida) | — | — | **pendente** — bloqueada: sem id de exemplo; no estado atual também redireciona para a home |
| 10 | `/prospeccao/nova` | 0/0 px | 0/2 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 11 | `/radar` | 0/0 px | 0/2 | 0 | `label-content-name-mismatch` em 2 botões de atalho (aria-label x texto visível) |
| 12 | `/radar/categorias` | 0/0 px | 0/1 | 0 | **corrigido**: `Tabs` sem painel (`aria-valid-attr-value`, CRÍTICO) → grupo com `aria-pressed` |
| 13 | `/radar/oportunidades` | 0/0 px | 0/2 | 0 | contraste medido: links em `text-primary` dentro do cartão (classe do V-54) |
| 14 | `/radar/prospeccao` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 15 | `/radar/recuperacao` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 16 | `/radar/risco` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 17 | `/recuperacao` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 18 | `/sentinel` | 0/0 px | 0/1 | **3** | console: 3 erros de aninhamento HTML inválido (`<%s>` dentro de `%s`) |
| 19 | `/settings` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 20 | `/settings/api-tokens` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 21 | `/settings/atendimento` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 22 | `/settings/atualizacao` | 0/0 px | 0/0 | 0 | 404 na rota — verificar se é feature flag ou caminho morto |
| 23 | `/settings/billing` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 24 | `/settings/canal-oficial` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 25 | `/settings/devices` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 26 | `/settings/marca` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 27 | `/settings/notifications` | 0/0 px | 0/2 | **1** | 1 erro de console medido |
| 28 | `/settings/profile` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 29 | `/settings/security` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 30 | `/settings/templates` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 31 | `/settings/tenant` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 32 | `/settings/tenant/agenda` | 0/0 px | 0/2 | 0 | contraste medido: texto mudo dentro de bloco `opacity-60` (11px/12px) |
| 33 | `/settings/tenant/pipelines` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 34 | `/settings/tenant/whatsapp` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 35 | `/team` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 36 | `/team/invite` | 0/0 px | 0/0 | 0 | 403 por papel: a rota exige admin e a medição usa `manager` (esperado) |
| 37 | `/venda-automatica` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |
| 38 | `/webhooks` | 0/0 px | 0/1 | 0 | sem passe; limpo (fora o seletor de empresa do shell) |

### 7. IA (agentes, runs, conhecimento) — 22 telas, 18 medidas

| # | Tela | Overflow 1440/390 | axe crítico/sério | Console | Veredito |
|---|---|---|---|---|---|
| 1 | `/ai` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 2 | `/ai/agents` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 3 | `/ai/agents/[id]` · dinâmica | — (não medida) | — | — | **pendente** — bloqueada: sem id de exemplo |
| 4 | `/ai/agents/new` | 0/0 px | 0/0 | 0 | **403 por papel**: rota exige admin e a medição usa `manager` (esperado) |
| 5 | `/ai/cases` | 0/0 px | 0/1 | 0 | limpo após o #716 |
| 6 | `/ai/controle` | 0/0 px | 0/2 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 7 | `/ai/credentials` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 8 | `/ai/decisoes` | 0/0 px | 0/1 | 0 | limpo após o #716 |
| 9 | `/ai/evolution` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 10 | `/ai/followups` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 11 | `/ai/followups/[id]` · dinâmica | — (não medida) | — | — | **pendente** — bloqueada: sem id de exemplo |
| 12 | `/ai/followups/enrollments/[id]` · dinâmica | — (não medida) | — | — | **pendente** — bloqueada: sem id de exemplo |
| 13 | `/ai/inbox` | 0/0 px | 0/1 | 0 | limpo após o #716 (a aba fantasma era o crítico desta tela) |
| 14 | `/ai/knowledge/sources` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 15 | `/ai/memory` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 16 | `/ai/proposals` | 0/0 px | 0/1 | 0 | limpo após o #716 |
| 17 | `/ai/providers` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) — **3/4**: a combinação light/1440 não pintou `<h1>` e ficou fora |
| 18 | `/ai/routers` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) |
| 19 | `/ai/routers/[id]` · dinâmica | — (não medida) | — | — | **pendente** — bloqueada: sem id de exemplo |
| 20 | `/ai/runs` | 0/0 px | 0/1 | 0 | sem passe nesta rodada; limpo (overflow 0, console 0, só o seletor de empresa do shell) — **3/4**: a combinação light/1440 não pintou `<h1>` e ficou fora |
| 21 | `/ai/skills` | 0/0 px | 0/1 | 0 | **corrigido**: aviso informativo em `text-text-muted` sobre `accent-soft` não passava AA no escuro (`color-contrast`) → `text-text` |
| 22 | `/ai/usage` | 0/0 px | 0/1 | 0 | **corrigido**: barra `role="progressbar"` sem nome no cartão de orçamento (`aria-progressbar-name`) → `aria-label`; depois, axe sério 0 fora o shell |

<!-- MATRIZ:FIM -->
