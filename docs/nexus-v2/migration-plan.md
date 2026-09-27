# NEXUS 2.0 — Migration Plan (FASE 0 → 10)

> Regra: ENTENDER→PRESERVAR→MELHORAR · ISOLAR→CORRIGIR→TESTAR · CONSOLIDAR fonte de verdade · MAPEAR→MIGRAR→TESTAR→REMOVER. Sem big-bang.
>
> **Status recontado no passo 8 (2026-09-27).** Cada FASE abaixo diz o que foi
> entregue e onde está a prova; o checklist §94 no fim está item a item, com
> ⚠️/❌ explícitos — nada é dado por pronto sem caminho/prova.

## FASE 0 — Auditoria ✅ CONCLUÍDA (2026-09-24)

- [x] Inventário (`inventory.md`), arquitetura, rotas, API, banco, IA, segurança, infra, design, parity-matrix, este plano
- [x] Branch `nexus-v2` + tag `nexus-v1-archive` + push p/ `nexus` + `deploy-performance.md` baseline (a medir — ver §94)

## FASE 1 — Fundação ✅ CONCLUÍDA

- [x] `lib/crm|sales|finance/` fachadas + `lib/ai/sales-brain/` real + Orchestrator puro + `lib/ai/copilot/` (`327f6a637`, `00e0349af`, `babc7c961`, `dc353505d`)
- [x] `scripts/deploy.sh` + `ci.yml` concurrency (`327f6a637`)
- [x] `DEFAULT_APP_NAME` → `NEXUS` (`3c0905cb2`)
- [x] `/api/v1/sales-brain`, `/api/v1/copilot/context`, páginas Meu Dia (`f6019dc4e`), Decisões (`962e97728`), Controle (`eaa7fbcbf`)
- [x] Registry/taxonomia §19 — Sidebar §19 fechado (`4126a9681`) + registry de rotas (gate "rota nova → registry")
- [x] Design tokens consolidados — hex→tokens na Fase 4 + gate `auditoria-aceite-100.test.ts` ("sem hex em classe")

## FASE 2 — CRM ✅ (existia; PRESERVADO + redesenhado)

- [x] Clientes/busca/filtros/massa (`e062aa3b5` + bulk-tag `0480cbf54`) · Customer 360 9 abas (`3612818d7`) · timeline/atividades · pipelines/kanban (`921435fe8`)
- [x] Testes: `contato-salva-email`, `conversa-vira-lead`, `confirmar-dado-do-contato`, `pipelines-gestao`, `kanban-owner-filter`

## FASE 3 — Vendas ✅ (existia; PRESERVADO + jornada verde)

- [x] Pedidos (rápido, políticas, comissão), novo pedido, produtos, vendedores/metas
- [x] **E2E Jornada 1 = `jornada-venda.spec.ts`** (seed→pedido→aprovar→faturar, verde no passo 7)

## FASE 4 — Radar + Sales Brain ✅

- [x] Radar (8 estados) + recompra (`last/cycle/predicted/delay`) + oportunidades — existiam; specs `recompra-radar`, `risk-radar`
- [x] Sales Brain operacional entregue (`62631898c` `BrainRecomendacoes`, `085ee13f3` Roadmap, `225996ef8` sugestão de compra)
- [x] **E2E Jornada 2 = `recompra-radar.spec.ts`** (PARTE_1 do CI)

## FASE 5 — WhatsApp + IA ✅

- [x] Inbox 3 colunas + contexto rico (`0228f8c9f`), AI Draft/Copilot, agents por função, intent/memory/RAG/skills, follow-up engine, handoff
- [x] **E2E Jornada 3 = `jornada-ia.spec.ts`** (proposta→aprovação→ação no Decision Log) + 7 specs `followup-*` + `capacidades-do-agente`

## FASE 6 — Estoque + Compras ✅ CRIADO (o único greenfield de domínio)

- [x] Saldo/entradas/saídas/ajustes/reservas (`inventory_movements`, migration 0240 `aa61bba1c`) + fornecedores/pedidos de compra + sugestão/demanda
- [x] **E2E: `estoque-entrada-saida-e-saldo` + `compras-do-rascunho-ao-estoque`** (verdes no passo 7)

