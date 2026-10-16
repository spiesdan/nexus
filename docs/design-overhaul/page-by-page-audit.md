# NEXUS — Auditoria visual page by page (Fase 1+2)

> Gerado em 2026-10-15, branch `main` @ `3840b5ab6`, medição direta do código.
> Fonte: `find app -name page.tsx` = **129 rotas**. Classificação honesta:
> só as 8 telas da §C têm decisão baseada em leitura de componente;
> o restante é `INVESTIGAR` (aguarda inspeção, com ou sem screenshot).
> Referência anterior: `docs/nexus-v2/redesign-inventory.md` (142 itens na
> branch `nexus-v2` — contagem e branch diferentes; usado como pista, não como verdade).

## A. Método e sinais globais (medidos, não estimados)

- `NexusPageHeader` em `page.tsx`: **8/129 (6%)**.
- `<h1` manual em `page.tsx`: **41/129 (32%)**. ~80 rotas não têm nem um nem outro
  (client components, redirects, resolvers, login/legal).
- `NexusDataTable`: 7 arquivos via `_client` (`compras`, `comissoes`, `carteira`,
  `financeiro` ×2, `faturamento`, `estoque`). Zero `<table>` crua em página de produto.
- `NexusKpi`: via `_home`, `financeiro/_client`, `ai/usage`, `ai/evolution`.
- Hex literal em `page.tsx`: zero (2 falsos-positivos em comentário). Hex no resto de
  `app/**` + `components/**`: 27 arquivos, quase todos showcase/mapa/bolha — não CRUD.
- Shell: `app/app/_components/AppShell.tsx:17` + `app/app/layout.tsx:180-184`;
  `components/shell/*` com 15 peças; `components/ui/tabs.tsx:62` já tem
  `max-w-full overflow-x-auto` na classe (mobile de abas resolvido globalmente).
- Tokens: `app/globals.css` (1102 linhas, dark-first, accent funcional 600 `#7e77f0`);
  `lib/theme.tsx` default `dark`; `DESIGN.md` = referência de estilo (Visitors).
- `loading/error`: 6 `loading.tsx` + 3 `error.tsx` sob `app/app/**` para ~74 rotas —
  maioria das telas resolve estados dentro do client (qualidade varia — ver §C).

## B. Inventário — 129 rotas

Legenda: `MANTER` atende ao padrão · `REFINAR` ajustes pontuais · `RECONSTRUIR`
composição/fluxo muda · `CONSOLIDAR` unificar duplicados · `INVESTIGAR` sem evidência.

### Público / auth / onboarding / legal / sistema (26)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/` | `app/page.tsx` | INVESTIGAR | marketing raiz |
| `/login` | `app/(public)/login/page.tsx` | INVESTIGAR | h1 manual |
| `/login/forgot` | `app/(public)/login/forgot/page.tsx` | INVESTIGAR | |
| `/login/mfa` | `app/(public)/login/mfa/page.tsx` | INVESTIGAR | |
| `/login/recovery` | `app/(public)/login/recovery/page.tsx` | INVESTIGAR | |
| `/login/reset` | `app/(public)/login/reset/page.tsx` | INVESTIGAR | |
| `/signup` | `app/(public)/signup/page.tsx` | INVESTIGAR | h1 manual |
| `/403`, `/500`, `/503` | `app/403\|500\|503/page.tsx` | INVESTIGAR | fundidas em `StatusPage` (nexus-ui) — checar copy |
| `/account-suspended` | `app/account-suspended/page.tsx` | INVESTIGAR | idem |
| `/admin/forbidden` | `app/admin/forbidden/page.tsx` | INVESTIGAR | |
| `/team/accept-invite/[token]` | `app/team/accept-invite/[token]/page.tsx` | INVESTIGAR | h1 manual |
| `/legal/privacy`, `/legal/terms` | `app/legal/*/page.tsx` | INVESTIGAR | h1 manual |
| `/onboarding` (+8 sub) | `app/onboarding/**/page.tsx` | INVESTIGAR | welcome, funil, connect-*, setup-ai, testar, done |
| `/design` | `app/design/page.tsx` | MANTER | vitrine de tokens, não produto |
| `/vitrine-agenda` | `app/vitrine-agenda/page.tsx` | INVESTIGAR | vitrine |

