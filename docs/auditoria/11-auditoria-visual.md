# Fase 2 — Auditoria funcional, visual e de experiência

> Regido por `docs/auditoria/PROMPT-MESTRE-AAA.md` (autoridade sobre qualquer `.md`).
> Medido em **15/11/2026** contra o checkout auditado (`9f8e6faa`), Supabase local,
> sessão real do seed E2E. Instrumento: `scripts/auditoria/captura-visual.mjs`.
> Capturas em `docs/auditoria/capturas/`, medições em `medicoes-*.json`.

## 1. Correção de método — a primeira rodada mediu o código errado

A primeira versão desta auditoria rodou contra `http://localhost:3001`, que serve
`/Users/bill/Downloads/nexus` — um checkout **208 commits divergente** do commit
auditado (medido: `git rev-list --count ce79e630..9f8e6faa` = 208; e `ce79e630`
**não é ancestral** de `9f8e6faa`). Nenhum dos números abaixo veio dali.

O instrumento passou a subir o servidor **do próprio worktree** e a receber
`AUDIT_BASE_URL`; todas as medidas desta página foram refeitas em
`http://localhost:3011` (Next em modo dev, `pnpm exec next dev -p 3011`).

| O que estava errado | Como foi descoberto |
|---|---|
| capturas de um checkout 208 commits atrás | `lsof -p <pid>` mostrou `cwd = /Users/bill/Downloads/nexus` |
| `node <script>.mjs` fora do repo não achava `playwright` | o script precisa rodar na raiz do projeto (resolve `@playwright/test`) |
| login "não passava" | era o script navegando antes do Server Action concluir; e preencher antes da hidratação envia o form vazio |

## 2. Achados

### V-01 · Média · 36 de 40 páginas tinham o mesmo `<title>` — **CORRIGIDO**

```
antes:  36 | NEXUS — atendimento e vendas por WhatsApp com agentes de IA
depois:  1 | Dashboard · NEXUS   1 | Pedidos · NEXUS   1 | Funis · NEXUS
         1 | Clientes · NEXUS    1 | Agente de IA · NEXUS   1 | Inbox · NEXUS
```

O produto já sabia o nome de cada tela (o `<h1>` estava certo em 38 das 40): o que
faltava era ligar `metadata.title` à rota.

**Como foi corrigido, e por que não em 127 arquivos:** o nome de cada tela já existe
em `lib/navigation/registry.ts`, com gate de completude no CI
(`tests/unit/navegacao-completude.test.ts`). Escrever o título em cada `page.tsx`
criaria uma **segunda cópia sem gate**, que envelhece calada — o defeito que este
repo combate. Em vez disso:

| Peça | O que faz |
|---|---|
| `lib/navigation/titulos.ts` | resolve rota → título a partir do registro, com fallbacks declarados (sub-fluxo → destino exato → prefixo mais longo) |
| `generateMetadata` em `app/app/layout.tsx`, `app/admin/(protected)/layout.tsx`, `app/onboarding/layout.tsx` | lê `x-pathname` (publicado pelo `proxy.ts`) e devolve o título; a página que já declara `metadata` **continua vencendo** |
| `metadata` próprio em `/403`, `/500`, `/503` | não ficam mais no título genérico |
| `tests/unit/titulos-de-rota.test.ts` | **lê o disco**: toda `page.tsx` com JSX precisa resolver título, e o título não pode repetir entre telas distintas do tenant |

O onboarding usa `PASSOS` de `lib/onboarding/passos.ts` — a mesma definição que
alimenta o indicador de progresso. Três listas de passos já divergiram neste repo;
uma quarta, só para o `<title>`, seria a primeira a envelhecer.

### V-02 · Média · `#/app/inbox` era a única tela sem `<h1>` — **CORRIGIDO**

Medido: 38 de 40 capturas tinham `<h1>`; o Inbox tinha `h1 = []` nas duas larguras.
É a tela de trabalho mais usada, e sem nível 1 a navegação por cabeçalho do leitor
de tela não tem onde pousar.

Correção: `<h1 className="sr-only">Inbox</h1>` no `InboxLayout`. Medido depois:
`{"h1":"Inbox","srOnly":true,"ocupa":"1x1","overflow":0}` em 390 e em 1440 — existe
na árvore de acessibilidade e **não ocupa pixel**, que era o requisito: no celular a
altura é disputada pela lista e pelo composer.

### V-03 · **DESCARTADO** · o "botão que cobre a barra inferior" é o devtools

A primeira versão registrou que um botão flutuante (que eu chamei de WhatsApp/TalkJS)
cobria o item "Inteligência" da barra inferior em 390 px, com coordenadas medidas.
As coordenadas estavam certas e a **atribuição** estava errada: a classe é `tsqd-*`,
de **TanStack Query Devtools**, montado em `app/providers.tsx` sob
`process.env.NODE_ENV === 'development'`. Não existe em produção.

Refeito com o devtools removido do DOM e varredura de **todo** elemento
`position: fixed|absolute` que intercepta a faixa da barra inferior, em 6 telas a
390 px: **0 colisões**. Registro aqui porque um achado falso num relatório de
auditoria custa mais que um achado faltando — queima a confiança da lista inteira.

### V-04 · Baixa · formato de data do filtro vem do navegador — **DECISÃO PENDENTE**