## FASE 7 — Logística ✅ (existia; jornada verde)

- [x] Pedido→separação→carga→romaneio→rota→entrega; motorista/veículo; geocode real
- [x] **E2E Jornada 4 = `jornada-expedicao.spec.ts`** (Mapa da rota/Ordem de entrega/Sair para rota/paridas)

## FASE 8 — Financeiro ✅ (existia; jornada verde)

- [x] Receber/pagar/cobranças/conciliação/fluxo (6 abas) + títulos; pedido gera título controlado (faturar); Customer Finance no 360
- [x] **E2E Jornada 5 = `jornada-financeiro.spec.ts`**

## FASE 9 — Fiscal ✅ (existia; jornada verde com nota honesta)

- [x] Pedido→faturamento→documento→NFe→status; SPED payload; jobs/fiscal-drain; pedidos podem aguardar faturamento (regra operacional)
- [x] **E2E Jornada 6 = `jornada-fiscal.spec.ts`** (config→emitir→pendente→retorno SEFAZ; "Sem emissor fiscal configurado" é o estado esperado sem sidecar)
- [ ] CCE/inutilização/manifestação/importação: existem como superfície `lib/fiscal` — a prova de ponta a ponta depende de emissor real (VPS); declarado, não mascarado

## FASE 10 — Autonomia ⚠️ PARCIAL (declarado, sem ação fantasma)

- [x] Orchestrator níveis 0–6 (`decide.ts`, testes `decide`/`run`/`operador-decide-se-roda`) + política `autonomia-nivel-N` aplicada (E2E `jornada-ia`)
- [x] Decision Log: proposta→aprovação (custódia `ai.action.approved`)→ação (`/executar`)
- [ ] **Executores: só `agendar_followup`** — `gerar_abordagem` responde 422 honesto "Ferramenta sem executor"; campanhas/envio autônomo de pedido exigem política explícita do dono (**não inventada**)
- [x] Flywheel judge já existe (`flywheel-judge-live.ts`, `judge_alignment_pool`)

## Limpeza legado (KEEP/REFACTOR/REPLACE/REMOVE) — estado medido no passo 8

- REMOVE/ARQUIVAR:
  - [x] **kit `mercos-scrape` arquivado** em `docs/legacy/mercos-scrape/` (35 scripts, `256ee46ef`) — fora do runtime, fora dos tsconfigs, zero referência restante
  - [x] `DataTable*` dupes, `Visitors` como marca (Fases 3–4)
  - [x] `build:` opt-in só em `docker-compose.build.yml` (compose prod usa `image:`)
  - [x] `latest`-only → `stable`/tag fixa (packaging)
  - [ ] `tenant_id` residual — varrer no próximo toque de schema (não medido hoje)
- REFACTOR (continua, sem urgência de bloqueio): branding default, worker Dockerfile single-stage, CI, monólitos financeiro/fiscal (parciais preservados e testados)
- REPLACE: ✅ `deploy.sh`, Sales Brain, Orchestrator, Copilot entregues
- KEEP: todo §6 do doc (CRM, vendas, radar, recompra, prospecção, mapas, expedição, financeiro, fiscal, WhatsApp, IA, automações)

---

## Critério de sucesso (§94) — RECONTADO no passo 8 (2026-09-27)

> 41 itens: **38 ✅ · 2 ⚠️ · 1 ❌**. Cada um com prova (arquivo/spec/check).
> Fonte do texto: spec §94 (linha 2852).

