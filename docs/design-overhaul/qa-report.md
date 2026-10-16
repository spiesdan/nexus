# NEXUS — Relatório de QA (visual + funcional)

> Última atualização: 2026-10-16 (final — `gov:verify` verde).

## Fase F visual — 70 capturas (10 rotas × 7 larguras × 2 temas)

Evidência: `evidence/auditoria/` (74 PNGs, app real + banco do baseline + seeds).
A spec de capturas foi removida após cumprir sua função (para não crescer o
`FORA_DO_CI` permanentemente com uma spec sem asserção); recupera-se via
`git show 5aa11bc64:tests/e2e/auditoria-capturas.spec.ts`.
Achados que viraram código no ciclo 5:
- Eixo X do `CrmSalesChart`: 31 rótulos colidiam em ≤1280 → desbaste (~8 marcos
  + último + hoje; hover dia-a-dia intacto, 19 unit verdes).
- Fio do inbox sem largura máxima em 1920 → `max-w-3xl` centralizado.
- `CartaoKpi` truncava "R$ 2.6…" em 768 → `text-xl` responsivo + `title`.
Refutados por pixel (correções honestas à auditoria estática):
- Inbox 3-colunas OK em 1280; abas aninhadas do catálogo legíveis; empty do
  estoque exemplar; financeiro é o modelo do DS nos dois temas.
- `mm/dd/yyyy` nos date inputs = locale do browser de teste (`lang="pt-BR"`
  setado em `app/layout.tsx:285`); tagIdioma força `dd/mm/aaaa` nos textos.
- Tooltip "Precisa de ajuda?" é transitório (uma vez); bolha segue convenção
  flutuante (posicionada p/ dock/print) — regra: ações primárias fora do canto
  inferior-direito.
- Fio aberto em 1920 (`dark-1920-thread-aberto.png`, conversa do seed de
  escalação): header operacional completo (status, responsável, 5 ações),
  composer com Responder/Nota interna, painel CRM rico (tags rápidas, demandas,
  leads, pedidos, compras, produtos, títulos). Composição aprovada nos pixels.
- Mobile 390/430: CTAs empilham, tabs rolam, tabelas com scroll, dock correto.
Falhas do run: 9 + 2 + 1 capturas falharam por timeout sob carga paralela e
passaram no retry serial — flakiness de ambiente, não bug (páginas renderizam
nas mesmas larguras em outras passagens).

## Final — verificação completa da sessão

- `pnpm gov:verify`: **808 arquivos, 8540 passed + 1 expected fail.**
- `pnpm build`: **verde** (Next 16, todas as rotas).
- E2E smoke (a suíte do CI em PR: smoke, auth, navegacao, error-pages,
  contato-salva-email, risk-radar, jornada-venda, inbox-scope):
  **32 passed em 6.2 min**, contra app buildado + banco do `baseline.sql`.
- Visual: 70 capturas (10 rotas × 7 larguras × 2 temas) + antes/depois do eixo
  + fio aberto em 1920 — tudo em `evidence/auditoria/`.

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
