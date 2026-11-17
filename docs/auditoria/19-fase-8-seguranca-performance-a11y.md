# Fase 8 — segurança, performance e acessibilidade (e os itens 3.1, 3.14, 7.7, 7.10, 7.12)

> **Método:** quatro leituras paralelas do código + duas medições executadas
> (`pnpm audit --prod` e build de produção), em 2026-11-17, depois da 1.54.0.
> O que exige runtime está marcado como **não medido**. Cada achado tem
> `arquivo:linha`.

## 1. Segurança e isolamento (8.1 / 8.2)

**Controles que passam (medidos):**
- `getUser()` em toda borda; o único `getSession()` é o `realtime-token`, que
  valida `getUser()` antes (`app/api/v1/auth/realtime-token/route.ts:52`).
- Cookie de sessão `httpOnly` + `sameSite: "strict"` + `secure` + 30d
  (`lib/supabase/server.ts:38-41`; `proxy.ts:59-65`).
- **129/129** funções `security definer` com `search_path` fixado.
- MFA como política de sessão dentro do `requireRole` — inclusive para platform
  admin (corrigido na 1.54.0) — e AAL2 no `/admin`.
- Impersonação: HMAC + `timingSafeEqual` + 1h + `HttpOnly/Secure/Lax`, escopo
  aplicado, tenant suspenso bloqueado, 503 fail-closed sem secret.
- Webhooks: HMAC com comparação constante, dedupe por `(organization_id,
  external_id)`, mídia reconstruída sobre host confiável
  (`lib/messaging/media/waha-source.ts:28-40`).
- SSRF de saída: guard textual + resolução DNS julgada + `redirect: "manual"`
  (`lib/automation/outbound-url.ts:22`, `outbound-ip.ts:106-131`).
- Egress allowlist para todo HTTP do runtime do agente
  (`lib/agent-engine/edge/egress.ts`).
- Upload: tipo por bytes mágicos, nome `randomUUID`, buckets com
  `file_size_limit` + `allowed_mime_types` + policy por org.
- Sentry higieniza evento, transação, span e breadcrumb
  (`lib/sentry/scrub.ts:153-170`).
- `javascript:` bloqueado em redirect e link de política
  (`lib/auth/safe-next.ts:16-23`).
- RAG sempre com `organization_id` explícito no ingest e na busca.

**P1 — abertos**

| # | Achado | Onde |
|---|---|---|
| S1 | **40 handlers** usam admin client sem a string `organization_id`; não há gate automático — o filtro é responsabilidade do autor | `app/api/v1/ai/cases/route.ts:42`, `leads/at-risk/route.ts:50` (+38) |
| S2 | **73 tabelas tenant-aware** sem prova comportamental cross-org; dívida declarada, não resolvida | `tests/invariants/rls-completude-varredura.test.ts:227-301` |
| S3 | Webhook do WAHA aceita payload **sem assinatura** por padrão (`WAHA_WEBHOOK_REQUIRE_SIGNATURE` = `false`); mitigado por a rota global não estar exposta no Caddy | `lib/waha/webhook-auth.ts:15-27` |
| S4 | `AUTH_LIMITS.invite_accept` **declarado e nunca chamado** — o `AGENTS.md` afirma que convite tem rate limit | `lib/auth/rate-limit.ts:140` vs `app/actions/team/acceptInvite.ts:25` |

**P2 — abertos (amostra medida)**

- Recovery code e `verifyMfa` **sem throttle** (`useRecoveryCode.ts:55-101`;
  lock só no login por senha).
- `listUsers({ perPage: 200 })` pagina só a primeira página
  (`useRecoveryCode.ts`) — bug funcional em bases grandes.
- MCP e crons sem rate limit (declarado como limitação).
- Webhooks sem janela anti-replay/timestamp (replay não duplica mensagem).
- Catálogos globais (`ai_models`, `ai_pricing`) com `GRANT ALL` a `anon`;
  deveria ser `SELECT` (`baseline.sql:4022-4033`).
- `dev-fallback` de HMAC em `invite-token.ts:16` e `orcamento-link.ts:45`
  (inalcançável em produção porque `INTERNAL_SECRET` é obrigatório).