### Tenant — comando e CRM (14)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/app` (Dashboard) | `app/app/page.tsx` + `_home.tsx` + `_home-secoes.tsx` | REFINAR | §C-T1. Dedupe `SalesRadar` + erros com retry — **aplicado em 2026-10-15** |
| `/app/meu-dia` | `app/app/meu-dia/page.tsx` + `_components/MeuDiaClient.tsx` | REFINAR | §C-T2 — fatia aplicada (ciclo 2) |
| `/app/inbox` | `app/app/inbox/page.tsx` (`InboxLayout`) | RECONSTRUIR | §C-T3 — fatia aplicada (ciclo 2) |
| `/app/inbox/[id]` | resolver (push) | MANTER | não é UI |
| `/app/contacts` | `app/app/contacts/page.tsx` + `_client.tsx` | REFINAR | §C-T4 — fatia aplicada (ciclo 2) |
| `/app/contacts/[id]` | `app/app/contacts/[id]/page.tsx` + `_client.tsx` | REFINAR | §C-T4 — fatia aplicada (ciclo 2) |
| `/app/leads/[id]` | resolver (permalinks) | MANTER | não é UI |
| `/app/busca` | `app/app/busca/page.tsx` | INVESTIGAR | |
| `/app/carteira` | `app/app/carteira/page.tsx` | INVESTIGAR | header+DataTable+empty (sinal positivo) |
| `/app/kanban` | `app/app/kanban/page.tsx` | CONSOLIDAR | lista de funis; duplica `settings/tenant/pipelines` — decidir sem quebrar links |
| `/app/pipelines/[id]` | `app/app/pipelines/[id]/page.tsx` | INVESTIGAR | |
| `/app/tarefas` | `app/tarefas` (sem `page.tsx` próprio? checar) | INVESTIGAR | consta no REFATORAR do inventário v2 |
| `/app/agenda` | `app/app/agenda/page.tsx` | INVESTIGAR | tem `loading+error.tsx` (sinal positivo) |
| `/app/venda-automatica` | `app/app/venda-automatica/page.tsx` | INVESTIGAR | rota nova pós-inventário v2 |

### Tenant — operação comercial (14)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/app/pedidos` | `app/app/pedidos/page.tsx` + `_client.tsx` | CONSOLIDAR | §C-T5 — fatia aplicada (ciclo 2) |
| `/app/pedidos/novo` | `app/app/pedidos/novo/page.tsx` + `_editor.tsx` | REFINAR | §C-T5 — wizard ok, barra mobile |
| `/app/pedidos/[id]` | detalhe | REFINAR | §C-T5 — fatia aplicada (ciclo 2) |
| `/app/pedidos/imprimir` | `app/app/pedidos/imprimir/page.tsx` | INVESTIGAR | impressão (table crua justificável) |
| `/app/products` | `app/app/products/page.tsx` + `_catalogo.tsx` | REFINAR | §C-T8 — fatia aplicada (ciclo 2) |
| `/app/estoque` | `app/app/estoque/page.tsx` + `_client.tsx` | INVESTIGAR | header+3×DataTable (sinal positivo) |
| `/app/compras` | `app/app/compras/page.tsx` | INVESTIGAR | sinal positivo |
| `/app/compras/[id]` | `app/app/compras/[id]/page.tsx` | INVESTIGAR | sinal positivo |
| `/app/expedicao` | `app/app/expedicao/page.tsx` | INVESTIGAR | header+empty+estados (positivo) |
| `/app/expedicao/[id]` | `app/app/expedicao/[id]/page.tsx` | INVESTIGAR | mapa próprio (`_mapa-rota`) |
| `/app/faturamento` | `app/app/faturamento/page.tsx` | INVESTIGAR | header+DataTable (positivo) |
| `/app/notas` | `app/app/notas/page.tsx` | INVESTIGAR | header nexus; 4 `Table` shadcn fora do DataTable |
| `/app/comissoes` | `app/app/comissoes/page.tsx` | INVESTIGAR | header+DataTable (positivo) |
| `/app/prospeccao` | `app/app/prospeccao/page.tsx` | INVESTIGAR | mapa próprio (`_mapa`) |

