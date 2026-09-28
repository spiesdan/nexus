# NEXUS 2.0 — AI (Sales Brain, agentes, governança)

> Patrimônio real: `lib/ai` (93) + `lib/agent-engine` (123) + `workers/ai-*` + `agent-worker/main.ts`. Tudo por tenant, auditável.

## 1. O que existe e funciona (PRESERVAR)

| Peça | Prova | Estado |
|---|---|---|
| Intent Router | `router-config.ts`, `intent-classifier.ts` (`purpose='intent_router'`), `resolve-turn-agent.ts`, migration `0085`, API `routers/[id]/test` | ✅ funciona |
| Runtime turno | `inbound-turn.ts`, `followup-turn.ts`, `case-reply-turn.ts`, `operator-turn.ts` + `run-model-call.ts`, `providers.ts`, `orcamento.ts`, `count-tokens.ts` | ✅ funciona |
| Tools/MCP | `mcp-tools.ts`, `mcp-client.ts`, `lib/mcp/tools/*`, `lib/mcp/server.ts` | ✅ funciona |
| Memory | `org-memory.ts` (por turno, sem cache), `memoria-da-org.ts`, APIs `memory/*`, tabelas `org_memory_*`, UI `ai/memory` | ✅ funciona |
| RAG | `rag/*` + `embed.ts` (1536 dims, `text-embedding-3-small`), `search-knowledge.ts`, `knowledge/busca.ts`, `rag-indexer.ts`, `ai_chunks` pgvector, cron `kb-conversations-batch` | ✅ funciona |
| Skills | `skills.ts`, `skill-references.ts`, `ai/skills/db.ts|install.ts|package.ts`, migrations `0068/0069`, `getSkillsPool()` | ✅ funciona |
| Follow-up engine | `lib/followup/*` (~30: `engine|enroll|node-handlers|graph-schema|turn-bridge|silence-sweep…`), `followup-turn.ts`, handler `followup_turn`, crons `followup-flow-worker`+`agent-dispatcher` | ✅ funciona |
| Handoff | `handoff/orchestrator.ts` (`pending`+`bot_silenced_until=infinity`+activity+`ai.handoff_triggered`+broadcast+audit, idempotência 5s), `regex|triggers|aviso-ao-lead`, `ai-handoff-from-sentiment` | ✅ funciona |
| Guardrails | `before-send.ts`, `messaging-window.ts`, `camadas-da-org.ts`, `human-promise.ts`, `jailbreak/classifier.ts`, `promise/engine.ts` | ✅ funciona |
| Budgets/providers/credentials | `budget/check.ts`, `catalogo/sincronizar.ts|openrouter.ts`, `credenciais/*`, `pontos/*`, UI providers/credentials/usage/evolution | ✅ parcial (evolution agrega, runs vazio) |
| Agent Runs | `agents/[id]/runs` — prod 2026-08-30 tinha **0 linhas** | ⚠️ instrumentar (motor não escreve runs) |

## 2. WhatsApp + IA (§31–§32)

Inbox 3 colunas existe (`inbox/` 35 components + `Composer.tsx` com `Nexus*`). Contexto cliente mostra último pedido, produtos, recompra, financeiro, oportunidades, vendedor, Sales Brain (a ligar), follow-ups. IA entende intenção, consulta cliente/produtos/preços/pedidos/estoque, responde, cria pedido, inicia follow-up, transfere p/ humano — tudo com governança (before-send + budgets + handoff).

## 3. Gaps — CRIAR (não existem, 0 hits)

1. **Sales Brain** (`sales-brain|sales_brain` = 0): página operacional (não só grafo) — QUEM/PORQUÊ/QUANDO/O-QUÊ/COMO/próximo passo; deriva de `radar-compras.ts` + `risk-radar.ts` + histórico + estoque + financeiro. Ações: [Ver cliente][Criar pedido][WhatsApp][Aprovar IA]. Base pronta: `app/app/inteligencia/` + `lib/nexus/graph.ts` + `hooks/nexus/useNexusIntelligence.ts`.
2. **Sales Orchestrator** (só handoff orchestrator existe, 72 hits): camada evento→contexto→prioridade→intenção→ferramenta→ação→resultado→aprendizado. Alimenta `event_log` + `ai.action.proposed/executed`.
3. **Copilot contextual**: entende página atual (cliente/pedido/financeiro/radar) — novo `/api/v1/copilot/*`.
4. **Agentes por função**: Sales, Customer, Follow-up, Prospecting, Collections, Order, Support, Inventory, Logistics, Finance, Fiscal — com políticas (níveis 0–6, §35).
5. **AI Decision Log + Approvals**: quem/agente/dados/ferramentas/políticas/resultado; UI AÇÃO PROPOSTA/MOTIVO/DADOS/IMPACTO [Aprovar][Recusar].
6. **AI Sales Control**: Actions/Opportunities/Risks/Conversations/Orders/Follow-ups/Decisions/Errors/Approvals/Budget.

## 4. Regras

- Autonomia 0–6 (§35): observa → recomenda → rascunho → executa com aprovação → ações permitidas → campanhas autorizadas → vendedor autônomo.
- Memory/RAG por tenant, segura, auditável. Sem dados de outro tenant.
- Mocks só em Storybook/testes/fixtures isoladas. Radar/IA sempre dados reais.
