# NEXUS 2.0 — Security

> Postura atual forte — preservar e fortalecer (§13). Auditoria factual abaixo.

## 1. Borda

- `proxy.ts` (Next 16 — **não existe `middleware.ts`**): matcher exclui `_next/static`, `getUser()` (nunca `getSession()`), `X-Request-Id`, `isPublicPath()` early-return, `401 JSON` p/ `/api/*` vs redirect `/login`, RPC `fn_is_platform_admin` p/ `/admin/*`, impersonate HMAC edge.
- Públicas (`lib/auth/public-paths.ts:15`): `/api/v1/health`, `/webhooks/*`, `/cron/*`, `/system/agent`, `/system/relogio/tick`, callbacks OAuth Google/Nuvemshop, `/api/internal/*`, `/api/mcp/*` (+ testes).

## 2. Auth / RBAC

- `lib/auth/*` (17 arquivos): `require-role.ts` (guard canônico `requireRole(min)` via `fn_user_role_in_org` + audit `authz.denied` + MFA sessão), `requirePlatformAdmin.ts`, `server.ts` (`loadAuthUser/resolveActiveOrg/mfaEmDivida`), `politica-mfa.ts`, `rate-limit.ts` (login/signup/recovery/invite por IP+hash, fallback memória), `invite-token.ts`.
- Roles (`lib/auth/types.ts:22`): `viewer(1) < agent(2) < ai_operator(3) < manager(4) < admin(5)` + `is_platform_admin` transversal (opt-in `allowPlatformAdmin`).
- MFA **opcional por política** (`platform_admins.mfa_required` + `organizations.settings.security.mfa_required`, default false) + `MfaEnrollGate/Modal` + `reset-mfa.sh`.

## 3. RLS / multi-tenancy

- `fn_user_role_in_org` única p/ RLS e `requireRole`. 84 enables / 183 policies (`tenant_isolation_*_all`).
- Invariantes: `tests/invariants/*rls*.test.ts`, `agenda-nenhuma-tabela-sem-rls`, `hardening-definer-varredura`.
- Todo worker/cron/webhook/job/IA filtra `organization_id`. Nenhum agente cruza tenant.

## 4. LGPD

- `lib/lgpd/*` (12: `redact-cascade`, `export-collector`, `pdf-renderer`, `sla-alarm`, `mask`…), `LGPD_SIGNING_KEY`/`DPO_EMAIL`, PDF sem marca (controlador+DPO), `lgpd_requests` + `storage_redaction_queue`, workers `lgpd-export/redact`, cron `lgpd-sla-watcher`, UI admin+tenant.

## 5. Segredos (§83)

Nunca na imagem: `DATABASE_URL`, API keys, tokens, senhas, service keys, credenciais fiscais, WhatsApp tokens. Runtime via `env_file:.env` + `<PublicEnvScript/>`/`lib/env.ts` (build usa `NEXT_PUBLIC_*=placeholder`). `.dockerignore` bloqueia `.env*`.

## 6. Auditoria (§66)

`api_audit_log`, `audit/*` (admin + tenant), `authz.denied`, handoff audit, `before_send_traces`, `llm_calls`, AI Decision Log (a criar — ver `ai.md`). Ações críticas auditadas: login, financeiro, pedidos, descontos, aprovação, fiscal, IA, permissões, config.