### Tenant — inteligência comercial (5)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/app/radar` | `app/app/radar/page.tsx` + `_tabs.tsx` | REFINAR | §C-T6 — fatia aplicada (ciclo 2) |
| `/app/recuperacao` | redirect → `/radar#recuperacao` | MANTER | fusão documentada, redirect com âncora |
| `/app/relatorios` | `app/app/relatorios/page.tsx` | INVESTIGAR | |
| `/app/indicadores` | `app/app/indicadores/page.tsx` | INVESTIGAR | `/metrics` redireciona p/ cá |
| `/app/metrics` | redirect → `/indicadores#desempenho` | MANTER | fusão documentada |
| `/app/inteligencia` | `app/app/inteligencia/page.tsx` | INVESTIGAR | `NexusIntelligence`+loading/error (positivo); pendência `CrmPageHeader` |
| `/app/laboratorio` | `app/app/laboratorio/page.tsx` | INVESTIGAR | h1 manual |

### Tenant — financeiro (3)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/app/financeiro` | `app/app/financeiro/page.tsx` + `_client.tsx` | REFINAR | §C-T7 — modelo do DS; pendente: KPIs sem trend, parse de valor, locale de data |
| `/app/titulos` | redirect → `/financeiro?aba=titulos` | MANTER | decisão do usuário documentada |
| (abas) | `_titulos.tsx` + 6 `TabsContent` | MANTER | TabsList mobile já resolvido na classe |

### Tenant — IA e agentes (19)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/app/ai` (hub) | `app/app/ai/page.tsx` | INVESTIGAR | h1 manual |
| `/app/ai/agents` | lista + `[id]` + `new` | INVESTIGAR | h1 manual; detalhe tem 6 abas (caso que motivou o fix da TabsList) |
| `/app/ai/inbox` | `app/app/ai/inbox/page.tsx` | INVESTIGAR | relação com `/app/inbox` por esclarecer |
| `/app/ai/routers` (+`[id]`) | | INVESTIGAR | |
| `/app/ai/runs` | | INVESTIGAR | |
| `/app/ai/cases` | | INVESTIGAR | |
| `/app/ai/controle` | | INVESTIGAR | |
| `/app/ai/decisoes` | | INVESTIGAR | `DecisoesList` nexus-ui (positivo) |
| `/app/ai/proposals` | | INVESTIGAR | `ProposalsList` nexus-ui (positivo) |
| `/app/ai/followups` (+`[id]`, `enrollments/[id]`) | | INVESTIGAR | fila consumida pelo dashboard |
| `/app/ai/knowledge/sources` | | INVESTIGAR | |
| `/app/ai/memory` | | INVESTIGAR | |
| `/app/ai/skills` | | INVESTIGAR | |
| `/app/ai/credentials` | | INVESTIGAR | h1 manual |
| `/app/ai/providers` | | INVESTIGAR | |
| `/app/ai/usage` | | INVESTIGAR | `NexusKpi` (positivo) |
| `/app/ai/evolution` | | INVESTIGAR | `NexusKpi` (positivo) |

### Tenant — plataforma, equipe e LGPD (17)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/app/connections` | `app/app/connections/page.tsx` | INVESTIGAR | h1 manual; destino dos stubs whatsapp/canal-oficial |
| `/app/settings` (hub) | `app/app/settings/page.tsx` | INVESTIGAR | 10 sub-rotas com h1 manual |
| `/app/settings/*` | api-tokens, atendimento, atualizacao, billing, marca, notifications, profile, security, templates | INVESTIGAR | `marca/_form.tsx` tem hex (legítimo: editor de marca) |
| `/app/settings/tenant` (+agenda, +pipelines) | | INVESTIGAR | pipelines usa `NexusPageHeader` (positivo) |
| `/app/settings/tenant/whatsapp`, `/settings/canal-oficial`, `/settings/templates` | stubs redirect | MANTER | só saem com decisão sobre links salvos |
| `/app/team` (+invite) | | INVESTIGAR | h1 manual |
| `/app/audit` | tem `loading.tsx` | INVESTIGAR | |
| `/app/lgpd/requests` (+`[id]`) | | INVESTIGAR | h1 manual |
| `/app/integrations/nuvemshop` | usa `NexusPageHeader` | INVESTIGAR | sinal positivo |
| `/app/webhooks` | usa `NexusPageHeader` | INVESTIGAR | sinal positivo |

