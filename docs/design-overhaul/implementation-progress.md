# NEXUS — Progresso da implementação

> Atualizado durante o trabalho, nunca só no final. Números = contagem real.
> Última atualização: 2026-10-16 (ciclo 2).

## Contadores

| métrica | valor | como medido |
|---|---|---|
| rotas identificadas | 129 | `find app -name page.tsx \| wc -l` |
| páginas auditadas (deep-dive) | 8 | §C do `page-by-page-audit.md` |
| páginas corrigidas (fatia aplicada) | 8 | ciclos 1–2 |
| páginas reconstruídas | 0 | T3 virou fatia (ver abaixo) |
| páginas mantidas com justificativa | 8 | redirects/resolvers/stubs + vitrine + TabsList |
| páginas bloqueadas | 0 | — |
| módulos concluídos | 0 de 9 | nenhum módulo 100% auditado+corrigido |
| módulos pendentes | 9 | comando/CRM, operação, inteligência, financeiro, IA, plataforma, admin, público/auth, sistema |

## Ciclo 1 (2026-10-15) — Dashboard T1

- Removida a seção duplicada `SalesRadar` do dashboard (mesmos 3 contadores do
  `ClientesParaAgir`; detalhe segue em `/app/radar`). Arquivos:
  `app/app/_home.tsx`, `app/app/_home-secoes.tsx`.
- 4 erros mudos ("Não foi possível carregar agora.") viraram `NexusErrorState`
  compacto com `role=alert` + retry (`refetch`): radar, fila, roadmap.
- Pendente do T1: colisão de rótulos do `CrmSalesChart` em 360px; `trend down`
  vermelho da "Meta do mês" para estado normal.

## Ciclo 2 (2026-10-16) — T2 a T8

- **T2 Meu Dia**: h1 estático ("Meu Dia", saudação virou subtítulo — fim do layout
  shift); escala visual de prioridade (`critica`→error, `alta`→warning,
  `normal`→neutral, `baixa` sem selo). Teste `meu-dia-linha-do-tempo` atualizado
  preservando a intenção (saudação do relógio, agora no subtítulo). Pendente:
  colapso dos blocos de alerta; timeline acima do contexto no mobile.
  Arquivo: `app/app/meu-dia/_components/MeuDiaClient.tsx`.
- **T3 Inbox (fatia)**: erro da lista virou `NexusErrorState` com retry; gatilho
  "Ficha" (Sheet) para a faixa `md–xl`, onde a 3ª coluna não existe e o gatilho
  morava na barra `md:hidden`. Verificado e MANTIDO com justificativa:
  `InboxFilters` (vocabulário próprio da fila, não divergência), `EmptyInbox`
  canônico, estados vazios da coluna de conversa. Arquivos:
  `components/inbox/ConversationList.tsx`, `components/inbox/InboxLayout.tsx`.
- **T4 Contatos**: detalhe e lista com `NexusErrorState`+retry e
  `NexusPageSkeleton`/`NexusTableSkeleton`; CTAs do header empilham no mobile;
  `ContactsTable` com `overflow-x-auto`. `tagOptions` segue derivado da página
  (endpoint de tags distintas não existe — **pendente-backend**, sem inventar API).
  `renderCard` mobile adiado (tabela tem bulk+sort; reescrita = risco). Arquivos:
  `app/app/contacts/_client.tsx`, `[id]/_client.tsx`, `components/contacts/ContactsTable.tsx`.
- **T5 Pedidos (consolidação)**: visão tabela usa `PillDoStatus` como os cartões
  (quadro agrupa por status — cabeçalho, correto); pills migradas para variantes
  do `Badge` (tokens dos dois temas; `bg-*-100` lavava no escuro). Verificado e
  MANTIDO: painel de filtros com rótulos (documentado no código),
  `details/summary` nativo (acessível), botões de impressão distintos
  (dia × lista/seleção), CSV com texto puro (correto). Arquivos:
  `app/app/pedidos/_pills.tsx`, `_client.tsx`.
- **T6 Radar**: deep-link por hash (clique grava `#secao`, abertura com hash rola —
  sem virar abas: 3 e2e leem sem clique); empty "sem base" exibe o critério
  (60 dias); faixas de inatividade via `Badge` (info/warning/error). Arquivos:
  `app/app/radar/_tabs.tsx`, `_components/RecuperacaoLista.tsx`.
- **T7 Financeiro**: `centavosDeBr()` canônico em `lib/format/moeda.ts` + teste
  (`lib/format/moeda.test.ts`, 5 casos); 5 `toLocaleDateString()` sem locale →
  `pt-BR`. KPIs sem trend seguem pendentes (comparativo real não existe —
  inventar dado é proibido). Arquivos: `lib/format/moeda*.ts`,
  `app/app/financeiro/_client.tsx`.
- **T8 Catálogo**: header artesanal → `NexusPageHeader`. Hipóteses refutadas por
  evidência: empty de viewer não sugere cadastrar (copy ok); lista é `ul`
  densa, não grid `sm:grid-cols-2`. Abas aninhadas seguem pendentes. Arquivo:
  `app/app/products/_catalogo.tsx`.

## Backlog restante

1. Fatias pendentes das 8 telas: colapso de alertas (T2), `renderCard` contatos (T4),
   abas aninhadas catálogo (T8), trends KPI financeiro (T7), endpoint de tags (backend).
2. Restante do inventário (121 rotas INVESTIGAR) — por módulo, com screenshot.

## Testes

Ver `qa-report.md`.