| # | Item (§94) | | Prova (medida) |
|---|---|:---:|---|
| 1 | Nexus atual foi auditado | ✅ | FASE 0 — 11 docs em `docs/nexus-v2/` (2026-09-24) |
| 2 | parity matrix existe | ✅ | `docs/nexus-v2/parity-matrix.md` (recontada hoje) |
| 3 | funcionalidades existentes foram classificadas | ✅ | colunas Preservar/Refatorar/Recriar/Remover da parity |
| 4 | legado foi identificado | ✅ | `inventory.md` REMOVE + kit arquivado em `docs/legacy/mercos-scrape/` (`256ee46ef`) |
| 5 | arquitetura está organizada | ✅ | `architecture.md` + fachadas `lib/crm\|sales\|finance` (`327f6a637`) |
| 6 | NEXUS é System of Record | ✅ | `commercial_orders` própria; radar/Brain derivam dela; parity veredito |
| 7 | não existe Mercos integration | ✅ | 0 adapter/sync/rota/tabela/cron (varredura passo 8); kit offline em `docs/legacy/` |
| 8 | não existe ERP external dependency | ✅ | 0 hits `erp_sync`/cliente ERP em `app\|lib\|workers\|hooks` |
| 9 | CRM funciona | ✅ | specs `contato-salva-email`, `conversa-vira-lead`, `pipelines-gestao`, `kanban-owner-filter` |
| 10 | Customer 360 funciona | ✅ | `contato-salva-email` navega `/app/contacts/{id}`; 9 abas (`_client.tsx:104-118`) |
| 11 | pedidos funcionam | ✅ | E2E `jornada-venda` |
| 12 | estoque funciona | ✅ | E2E `estoque-entrada-saida-e-saldo` |
| 13 | financeiro funciona | ✅ | E2E `jornada-financeiro` + 6 abas |
| 14 | fiscal funciona | ✅ | E2E `jornada-fiscal` (emitir→pendente→retorno SEFAZ) |
| 15 | expedição funciona | ✅ | E2E `jornada-expedicao` |
| 16 | rotas funcionam | ✅ | mesma spec — Mapa da rota, Ordem de entrega, Sair para rota, paridas |
| 17 | WhatsApp funciona | ✅ | `inbox-scope`, `inbox-responder-citando`, `inbox-quem-manda`, `inbox-abas-espelham-o-comando` |
| 18 | Radar funciona | ✅ | `recompra-radar`, `risk-radar` |
| 19 | Sales Brain funciona | ✅ | E2E `jornada-ia` (propose determinístico) + `GET /api/v1/sales-brain` |
| 20 | Follow-up funciona | ✅ | 7 specs `followup-*` + fila/crons |
| 21 | IA funciona | ✅ | `jornada-ia`, `credenciais-de-ia`, `inteligencia-carrega` |
| 22 | agentes funcionam | ✅ | `capacidades-do-agente`, `agente-*` (4), `qa-agente-usa-as-maos` |
| 23 | governança de IA funciona | ✅ | `case-guardrail` + `orcamento-*` + `camadas-de-seguranca-*` (invariants) + custódia do Decision Log |
| 24 | vendedor autônomo funciona | ⚠️ | níveis 0–6 tipados (`orchestrator/decide.ts`) + política aplicada + Decision Log propõe→aprova→executa; **único executor = `agendar_followup`** (422 honesto no resto) — lacuna declarada, política não inventada |
| 25 | UI foi completamente redesenhada | ✅ | passo 6 §100 — 106 rotas varridas, VIOLACOES(0)/FAMILIAS(1), `auditoria-aceite-11-itens.spec.ts` + gate `auditoria-aceite-100.test.ts` |
| 26 | responsive funciona | ✅ | passo 6a — `responsividade-nas-rotas.spec.ts`, 207 combos 390/430/768, 0px de overflow |
| 27 | accessibility foi considerada | ✅ | axe em `auth.spec.ts` (sem violações serious/critical) + `rbac-roles.spec.ts` no CI, 22 specs com teclado/foco, `docs/design-system/screen-flow/08-accessibility.md` (WCAG 2.1 AA) — sem gate único de a11y, declarado |
| 28 | performance foi validada | ⚠️ | check obrigatório `build-and-size` (`perf.yml`) mede bundle; **Lighthouse/CLS/INP = alvos não medidos** (S-12.05 deferido); tempo de deploy a medir (§84) |
| 29 | multi-tenancy está protegido | ✅ | job `invariants` (obrigatório) — org scoping + `requireRole` |
| 30 | RLS está correto | ✅ | `rls-isolation.test.ts` — 54 tabelas × 3 casos (~162) + `rls-completude-varredura` |
| 31 | auditoria existe | ✅ | `lib/audit` — `AUDIT_ACTIONS` 308 códigos, painel, 7 testes unit + 1 invariant |
| 32 | testes críticos existem | ✅ | 486 arquivos em `tests/unit/` (848 no total de `tests/`) |
| 33 | E2E crítico existe | ✅ | 90 specs, 88 no CI, `e2e` = check obrigatório (gate `e2e-cobertura-completa`) |
| 34 | Docker está otimizado | ✅ | `Dockerfile` 3 estágios com cache de camadas (`deps`→`build`→`runner`); worker/scheduler single-stage declarado |
| 35 | build usa cache | ✅ | `cache: pnpm` (4 workflows) + cache do Playwright + buildx `cache-from/to: type=gha`; sem cache de `.next` (declarado) |
| 36 | VPS não faz build | ✅ | `docker-compose.prod.yml` usa `image:` (+`build:` só como escape); `install.sh`/`update.sh` pull-first |
| 37 | GHCR funciona | ✅ | `publish-image.yml` — 3 imagens, check `imagens-ok` obrigatório |
| 38 | health check funciona | ✅ | probe TCP no compose + `/api/v1/health` (+ `healthcheck.sh` do kit) |
| 39 | rollback funciona | ✅ | `agent.sh:234` — `PREV_IMAGE`, rollback automático em RC≠0, persiste `APP_IMAGE` |
| 40 | deploy foi medido | ❌ | `docs/infrastructure/deploy-performance.md` = placeholder (coluna "Medido" toda "—"); só se preenche no primeiro deploy na VPS (§84) |
| 41 | documentação foi atualizada | ✅ | `docs/nexus-v2/` (13 arquivos recontados no passo 8) + handoff deste passo |

