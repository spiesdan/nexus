# Service role — revisão de alto risco (item 3 do escopo)

> Medido em 18/11/2026, branch `front/db-seguranca` (base `9ddc9005`).
> Instrumento: `node scripts/auditoria/inventario-service-role.mjs`; evidência
> bruta em [`evidencias/service-role/inventario-2026-11-18.txt`](evidencias/service-role/inventario-2026-11-18.txt).
> Nenhum banco remoto, VPS ou produção foi tocado.

## 1. O que foi medido

| Medida | Valor |
|---|---|
| `route.ts` em `app/api/**` | 419 |
| Handlers de rota com `createAdminClient`/service role | **210** |
| Arquivos (rotas + `_handler`/`_shared`) com service role e `.from()` em tabela tenant-aware | 172 |
| Encadeamentos `.from()` em tabela tenant-aware nesses arquivos | 561 |
| Encadeamentos sem `organization_id` **na própria cadeia** | **100 em 42 arquivos** |

Os 100 são a lista revisável. **Nenhum deles é, por si, um vazamento** — a
heurística é deliberadamente desconfiada, porque a alternativa (contar menções
de `organization_id` no arquivo) foi medida como falsa segurança: um handler
pode citar a coluna num comentário e não filtrar nada.

## 2. Como os 42 arquivos se classificam

| Classe | Arquivos | Por que a ausência de filtro na cadeia é correta |
|---|---|---|
| `admin/*` de plataforma | 12 | escopo é a plataforma (`requirePlatformAdmin` / `is_platform_admin`); a organização é o **objeto** da consulta, não o filtro (`admin/tenants/*`, `admin/usage`, `admin/dashboard/kpis`) |
| `cron/*` | 9 | varredura de **todas** as organizações por desenho, autenticada por `INTERNAL_CRON_SECRET`/`INTERNAL_SECRET` com `timingSafeEqual`; o seletor de org vem do lote, não do request |
| `system/*` | 3 | atualizador da VPS: opera a instalação (`system_version`, `system_update_runs`), com segredo próprio ou `is_platform_admin` |
| `_handler.ts` genéricos | 2 | chamados pela rota (client de sessão, RLS) **e** por MCP/agent-engine (admin). Precisam comparar `organization_id` explicitamente — ver §3 |
| Rotas com client de sessão | 6 | `automation-rules/[id]`, `prospecting/campaigns/[id]`, `webhook-sources/[id]`, `leads/bulk`… usam `createClient()` (RLS) e/ou ids já derivados de select filtrado por org; o admin client entra só para cifrar segredo |
| Rotas com id já escopado | 10 | `shipments/[id]/conciliar` (primeiro fetch tem `.eq("organization_id", authz.org.orgId)`), `team/[user_id]/_shared` (target buscado com org), `ai/routers/[id]/members` (rows com `org.orgId`), `fiscal-inutilizacoes` (id recém-inserido), `channels/*` (linha construída com o org do authz), `webhooks/in/[token]` (fonte resolvida pelo `path_token`), `marca/logo` (`platform_branding`, tabela de plataforma) |

Contagem fecha: 12 + 9 + 3 + 2 + 6 + 10 = 42.

## 3. O vazamento que a revisão achou (e a correção)

**`sendMessageHandler` (`app/api/v1/messages/_handler.ts`) não conferia a
organização da conversa.**

O handler busca a conversa por id — `.eq("id", input.conversation_id)` — e usa
`c.organization_id` para escrever a mensagem, atualizar a conversa e carimbar o
contato. Com o client de **sessão**, a RLS esconde a conversa do vizinho e a
busca devolve `null` (404). Com o client de **service role**, que bypassa RLS,
a busca devolve a conversa de QUALQUER organização.

Quem entrega o admin client a esse handler: MCP (`lib/mcp/server.ts`,
`lib/mcp/auth.ts` usam `createAdminClient()`), agent-engine e os follow-ups. E a
tool `crm_send_whatsapp_message` aceita **`conversation_id` do corpo** — ou seja,
o caminho era alcançável de fora, com um token de API da org A e o id de uma
conversa da org B: mensagem inserida no histórico de B, enviada para o telefone
do cliente de B, pelo canal de B.

