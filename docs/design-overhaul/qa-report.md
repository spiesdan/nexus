# NEXUS — Relatório de QA (visual + funcional)

> Última atualização: 2026-10-15 (ciclo 1).

## Ciclo 1 — Dashboard T1

- Verificação estática: `grep SalesRadar|Não foi possível carregar agora` pós-edição
  = zero ocorrências em código (só menções nos docs da auditoria). `contarPorGrupo`
  e `useRadarDoDashboard` seguem em uso pelo `ClientesParaAgir`.
- `pnpm eslint app/app/_home.tsx app/app/_home-secoes.tsx`: limpo.
- `pnpm typecheck` (`tsc --noEmit`): limpo.
- Unit relevantes: `dashboard-contrato`, `dashboard-inteligencia`, `dashboard-mensal`,
  `risk-radar` — **48 passed** (2026-10-15).
- E2E: não rodado neste ciclo (mudança isolada de composição dashboard, sem
  alteração de contrato/API/persistência — estratégia proporcional §14).
- Falhas preexistentes: nenhuma escondida; `git status` já tinha modificações
  do usuário em `lib/agent-engine/*`, `lib/mcp/*`, `loop/checkpoints/*` —
  **não incluídas nem tocadas**.
- Responsividade (1920→390), temas claro/escuro, screenshots Playwright do
  dashboard antes/depois: **pendentes** (exigência de aceite T1 em aberto).

## Verificado sem mudança (evidência para MANTER)

- `components/ui/tabs.tsx:62` — `TabsList` com `max-w-full overflow-x-auto`
  (risco "6 abas estouram no mobile" do Financeiro já resolvido na classe).
- Zero `<table>` crua em páginas de produto; zero hex real em `page.tsx`.

## Pendente geral (Fase F)

Screenshots por tela relevante (inicial, acima/abaixo da dobra, filtros/menus
abertos, interação principal), comparação 7 larguras, claro+escuro, testes de
interação nos fluxos críticos, suíte E2E de escopo no fechamento.