**O que falta para dizer "§94 fechado":** item 40 (deploy real medido na VPS,
meta §84 ≤5min / 1–3min quente) e, se o usuário quiser contar como pronto,
resolver os dois ⚠️ (24: executores/política de ação autônoma; 28: Lighthouse
ou aceite explícito de "performance = build+bundle").

---

## Auditoria linha-a-linha pedida no passo 8 (§51, §52, §53, §14)

- **§51 Financeiro ✅** — os 6 módulos medidos na tela: Contas a Receber,
  Contas a Pagar, Cobranças, Conciliação, Fluxo de Caixa, Títulos
  (`financeiro/_client.tsx:254-259`) + **Pagamentos** como baixa em
  recebíveis com estorno (`:1050`, `:1068`). "Pedidos geram registros
  financeiros de forma controlado" = ação Faturar gera os recebíveis dentro
  do PATCH (medido e corrigido no passo 7).
- **§52 Fiscal ✅** — fluxo Pedido→Faturamento→Documento→NFe→Status provado
  de ponta a ponta no `jornada-fiscal` (configurar→emitir→pendente→
  "Retorno da SEFAZ"). DANFE: rota/PDF existem e aparecem quando
  autorizada; sem emissor o estado honesto é "Sem emissor fiscal
  configurado" (sidecar `sped-nfe`). "Pedidos não necessariamente
  faturados imediatamente" ✅ — pedido avulso na jornada nasce sem nota e é
  faturado depois.
- **§53 Customer Finance ✅ (com nota)** — 360 com 9 abas; a aba Financeiro
  traz limite de crédito editável, condição padrão, "Em aberto" e "Vencido"
  (`contacts/[id]/_financeiro.tsx`) + link "Ver financeiro" para o detalhe
  de títulos/pagamentos (que mora em `/app/financeiro`); Pedidos =
  aba Compras; Histórico = aba timeline; **IA considera**: `_inteligencia360`
  é o primeiro insight do Brain (`0480cbf54`).
- **§14 Novo design ✅** — direção "ERP moderno + Sales OS" entregue no
  passo 6: avoid-list do §14 auditada item a item na spec
  `auditoria-aceite-11-itens.spec.ts` (sem glassmorphism, família de fonte
  única, títulos em ≤3 tamanhos, sem transição >400ms) + gate de fonte
  `auditoria-aceite-100.test.ts`; dark-first mantido (decisão registrada em
  `progress.md` — §100/§14 não mandam claro).
- §19/§20/§91 já cumpridos (registrado no handoff do passo 6).