- `public-paths` por prefixo sem âncora: rota nova em `/api/v1/webhooks/`,
  `/api/v1/cron/` ou `/api/internal/` nasce sem auth de borda
  (`lib/auth/public-paths.ts:11-13,36`).
- `void audit(...)` fire-and-forget em ~40 sites; crash entre a escrita e o
  evento perde a trilha.
- `select("*")` em 20 rotas devolve colunas além do que a tela usa.
- Rota pública `/api/v1/public/orcamento/[token]` sem rate limit.
- SSRF: segundo guard do raio-x tem tabela **mais frouxa** que o canônico
  (falta `100.64/10`, `198.18/15`, `224/4`, `192.0.2/24`)
  (`lib/prospeccao/raio-x-site.ts:90-176`); avatar de contato busca URL do
  payload sem reconstrução de host (`app/api/v1/cron/contact-avatars/route.ts:168`).
- Upload sem antivírus (nenhum scan no repositório).
- Jailbreak é **advisório** e não veta; injeção indireta não tem gate
  determinístico próprio (`guardrails/jailbreak/classifier.ts:7-25`).

## 2. Dependências — corrigido nesta rodada

`pnpm audit --prod` **antes**: 1 crítica, 7 altas, 20 moderadas.
**Depois**: **0 crítica, 1 alta, 1 moderada**.

| Pacote | Antes | Depois |
|---|---|---|
| `@sentry/nextjs` (crítica: bypass de middleware com tunnel route) | 10.71.0 | **10.78.0** |
| `zod` | 4.6.5 | 4.6.7 |
| `undici` | 7.30.0 | 7.30.2 |
| `body-parser` | 2.3.0 | 2.4.0 |
| `next` | 16.4.2 | 16.4.6 |
| `hono` / `@hono/node-server` | 4.13.13 / 2.1.4 | 4.13.19 / 2.1.9 |
| `fast-uri`, `seroval`, `qs`, `minimatch`, `glob`, `js-yaml`, `brace-expansion` | — | overrides para as versões corrigidas |

**Restam** (nenhum no caminho de execução do servidor):
- `picomatch` 4.0.7 — **não há versão corrigida publicada**; vem do rollup do
  Sentry (build).
- `uuid` 7.0.3 — vem da CLI do Capacitor (build); o advisory é sobre v3/v5/v6
  com buffer.

**Não existe gate**: o CI não roda `pnpm audit` e o Dependabot é semanal sem
critério de severidade (`ci.yml`, `dependabot.yml`).

## 3. Performance (8.3 / 8.4) — medido no `.next` de 17/11

| Área | Medida | Gargalo |
|---|---|---|
| `/app/inbox` | **386 KB gz** de JS cliente | **+54%** sobre o budget declarado de 250 KB (`next.config.ts:8`) |
| `/app/ai/agents/[id]` / `/new` | **1336 / 1322 KB gz** | um chunk de **1007 KB gz** = `gpt-tokenizer` importado estaticamente (`lib/ui/TokenCounter.tsx:3`) |
| `/app`, `/app/indicadores`, `/app/ai/evolution`, `/app/ai/usage`, `/app/radar`, `/app/pipelines/[id]` | 440 / 455 / 421 / 402 / 401 / 377 KB gz | `recharts` estático; só **2** `dynamic()` em `app/` |
| Mapas | **5,3 MB** em `.next/static/media` | builds **`-dev`** do maplibre publicados |
| Fontes | 59 `woff2`, **1,3 MB** | 2 famílias no layout raiz + 9 em `/design` |
| Queries | 11× `limit(10000)`, 11× `limit(5000)`, 21× `limit(2000)` | agregação em JS sobre milhares de linhas (`fiscal/page.tsx:52-65`, `relatorios/page.tsx:52-57`) |
| `count: exact` | 63 ocorrências (50 só contagem, **13** linhas+count) | contagem em tabela grande sem índice dedicado |
| Índices | `commercial_orders` sem índice para faixa de `total_cents`; `messages` sem `(org, contact_id, sent_at)` | varredura de tabela nos filtros |
| Listas | só **15** rotas com paginação; **0** virtualização | `/app/pedidos`, `/app/fiscal/*`, `/app/notas` têm teto silencioso |
| Workers | poll 2 s, reaper 60 s, cron 30 s; fila com `FOR UPDATE SKIP LOCKED` | **flywheel sem claim** → duas réplicas julgam o mesmo turno |
| Baseline | **não existe** relatório de LCP/CLS/INP/bundle | sem régua de regressão; `perf.yml` só imprime `du -sh` |

