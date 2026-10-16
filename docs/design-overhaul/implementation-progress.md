# NEXUS — Progresso da implementação

> Atualizado durante o trabalho, nunca só no final. Números = contagem real.
> Última atualização: 2026-10-15 (ciclo 1).

## Contadores

| métrica | valor | como medido |
|---|---|---|
| rotas identificadas | 129 | `find app -name page.tsx \| wc -l` |
| páginas auditadas (deep-dive) | 8 | §C do `page-by-page-audit.md` |
| páginas corrigidas | 1 | dashboard (T1) |
| páginas reconstruídas | 0 | — |
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

## Backlog priorizado (ordem de impacto)

1. Inbox T3 (RECONSTRUIR) — maior uso diário, zero DS.
2. Pedidos T5 (CONSOLIDAR) — 3 linguagens de status, filtros nativos.
3. Contatos T4 (REFINAR) — erro sem retry, header mobile, `renderCard`.
4. Radar T6 (REFINAR) — abas reais com deep-link, lazy.
5. Meu Dia T2 (REFINAR) — shift de header, colapso, escala de prioridade.
6. Catálogo T8 (REFINAR) — header canônico, abas aninhadas.
7. Financeiro T7 (REFINAR menor) — trend nos KPIs, parser BR, locale fixo.
8. Restante do inventário (121 rotas INVESTIGAR) — por módulo, com screenshot.

## Testes

Ver `qa-report.md`.