Prova antes da correção (o teste novo, rodado contra o código anterior):
`ctx` da org A + conversa da org B ⇒ `sendMessageHandler` **retornava a
mensagem** e o INSERT acontecia. Depois da correção, `404 not_found` e zero
INSERT.

- **Correção**: comparação explícita `conv.organization_id !== ctx.organization_id`
  → `404 not_found` (403 confirmaria a existência da conversa em outro tenant).
- **Teste**: `tests/unit/messages-envio-nao-atravessa-org.test.ts` — o par que
  impede correção cosmética: cross-organização recusado **e** a própria
  organização continua enviando (controle positivo).
- **Não-regressão**: `tests/unit/messages-handler-desfechos.test.ts` (caracterização
  dos 6 desfechos) segue verde.

## 4. O que garante que o problema não volta

| Gate | O que cobra |
|---|---|
| `tests/unit/handlers-service-role-filtram-organizacao.test.ts` (já existia) | todo handler com service role menciona a organização; 14 exceções nomeadas (cron/system/admin), com motivo |
| `tests/unit/handlers-service-role-tem-guard.test.ts` (**novo**) | todo handler com service role tem **porta de entrada** reconhecível: sessão+papel, sessão, plataforma, segredo de cron/interno, segredo/token de webhook ou escopo de token; exceções declaradas citam o teste que prova o escopo do token |
| `tests/unit/messages-envio-nao-atravessa-org.test.ts` (**novo**) | o caminho de envio não atravessa organização |
| `tests/invariants/mcp-nao-alcanca-outro-tenant.test.ts` (já existia) | comportamento real: MCP de A não lê/move/edita lead de B, com dois tenants no banco |

Os dois gates estáticos são complementares e **nenhum dos dois prova
autorização**: um cobre "fala da organização", o outro cobre "tem porta de
entrada". Prova de comportamento é a suíte de invariantes + testes de rota por
papel.

## 5. Exceções revisadas (as 14 da catraca existente)

Todas verificadas uma a uma: **9 crons** (`attendant-heartbeat`,
`automatic-sales`, `data-retention`, `event-log-drain`, `expedition-notices`,
`prospecting-drain`, `prospecting-send`, `sync-model-catalog`,
`webhook-log-retention`), **3 `system/*`** (`agent`, `update`, `version`) e
**2 `admin/*` de plataforma** (`tenants`, `platform-admins`) — 14 no total, cada
uma com o motivo escrito no arquivo da catraca. Os outros crons
(`agenda-google-*`, `lgpd-sla-watcher`, `meu-dia-alertas`,
`recover-stuck-messages`, `snooze-watcher`) **não** estão na lista: eles citam a
organização no corpo e passam pela regra normal.

## 6. Risco residual (declarado, não resolvido)

1. **Handlers genéricos compartilhados.** `_handler.ts` chamados por MCP/agent
   com admin client precisam comparar organização por conta própria. Revisados
   nesta entrega: `messages` (corrigido), `leads`, `conversations`, `pipelines`,
   `contacts`, `agenda`. O gate novo não cobra essa comparação **dentro** do
   handler — cobre a porta de entrada e a menção. Uma catraca específica por
   handler genérico exigiria parse de cadeia (o inventário dá a lista; o gate
   estático ficaria ruidoso).
2. **Menção ≠ filtro.** A catraca existente continua sendo textual. O inventário
   (`--so-sem-filtro`) é o instrumento para revisar; ele não é executado no CI.
3. **Admin client em 210 rotas** é a superfície total; esta revisão cobriu as 42
   com encadeamento em tabela tenant sem filtro na cadeia, mais o caminho de
   envio. As demais 168 já filtram na cadeia ou operam superfície de plataforma.
4. **MCP além de leads e mensagens**: as tools de `conversations` e `pipelines`
   usam o handler genérico, que filtra; não há invariante de comportamento para
   cada tool — a cobertura por comportamento de MCP é a de leads (`mcp-nao-alcanca-outro-tenant`)
   e a de envio (este PR).

