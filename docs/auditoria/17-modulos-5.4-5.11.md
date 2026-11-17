# Módulos 5.4, 5.8, 5.9, 5.10 e 5.11 — auditoria medida

> **Método:** quatro leituras paralelas do código (inbox/campanhas, fiscal, IA,
> configurações/admin), em 2026-11-17, na branch `docs/auditoria-aaa`. O que exige
> execução está marcado como **não medido**. Cada problema tem `arquivo:linha`; o
> que foi corrigido nesta rodada está no §6.

## 1. Fiscal (5.8)

**Superfície:** 13 telas em `/app/fiscal` + 6 abas em `/app/notas`; handlers
`app/api/v1/fiscal*` e `app/api/v1/invoices/**`.

**O que funciona (medido):**
- emissão só de status faturável e um destinatário por nota
  (`lib/fiscal/emitir-nota.ts:246-293`); número por `fn_reservar_numero_nfe`;
- cancelamento recusa cancelada/denegada e, para autorizada, **transmite antes de
  gravar** (`invoices/[id]/cancel/route.ts:62-120`);
- CC-e só autorizada, teto 20 (`carta-correcao/route.ts:56-66`);
- inutilização recusa faixa que cruza nota viva e sobreposição
  (`fiscal-inutilizacoes/route.ts:63-79`);
- manifestação 210210 = agent, demais = manager (`manifestar/route.ts:47-56`);
- sync com lock, 656 e cursor (`fiscal-entradas/route.ts:128-141`).

**Problemas abertos:**

| # | Problema | Onde |
|---|---|---|
| F1 | Cancelar `pendente/erro` sem confirmação (e apaga o `erro`) | `notas/GradeNotas.tsx:351-374` |
| F2 | Inutilização irreversível em um clique (só lacunas confirma) | `fiscal/AcoesFiscais.tsx:105` |
| F3 | Importar entrada move estoque e cria pagáveis sem confirmação | `fiscal/AcoesDaEntrada.tsx:189` |
| F4 | Desconhecimento/não-realizada (210220/210240) sem confirmação | `AcoesDaEntrada.tsx:109-131` |
| F5 | Nenhuma rota fiscal usa `Idempotency-Key` | grep vazio em `app/api/v1/fiscal*` |
| F6 | Listas com `limit 300` silencioso, sem “há mais” | `fiscal/{eventos,manifestacoes,produtos,fornecedores}` |
| F7 | Sincronizações sem retry por linha; erro só de leitura | `fiscal/sincronizacoes` |
| F8 | `ignorar` exige só `agent`; importar/confirmar exigem manager | `ignorar/route.ts:22` |

## 2. Inbox e campanhas (5.4)

**Matriz canal × capacidade** (`lib/channels/`):

| Capacidade | waha | meta_cloud | zernio |
|---|---|---|---|
| leitura / envio / mídia / status / reconexão | ✅ | ✅ | ✅ |
| template (criar) | ❌ | ⚠️ só sincroniza | ✅ |
| grupo | limitado | ❌ | ❌ |
| sticker / localização | ❌ (viram documento) | ❌ | ❌ |

**Inbox — existe:** filtros (Fila/Minhas/Todas/Fechadas/Automático), atribuição
(claim/release/transfer), tags, dossiê do cliente, anexos (8 tipos), busca,
realtime de dados, falha de envio visível, handoff IA↔humano.

**Inbox — ausente:** prioridade de conversa, SLA de atendimento, macros/respostas
rápidas, presença/typing do atendente, **reenvio** de mensagem falha.

**Layout:** 390 = 1 coluna (lista OU conversa); 834/1024 = 2 colunas; 1280+ = 3
colunas (`components/inbox/InboxLayout.tsx:58-59,336,522`). A terceira **some**
abaixo de 1280, não empilha.

**Campanhas — existe:** consentimento no plano, segmentação, dedup, limite
(500/dia, padrão 50), rastreio status/ack, opt-out. **A UI** não mostra
consentimento/opt-out, só a cota (`_criar-regiao.tsx:505`).

**Problemas abertos:** capabilities mentem (`canManageTemplates`/`groups` vs
adapters); sticker/location sem branch; zernio recusa cartão de contato sem
aviso; sem SLA/prioridade/macros/presença/reenvio; UI de campanha esconde
consentimento/opt-out.

## 3. IA, agentes e automações (5.9)

**Existe (medido):** agentes/versões/publicação/rollback
(`ai/agents/[id]/_actions.ts:121,333,420`); credenciais AES-GCM; routers e
binding de provider; skills/memória/fontes; runs com custo/tokens/latência/steps;
orçamento mensal com carência e modo bloquear; circuit breaker de ferramentas;
10 gates de `before_send` versionados; handoff/revisão humana; pause/resume/cancel
de agente e follow-up.

**Ausente ou parcial:**