## 4. Acessibilidade (8.5)

- Gate axe existe para login + 7 telas (`tests/e2e/axe-telas-principais.spec.ts`)
  e roda **só na suíte do main**, não no smoke de PR.
- Usa as tags **WCAG 2.0/2.1** — `wcag22aa` e `target-size` nunca rodam.
- Só `serious|critical` bloqueiam.
- Uma exclusão conhecida ficou: `rbac-roles.spec.ts:140` ignora `tablist`.
- Contraste por token é vigiado (`tailwind-tokens.test.ts`, mínimo 4.5) e
  `prefers-reduced-motion` existe em 5 blocos.
- **Falta**: foco preso em diálogo (nenhum `FocusTrap`/`aria-modal`), reflow a
  200%, alvos de toque (nenhum gate <24px), axe nas outras ~90 telas.

## 5. Itens 3.1, 3.14, 7.7, 7.10, 7.12

| Item | Estado | Evidência |
|---|---|---|
| **3.1** identidade/marca | **parcial** | resolve do banco (`lib/branding.ts:89-91`), mas `DEFAULT_APP_NAME = "NEXUS"` fixo (`:20`); a catraca varre só `app/components/hooks/lib/workers` e **deixa de fora `mobile/` e `android/`** (`branding.test.ts:241,274`) |
| **3.1** vazamento real | **existe** | `mobile/index.html:6,15`, `mobile/www/index.html`, `mobile/src/shell.ts:26` (URL fixa), `android/.../strings.xml:3-6`, `capacitor.config.ts` (`appName: "Bill Higiene"`) |
| **3.14** densidade | **parcial** | regra escrita em `docs/design-system/04-density-aerada.md`; só a densidade Aerada existe (`globals.css:102-106`); Indicadores tem 5 gráficos na mesma tela |
| **7.7** sincronizado só com backend | **ok, sem violação** | pedidos (`mercos_sincronizado_em`), Nuvemshop (`status`/`last_sync_at`), expedição (`r.enviados`), offline (`r.aceitos`), Google declara indisponível. Falta gate de teste contra toast otimista novo |
| **7.10** domínio parametrizado | **parcial** | `APP_URL` configurável (`env.ts:454`) com usos corretos; **default `http://localhost:3000`** e fallback silencioso no callback da Nuvemshop (`:24`); `mobile/src/shell.ts:26` fixa o domínio |
| **7.12** iOS | **ausente** | `capacitor.config.ts` só tem bloco `android`; não existe `ios/` nem `@capacitor/ios`; PWA iOS sem `apple-touch-icon`/`apple-mobile-web-app-capable` |

## 6. O que fazer primeiro (entrada da Fase 10)

**P0:** nenhum novo — a crítica de dependência foi fechada.

**P1:** rate limit no aceite de convite e no recovery code (S4 + P2);
`gpt-tokenizer` fora do bundle estático; budget do Inbox (386 KB vs 250 KB);
flywheel com claim (julgamento duplicado custa IA); índice para os filtros de
`commercial_orders`/`messages`; índice único de avisos e `audit` não
fire-and-forget.

**P2:** SSRF do raio-x igualado ao guard canônico; avatar sem reconstrução de
host; `GRANT SELECT` nos catálogos globais; axe com `wcag22aa` + foco em
diálogo + reflow; marca do shell mobile parametrizada; `APP_URL` sem default de
localhost em produção.

**Não medido:** Core Web Vitals em runtime, `EXPLAIN` das queries, isolamento
cross-org executado, e o comportamento real de sessão após revogação de papel.
