# NEXUS 2.0 — API (`/api/v1/`)

> 307 rotas v1 + `internal/agents/run` + `mcp`. Padrão canônico já existe — preservar e estender.

## 1. Padrões obrigatórios (já implementados)

- **Wrapper**: `lib/api/wrappers.ts` — `ok(data, {requestId, meta})` → `{data, meta?}` + `X-Request-Id`; `fail(code, message, details?)` → `{error:{code,message,details?}}`. 219 usos.
- **Erros**: `lib/api/errors.ts` (`ApiErrorCodes`): `invalid_request`, `validation_failed`, `invalid_cursor`, `unauthenticated/unauthorized/token_expired/revoked`, `forbidden*`, `not_found`, `agenda_*` (7), `idempotency_conflict/state_conflict/invalid_state`, `rate_limited`, `payload_too_large`.
- **Paginação**: cursor+limit (`cursor`, `has_more`, `total?`, `CursorMeta`). Ex.: `contacts/route.ts:42-67`.
- **Auth/tenant**: `supabase.auth.getUser()` → `loadAuthUser()` → `resolveActiveOrg()` → `organization_id`. Guard `requireRole(min)` (`viewer1<agent2<ai_operator3<manager4<admin5` + `is_platform_admin`).
- **Tipos**: `lib/api/types.ts` + `wrappers.ts` (`ApiSuccess<T>`, `ApiError`).

## 2. Toda operação respeita (checklist §10)

`authentication → authorization → validation (Zod) → tenant isolation → business rules → audit → consistent response/errors`. Novos endpoints sem `requireRole` + `resolveActiveOrg` + `ok/fail` são rejeitados em review.

## 3. Domínios (58 pastas v1)

`ai:63` (agents, routers, memory, knowledge, skills, usage, evolution, followups) · `cron:23` · `admin:21` · `conversations:19` · `leads:13` · `shipments:13` · `prospecting:10` · `contacts:9` · `webhooks:9` (waha, meta, channel, nuvemshop, in) · `invoices:8` · `pipelines:7` · `financeiro:7` · `team/agenda/commercial-orders:6` · `products/channels/automation-rules/system/lgpd:5` · resto 1–4.

## 4. Gaps NEXUS 2.0

1. **Criar**: `/api/v1/sales-brain/*` (recomendações, quem/porquê/quando/o-quê/como), `/api/v1/orchestrator/*` (decisões, approvals), `/api/v1/inventory/*`, `/api/v1/purchasing/*`, `/api/v1/routes/*` (otimização), `/api/v1/cashflow/*`, `/api/v1/copilot/*` (contextual por página).
2. **Saúde**: `GET /api/v1/health` existe (supabase+redis+waha, timeout 3s, `version`, `200/503`). Manter fora do `healthcheck:` do compose (TCP probe — desenho deliberado).
3. **E2E por domínio**: path filtering no CI (pedidos→e2e pedidos, inbox→whatsapp, financeiro→financeiro). Hoje `ci.yml` sem `paths`.