| # | Lacuna | Onde |
|---|---|---|
| I1 | **Run não auditável ponta a ponta**: sem entrada, system prompt, contexto RAG ou fontes persistidos | `lib/database.types.ts:224-249`; `RunTrace.tsx:22` |
| I2 | `pnpm audit:run` prometido no comentário e **não existe** | `guardrails/before-send.ts:25` vs `package.json` |
| I3 | Botão “Testar” roda runtime **deprecated sem guardrails** | `avaliar-resposta-de-teste.ts`; `.../test/route.ts` |
| I4 | Teto por turno só no runtime legado | `lib/ai/runtime/agent.ts:519` |
| I5 | Eval não reproduzível: golden-candidates é diretório de arquivos | `workers/agent-worker/main.ts:548` |
| I6 | Aplicar proposta **publica sem segunda aprovação** | `lib/ai/apply-proposal.ts:163` |
| I7 | Rotas de IA sem `Idempotency-Key` | `app/api/v1/ai/**` |
| I8 | Jailbreak é advisório; injeção indireta sem gate determinístico | `guardrails/jailbreak/classifier.ts:6-10` |
| I9 | Sem retry/backoff de run na UI | `ai/agents/[id]/pause/route.ts` |
| I10 | `before_send_traces` existe mas não aparece no drawer do run | `channel-sessions/[id]/route.ts` |

## 4. Configurações, equipe, LGPD e admin (5.10/5.11)

**Guarda no servidor (medido):** tokens de API e billing exigem admin; marca
exige admin/platform; LGPD exige admin/platform; pipelines manager; `/admin/**`
exige `platform_admins` ativo + AAL2 (`requirePlatformAdmin.ts:45-61`).
**Equipe não tem guarda de página** (`team/page.tsx:42`): viewer vê membros e
e-mails; só a gestão é escondida.

**Tokens:** hash SHA-256, plaintext uma vez, revogação idempotente + audit.
**Problemas:** escopo é string livre e **expiração é opcional** (imortal por
padrão) — `schemas/team.ts:112-113`; validação de revogado/expirado só no MCP
(`lib/mcp/auth.ts:104-108`).

**LGPD:** exportar/anônimo admin; SLA 7/15 dias úteis; retenção 30–3650;
consentimento existe no tipo, mas não há gate no fluxo de pedido (INFERIDO).

**Admin:** impersonação TTL 1h e auditada no início/fim; suspender/reativar
exigem motivo e auditam. **Problemas:** `platform_admins.scope` é lido e **nunca
aplicado**; impersonação permite tenant **suspenso**; ações durante impersonação
não recebem `acting_as_platform_admin`; `void audit(...)` fire-and-forget nas
rotas admin; billing é placeholder mas aparece no menu; a tela de atualização usa
o snapshot `is_platform_admin` e ignora `revoked_at`.

**Marca branca:** banco acima do env (`platform_branding` /
`organizations.settings.branding`); env é semente. Ainda fixo:
`DEFAULT_APP_NAME="NEXUS"` e o SSR do login lendo `.env` (`lib/branding.ts:20,63-79`).

## 5. O que foi corrigido nesta rodada

| Correção | Onde |
|---|---|
| **Platform admin não pula o MFA** (aal1 barrado; aal2 e sem-fator passam) | `lib/auth/require-role.ts` + 3 testes |
| **Último erro da SEFAZ visível na porta do módulo** (era lido e nunca renderizado) | `app/app/fiscal/page.tsx` |
| **Emissão de NF-e pede confirmação** com destinatário/documento/total | `app/notas/_components/EmitirNota.tsx` |
| **Entregar e tirar da carga pedem confirmação** (A8 completo) | `app/app/expedicao/[id]_client.tsx`, `_motorista.tsx` |

## 6. O que fica aberto (por prioridade)

**P0:** I1 run trace (sem entrada/contexto/fontes não há auditoria de IA);
`platform_admins.scope` não aplicado; impersonação de tenant suspenso; I3 testar
sem os guardrails de produção.

**P1:** F1–F4 confirmações fiscais; F5 Idempotency-Key; F6 limit 300; I2
`audit:run`; I4 teto por turno no worker canônico; I6 segunda aprovação de
proposta; I7 Idempotency-Key; I8 gate determinístico de injeção; tokens com
expiração padrão; auditoria de ações durante impersonação; guarda da página de
Equipe.

**P2:** F7 retry de sync; F8 simetria de `ignorar`; capacidade de canal honesta
(templates/grupos/sticker/location); prioridade/SLA/macros/presença/reenvio no
Inbox; UI de consentimento/opt-out na campanha; billing placeholder fora do menu;
marca fixa no SSR do login.

**Não medido:** comportamento ao vivo do sidecar fiscal (656 real), presença em
tempo real de atendente (não existe no modelo), e eval de qualidade com dataset
versionado (não existe).