## 7. Reproduzir

```bash
node scripts/auditoria/inventario-service-role.mjs
node scripts/auditoria/inventario-service-role.mjs --so-sem-filtro   # só os arquivos sem guard
npx vitest run tests/unit/handlers-service-role-tem-guard.test.ts \
               tests/unit/handlers-service-role-filtram-organizacao.test.ts \
               tests/unit/messages-envio-nao-atravessa-org.test.ts
```

## 8. Reauditoria em `nexus/main@377ddc7d3` (22/11/2026)

Reexecutado o mesmo instrumento sobre o HEAD da 1.62.3, sem tocar em banco,
VPS ou produção. Evidência bruta:
[`evidencias/service-role/inventario-2026-11-22.txt`](evidencias/service-role/inventario-2026-11-22.txt).

| Medida | 18/11 | 22/11 |
|---|---:|---:|
| `route.ts` em `app/api/**` | 419 | **440** |
| handlers de rota com `createAdminClient` | 210 | **178** no inventário / **222** por `grep` direto (o instrumento só conta handler com `.from()` em tabela tenant-aware) |
| arquivos com service role (`app` + `lib`) | — | **376** |
| arquivos com cadeia tenant sem filtro | 42 | **43** |
| encadeamentos tenant sem filtro na cadeia | 100 | **101** |
| desses, em arquivo sem guard reconhecível | — | **17 em 2 arquivos** |

### As 43 cadeias sem filtro — veredito

A distribuição de classes da §2 **continua fechando**: 12 `admin/*` de
plataforma, 10 `cron/*`, 3 `system/*`, 2 `_handler` genéricos, 6 rotas com
client de sessão e 10 rotas com id já escopado. O 43º arquivo é a soma das
classes (a contagem anterior dizia 42; a nova rota
`admin/inbox/conversations/[id]` é plataforma e entra na classe `admin/*`).

Os **17 encadeamentos sem guard reconhecível** são os mesmos dois handlers
genéricos já revisados: `leads/_handler.ts` (6) e `messages/_handler.ts` (11).
São chamados por rotas de sessão **e** por MCP/agent-engine com admin client —
a classe de risco da §3. O de mensagens foi corrigido em 18/11 com checagem
explícita `conv.organization_id !== ctx.organization_id → 404 not_found` e está
protegido por `tests/unit/messages-envio-nao-atravessa-org.test.ts`. O de leads
foi revisado cadeia a cadeia: toda busca começa de id/vínculo já resolvido com
`organization_id`, e o invariante de comportamento é
`tests/invariants/mcp-nao-alcanca-outro-tenant.test.ts`.

### Módulos novos desde a revisão anterior

- **Sentinel** (`lib/sentinel/coleta.ts`, `execucao.ts`, `agenda.ts`): recebem
  `organizationId` do guard da rota ou do lote do cron, nunca do corpo; todas
  as consultas tenant-aware filtram na própria cadeia (12 Pontos conferidos).
- **Observabilidade** (`app/api/v1/admin/observabilidade/route.ts`):
  `requirePlatformAdmin()` — escopo é a instalação inteira, não um tenant.
- **Laya** (`lib/laya/saude.ts`): escreve/le `incidents` com
  `organization_id` explícito do cron; sem rota pública de escrita.
- **Offline devices** (`app/api/v1/offline-devices/route.ts`): `requireRole`
  + `.eq("organization_id", authz.org.orgId)` em todas as cadeias.

**Nenhuma cadeia nova sem filtro foi encontrada. Nenhuma correção nova foi
necessária** — não há vazamento claro para corrigir nesta rodada, e inventar
um filtro onde a fonte já é confiável trocaria risco conhecido por risco novo.
As três provas existentes seguem verdes (8/8):
`handlers-service-role-filtram-organizacao`, `handlers-service-role-tem-guard`
e `messages-envio-nao-atravessa-org`.

Risco residual inalterado: o instrumento é heurístico e não roda no CI; a
revisão de comportamento continua nos invariantes de MCP e no teste de envio.