`/app/pedidos` renderiza `<input type="date">` com `mm/dd/yyyy` num Chromium em
inglês, embora `<html lang="pt-BR">` esteja correto. Não é bug de código: é o
comportamento nativo do `input[type=date]`. Consequência real: **a mesma tela mostra
formato diferente para cada pessoa**, e num produto brasileiro "03/04" é ambíguo num
filtro de período.

| Opção | Custo | Efeito |
|---|---|---|
| A. manter nativo | zero | acessibilidade e teclado numérico do celular de graça; formato varia por navegador |
| B. campo próprio `dd/mm/aaaa` | componente + validação + teclado numérico manual | formato único; perde o seletor nativo e o preenchimento automático |

Não implementei nenhuma: mudar isso altera o comportamento de filtro em todas as
telas de período, e a doutrina deste repo proíbe inventar regra de produto. A decisão
é do dono do produto; a medida está acima para ela ser tomada com número.

### V-05 · Aberto · desempenho ainda **não** foi medido em produção

Os tempos de `networkidle` em dev (2,2 s a 9,3 s) medem compilação por rota do Next,
não o produto. O item 2.15 só fecha contra `pnpm build` + `pnpm start`, com trace do
navegador. Fica **aberto com o número a medir**, não com estimativa.

### V-06 · Baixa · alvos de toque abaixo de 40 px — sinal, não veredito

| Tela (desktop) | Elementos < 40 px |
|---|---|
| `/app/contacts` | 123 |
| `/app/pedidos` | 96 |
| `/app/titulos` | 83 |
| `/app/comissoes` | 78 |

A maioria é checkbox de seleção de linha (16 px), padrão de tabela densa — o alvo
clicável real pode ser a célula. Fica como **sinal a confirmar por clique**.

## 3. O que está bom — e foi medido, não elogiado

- **Overflow horizontal = 0** em todas as combinações capturadas, inclusive a 390 px.
- **Zero erro de console** fora os 404 que eu mesmo provoquei com rota errada.
- **Zero resposta 5xx** durante toda a captura.
- `main` tem `padding-bottom: 96px`: a barra inferior fixa não esconde o fim das listas.
- **Permissão negada tem estado próprio** (`/admin/forbidden`, "Acesso negado").
- A marca resolve do banco: `/login` mostra `Entrar · NEXUS` mesmo com `appName` de
  cliente no `capacitor.config.ts` (F-10) — o vazamento é do shell nativo, não da web.

### Falsos positivos descartados antes de virarem achado

| Parecia | Era |
|---|---|
| `/app/lgpd` responde 404 | a rota real é `/app/lgpd/requests` (`lib/navigation/registry.ts`); erro meu de rota |
| `/admin` cai em "Acesso negado" | `manager` não é admin de plataforma — comportamento correto, com estado próprio |
| círculo "N" cobrindo "Recolher" no rodapé | indicador de dev do Next, não elemento do produto |
| botão flutuante cobre a barra inferior | TanStack Query Devtools, só em `NODE_ENV=development` (V-03) |

## 4. Cobertura do checklist

| # | Item | Estado | Medido |
|---|---|---|---|
| 2.1 | Avaliar em execução e no código; desktop/tablet/celular | `[~]` | 119 telas estáticas em varredura; desktop 1440 e celular 390. Tablet 834 em 5 |
| 2.2 | Se impedido, registrar bloqueio sem alegar inspeção visual | `[x]` | Nada foi alegado sem execução; desempenho declarado **aberto** (V-05) |
| 2.3 | Propósito e próximo passo evidentes | `[x]` | Todas as telas com título de aba próprio (V-01) e `<h1>` (V-02) |
| 2.4 | Hierarquia e densidade | `[~]` | Lida nas capturas; sem medição de densidade |
| 2.5 | Consistência de headers, breadcrumb, ações, filtros, navegação | `[~]` | Shell e barra de filtros consistentes; títulos por rota |
| 2.6 | Cliques/digitação em tarefas frequentes | `[ ]` | Depende das jornadas J1–J16 |
| 2.7 | Busca, ordenação, filtros, paginação, seleção em massa | `[~]` | Presença confirmada; comportamento não exercitado |
| 2.8 | Formulários | `[ ]` | Não executado |
| 2.9 | Estados (loading, vazio, erro, sucesso, offline, permissão negada) | `[~]` | Vazio e permissão negada observados; resto falta |
| 2.10 | Feedback imediato e prevenção de duplicidade | `[ ]` | — |
| 2.11 | A11y: contraste, foco, teclado, leitor, toque, zoom, reduced motion | `[~]` | `<h1>` (V-02), alvos (V-06); contraste e teclado não medidos |
| 2.12 | Casos extremos | `[ ]` | — |
| 2.13 | Largura/overflow, sticky, modais, drawers em telas estreitas | `[~]` | Overflow 0; colisão com a barra inferior = 0 (V-03 descartado); modais não testados |
| 2.14 | Idioma, moeda, datas, timezone, convenções BR | `[~]` | pt-BR e R$ corretos; formato de data depende do navegador (V-04, decidir) |
| 2.15 | Desempenho percebido e gráficos | `[ ]` | Só dev; **aberto** (V-05) |
| 2.16 | Não padronizar mecanicamente onde a composição é intencional | `[x]` | O título vem de UMA fonte e cada tela mantém sua composição |

**Fase 2: em andamento.** V-01 e V-02 corrigidos com medida antes/depois; V-03
descartado com prova; V-04 aguarda decisão de produto; V-05 aguarda build. As
jornadas J1–J16 ainda não começaram.