### Admin global (20)

| rota | arquivo | decisão | nota |
|---|---|---|---|
| `/admin/(protected)` hub | `app/admin/(protected)/page.tsx` | INVESTIGAR | |
| `/admin/(protected)/dashboard` | `KPICards` | INVESTIGAR | |
| `/admin/(protected)/tenants` (+new, +`[id]`, +`[id]/health`) | | INVESTIGAR | |
| `/admin/(protected)/users` (+`[id]`) | | INVESTIGAR | |
| `/admin/(protected)/audit` (+`[entryId]`) | | INVESTIGAR | |
| `/admin/(protected)/incidents` (+`[id]`) | | INVESTIGAR | |
| `/admin/(protected)/inbox` (+`[conversationId]`) | | INVESTIGAR | espelho do inbox tenant — unificar vocabulário quando o tenant for reconstruído |
| `/admin/(protected)/lgpd` (+requests/`[id]`) | | INVESTIGAR | |
| `/admin/(protected)/marca` | usa `NexusPageHeader` | INVESTIGAR | sinal positivo |
| `/admin/(protected)/google`, `/usage`, `/platform-admins` | | INVESTIGAR | |

## C. Deep-dives (8 telas, leitura de componente em 2026-10-15)

### T1 — Dashboard `/app` — REFINAR (aplicado)

1. Objetivo: centro de comando — o que vendi, rumo à meta, quem precisa de ação.
2. Ação principal (abrir radar / agir no cliente) competia com redundância e sem retry em falha.
3. Hierarquia: KPIs → evolução → ação — ok, mas `ClientesParaAgir` e `SalesRadar`
   contavam o mesmo radar (risco/recompra/oportunidade) em sequência — redundância vertical.
4. Header personalizado (`cumprimento, nome`) — MANTER fora do `NexusPageHeader`:
   saudação não é título administrativo; padronizar aqui seria pior.
5. Erros viravam frase cinza sem `role=alert` e sem retry (4 pontos em `_home-secoes.tsx`).
6. `CrmSalesChart` SVG `viewBox 680×262`, rótulos 8–9px — risco de colisão em 360px (pendente).
7. KPI "Meta do mês" usa `trend down` (vermelho) sempre que <100% — cor de falha para
   estado normal no dia 2 (pendente: trocar por neutro até ~80% ou sem trend).
8. Gravidade: média (redundância) + média (erros mudos). Solução: remover `SalesRadar`
   do dashboard (dados seguem em `ClientesParaAgir` + `/app/radar`); trocar frases por
   `NexusErrorState` compacto com retry (`refetch`). Arquivos:
   `app/app/_home.tsx`, `app/app/_home-secoes.tsx`. Aceite: sem seção duplicada;
   falha de radar/roadmap/fila mostra alerta com retry funcional.

### T2 — Meu Dia `/app/meu-dia` — REFINAR (fatia aplicada ciclo 2; resto pendente)

- Título "Meu Dia" até o mount, depois saudação com data — layout shift a cada abertura.
  Corrigir com data inicial no servidor ou título estático + data como subtítulo.
- Até 4 blocos "Vencidos/NF/Fora da carga/Vencendo" + mensagens + follow-ups empilhados
  sem colapso — coluna direita longa. Agrupar ou colapsar por origem.
- Só `critica` tem selo; `alta/normal/baixa` indistinguíveis. Escala visual de 4 níveis.
- Erros em `div role=alert` artesanal; loading com `Skeleton` cru (trocar por
  `NexusSkeleton`/`NexusErrorState`).
