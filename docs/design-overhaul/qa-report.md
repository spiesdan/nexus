# NEXUS — Relatório de QA (visual + funcional)

> Última atualização: 2026-10-16 (final — `gov:verify` verde).

## Final — `pnpm gov:verify` (typecheck + lint + test:unit)

- **808 arquivos, 8540 passed + 1 expected fail. Zero falha.**
- No caminho: o gate `i18n-a-data-segue-o-idioma` reprovou 1 ponto do ciclo 3
  (`toLocaleDateString("pt-BR")` fixo no financeiro) — corrigido para o
  `tagIdioma` do hook (`useTagDeIdioma`), que é a regra do produto.
- E2E (88 specs no CI) e screenshots multi-largura/tema: não rodados nesta
  sessão — pendência declarada da Fase F (exige app rodando + banco semeado;
  ver `docs/harness-audit.md`). Nenhuma mudança desta sessão altera
  contrato/API/persistência/RLS; risco E2E avaliado como baixo por construção.
- `pnpm build`: **verde** (Next 16, todas as rotas compilam — item 15 do aceite).

## Ciclo 3 — lote IA/operação/settings/admin (ver `implementation-progress.md`)

- `pnpm eslint` nos 30 arquivos tocados: limpo (1 warning pré-existente em
  TemplateFormDialog, fora do escopo — init de dialog em efeito).
- `pnpm typecheck` (`tsc --noEmit`): limpo.
- Unit: kanban (7) + moeda (5) + meu-dia (6) = 18 no ciclo; acumulado 98.
- Nenhum teste precisou mudar neste ciclo (headers novos preservam copy/testids;
  e2e de abas/agenda/tipos verificados por leitura — não rodados).
- E2E e screenshots multi-largura/tema seguem pendentes (Fase F final).

## Ciclo 2 — T2 a T8 (fatia por tela, ver `implementation-progress.md`)

- Verificação estática: zero `SalesRadar` / "Não foi possível carregar agora." em
  código; `ROTULO_DO_STATUS` segue usado no CSV (texto puro, correto) e no quadro
  (cabeçalho de coluna, correto).
- `pnpm eslint` nos 14 arquivos tocados: limpo (1 warning corrigido no ato).
- `pnpm typecheck` (`tsc --noEmit`): limpo.
- Unit: `moeda` (novo, 5 casos) + dashboard (48) + `meu-dia-linha-do-tempo` +
  `citada-apagada-e-tela-em-branco` + `inbox-aba-minhas-sem-fechadas` —
  **80 passed** no total do ciclo.
- 1 teste atualizado com intenção preservada: `meu-dia-linha-do-tempo` (h1 estático
  "Meu Dia"; saudação do relógio agora no subtítulo — T2).
- E2E: não rodado (fatias isoladas de composição/estados, sem contrato/API —
  estratégia proporcional §14). Exceção consciente: `_tabs.tsx` com hash —
  conteúdo segue todo renderizado, os 3 e2e de radar não quebram por construção.

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