- Mobile: timeline acima de todo o contexto — com dia cheio, muito scroll até mensagens.

### T3 — Inbox `/app/inbox` — REFINAR (fatia aplicada ciclos 2–3; rebuild integral recusado com evidência)

- "Zero Nexus*". **Refutado**: `EmptyInbox` canônico; erro tinha retry (virou
  `NexusErrorState` ciclo 2).
- Painel de contexto some entre `md` e `xl` sem aviso. **Corrigido ciclo 2**:
  gatilho "Ficha" (Sheet) na faixa `md–xl`.
- Colunas rígidas em px + altura travada. **Verificado**: lista/painel fixos +
  centro fluido é o padrão de 3-painéis; altura desconta TopBar+padding por
  token (`InboxLayout.tsx:293-336`). MANTER.
- Filtros com vocabulário próprio. **Verificado**: `InboxFilters`
  (fila/minhas/fechadas/IA) é vocabulário de fila, não divergência. MANTER.
- Volta mobile. **Verificado**: `colunasDoCelular` (fonte única) + voltar fora
  do ramo carregado (`InboxLayout.tsx:56-61,404-438`). MANTER.
- Conclusão: a composição-alvo (3 painéis desktop, 1 coluna mobile, ficha em
  Sheet, atalhos de teclado, realtime observável) **já é a implementada** —
  reclassificado de RECONSTRUIR para REFINAR. Rebuild integral seria churn.

### T4 — Contatos `/app/contacts` + `[id]` — REFINAR (fatia aplicada ciclo 2; resto pendente)

- Lista é referência (`FilterBar` canônico + paginação). `tagOptions` deriva só dos
  contatos carregados — tag além da página some do filtro (derivar do backend).
- Detalhe: loading com `Skeleton` cru; erro sem retry e sem `role=alert`
  (adotar `NexusErrorState`); cabeçalho custom fora do `NexusPageHeader`.
- Header com 2 CTAs estoura em 390px (empilhar ações no mobile).
- Tabela sem fallback em cards no mobile (adotar `renderCard` do `NexusDataTable`).

### T5 — Pedidos `/app/pedidos` (+novo, +[id]) — CONSOLIDAR (status unificado ciclo 2; resto verificado-mantido)

- Três visões, três linguagens de status (Pill / texto / coluna). Unificar selo.
- Header com 3 ações de impressão + criar — primária compete com duas quase idênticas.
- Filtros com `<select>` nativo fora do `FilterBar`; `details/summary` nativo sem
  `aria-expanded` (adotar disclosure do DS).
- Novo: `pb-24 lg:pb-6` sugere CTA fixa sob navegação no mobile — verificar sobreposição.
- Catálogo/contatos limitados a 500 linhas no servidor sem aviso — paginar ou avisar.

### T6 — Radar `/app/radar` — REFINAR (fatia aplicada ciclo 2)

- "Abas" são botões de scroll sem `aria-current`, sem deep-link, sem estado ativo.
  Virar abas reais (ou segmented control com `?secao=`, preservando scroll atual por e2e).
- 5 seções sempre montadas — primeiro paint pesado; lazy por seção com skeleton.
- Critério "sem base" (pedido >60d) invisível na UI — exibir o critério no empty.
- Gate `podeOperar` para viewer sem copy explicativa — checar.

### T7 — Financeiro `/app/financeiro` — REFINAR menor (parser+locale ciclo 2; trends pendentes)

- Modelo do DS (header + KPIs + tabs + DataTable + detalhe inline). Manter a estrutura.
- KPIs sem `trend`/`variation` (só "Vencido") — valores estáticos sem contexto.
- Parse manual de valor (`replace(".",","`) frágil para "1.000,00" — parser BR robusto.
- `toLocaleDateString()` sem locale em vários pontos — fixar `pt-BR` (browser en-US
  exibiria MM/DD/YYYY).
- TabsList mobile: verificado OK na classe (`tabs.tsx:62`).

### T8 — Catálogo `/app/products` — REFINAR (header ciclo 2; resto pendente)

- Header artesanal (`h1 text-2xl font-medium`) — terceiro estilo de título do produto;
  adotar `NexusPageHeader`.
- Dois níveis de abas aninhadas; "Sem fotos" é filtro disfarçado de aba.
- Grid `sm:grid-cols-2` em `max-w-5xl` aperta cards; sem `xl` o desktop desperdiça espaço.
- Empty de viewer sugere cadastrar sem poder — checar copy vs `podeEditar`.

## D. Transversais (regras para as Fases 4–9)

1. **Header:** `NexusPageHeader` é o padrão; exceções justificadas (saudação do
   dashboard, `Cabecalho360`, Inbox 3-painéis) ficam documentadas aqui, não viram álibi.
2. **Erros de painel:** `NexusErrorState` + retry sempre que houver `refetch`; frase
   cinza sem ação é bug (proibido padrão novo).
3. **Filtros:** `FilterBar`/`FilterSelect` canônicos; selects nativos só com motivo.
4. **Tabelas:** `NexusDataTable` com `renderCard` no mobile; alinhar moeda à direita,
   tabular-nums; paginação preservando query.
5. **Tabs:** `TabsList` da classe já rola (`overflow-x-auto`); telas usam sem reinventar.
6. **Datas/moeda:** `pt-BR` explícito; parser BR único para inputs monetários.
7. **Dedupe antes de decorar:** redundância (T1) sai antes de microanimação.

## E. Varredura ciclo 3 (2026-10-16) — todos os módulos restantes

Método: 4 auditorias read-only paralelas (código-fonte, sem screenshot) + verificação
e correção pelo executor. Onde a primeira impressão foi refutada por evidência, a
decisão registra o motivo (regra da Fase 4: sem migração por preferência).

### E.1 Operação comercial

| rota | decisão final | nota |
|---|---|---|
| `/app/estoque` | MANTER | exemplar (header+FilterBar+DataTable+renderCard) |
| `/app/compras`, `/compras/[id]` | MANTER | idem + prefill `?novo=1` |
| `/app/carteira` | MANTER | RSC + filtro client (sem fetch = sem error state) |
| `/app/agenda` | MANTER | calendário justifica filtros próprios; tem loading+error |
| `/app/busca` | MANTER | busca instantânea; hints adequados |
| `/app/expedicao` (lista) | MANTER | server-driven, testids e2e, empties distintos ("não achei"×"não há") |
| `/app/notas` | MANTER | GradeNotas: dados via prop server + empties canônicos |
| `/app/faturamento` | REFINAR aplicado | `falhou` + error/retry no DataTable |
| `/app/comissoes` | REFINAR aplicado | idem |
| `/app/kanban` | REFINAR aplicado | `role=alert` nos erros de mutação (retry inviável: ação desconhecida) |
| `/app/pipelines/[id]` | REFINAR aplicado | header canônico + error/retry + `role=status` |
| `/app/tarefas` | CONSOLIDAR aplicado | pills→Badge, loading skeleton, error+retry, toggle no slot `navigation` |
| `/app/expedicao/[id]` | REFINAR aplicado | error+retry no load (antes: skeleton eterno); banner sticky MANTIDO (operacional) |
| `/app/venda-automatica` | REFINAR aplicado | header canônico |
| `/app/kanban` × `settings/tenant/pipelines` | CONSOLIDAR pendente | duplicação real; exige decisão de produto (links/seed) — não remover sem ela |

### E.2 Inteligência + IA

| rota | decisão final | nota |
|---|---|---|
| `/app/relatorios`, `/indicadores`, `/inteligencia`, `/prospeccao` | MANTER | headers+estados ok; sem decorativo (verificado grep) |
| `/app/laboratorio` | REFINAR aplicado | header canônico |
| `/app/ai` (hub), `/ai/usage`, `/ai/evolution` | MANTER | hub NavHub; evolution exemplar de vazio |
| `/app/ai/agents`, `/cases`, `/controle`, `/credentials`, `/inbox`, `/followups`, `/knowledge/sources`, `/memory`, `/proposals`, `/decisoes`, `/skills`, `/routers`, `/usage` | REFINAR aplicado | 14 headers `h1`→`NexusPageHeader`, copy intacta |
| `/app/ai/agents/[id]`, `/new`, `/followups/[id]`, `/enrollments/[id]`, `/routers/[id]` | MANTER justificado | editores com header próprio (AgentForm h2, Dossiê h1-identidade); page-header duplicaria |
| `/app/ai/providers`, `/runs` | REFINAR aplicado | headers → `NexusPageHeader`; `subtitle` do DS alargado p/ `ReactNode` (contagem dinâmica) |

### E.3 Settings + plataforma

| rota | decisão final | nota |
|---|---|---|
| `/app/settings` (hub), `/atendimento`, `/atualizacao`, `/billing`, `/marca`, `/profile`, `/security`, `/tenant`, `/templates`(redirect), `/tenant/whatsapp`, `/settings/canal-oficial` | MANTER | FormField onde importa; state-machines exemplares; redirects legados |
| `/app/settings/notifications` | MANTER | tabela já `ui/table` (§100: troca era só moldura — feita) |
| `/app/settings/api-tokens` | REFINAR aplicado | FormField + erro inline de escopos (era só toast) |
| `/app/team/invite` | REFINAR aplicado | FormField + hint limite + erro inline (era só toast) |
| `/app/templates` | REFINAR aplicado | dialog em FormField; gates e copy intactos |
| `/app/settings/tenant/agenda`, `/settings/tenant/pipelines` (editor), `/app/audit` (filtros) | MANTER justificado | forms rotulados + e2e-pinned + validação própria; FormField = churn sem benefício (regra Fase 4) |
| `/app/team` (membros) | CORRIGIDO | **bug real**: 4 cabeçalhos trocados (Cargo→Setor, Status→Papel, Última→Status, faltava Última) — corrigido ciclo 3 |
| `/app/team` (atendimento) | MANTER | resumo tz-aware + dirty-save são o acerto |
| `/app/lgpd/requests` (+`[id]`) | MANTER | SLA + justificativa + trilha auditável |
| `/app/connections` | MANTER | `ConexoesShell`: abas aninhadas com `?aba=&sub=` (deep-link), labels white-label-safe — o padrão correto de aninhadas |
| `/app/webhooks`, `/integrations/nuvemshop` | MANTER | Tabs+mounted; máquina 3-estados |

### E.4 Admin + público + sistema

| rota | decisão final | nota |
|---|---|---|
| Admin: tenants, users, audit, incidents, lgpd, marca, google, usage, platform-admins, tenants/new, users/[id], incidents/[id], audit/[entryId] | MANTER | padrão canônico + skeletons + retry |
| `/admin/dashboard` | REFINAR aplicado | error+retry (era o único sem) |
| `/admin/tenants/[id]` | REFINAR aplicado | subtitle no header |
| `/admin/tenants/[id]/health` | MANTER | herda header/tabs do layout; segundo header duplicaria |
| `/admin/inbox` | MANTER + limitação registrada | read-only assumido; 360px fixo = desktop-first (admin interno); mobile do tenant já coberto |
| `/admin/forbidden`, login (5), signup, onboarding (9), 403/500/503/suspended, legal (2), accept-invite, `/` | MANTER | shells próprios; login env×DB intencional; onboarding = exceção wizard declarada |
| `/design` | MANTER | `DeskcommCRM` no h1 é allowlist explícita do `branding.test.ts:352,388` |
| `/vitrine-agenda` | MANTER | isolada + noindex de propósito |

### E.5 Deferidos com motivo (não esquecidos)

- Endpoint de tags distintas p/ filtro de contatos: exige rota API + RLS + teste — backend, fora do escopo visual; sem inventar.
- Trends/comparativos nos KPIs (financeiro): dado não existe; inventar é proibido.
- `renderCard` em ContatosTable: bulk+sort acoplados; reescrita = risco sem benefício medido.
- Colapso/lazy das 5 seções do Radar: 3 e2e leem sem clique; lazy quebraria a premissa.
- Timeline acima do contexto no mobile (Meu Dia): estrutural; exige desenho, não ajuste.
