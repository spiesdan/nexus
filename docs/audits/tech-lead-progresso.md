# Tech Lead — progresso da auditoria contínua

## REGRA ABSOLUTA DE OPERAÇÃO (não parar)
Antes de encerrar qualquer resposta, verificar: há trabalho útil e seguro
que não depende de resultado pendente (baseline, subagentes)? Se sim,
EXECUTAR em vez de encerrar. Só encerrar quando o único trabalho restante
aguardar callback externo — e nesse caso dizer exatamente o que está
pendente e o que será feito ao retomar. Nunca encerrar por preguiça de
continuar a auditoria: sempre existe próximo vetor (F3 A–G) ou correção
P0/P1 para avançar.

Regra: nunca pedir permissão para passos de baixo risco; avançar sempre.
Sem push, sem deploy, sem commit automático. Arquivos do usuário preservados.

## Estado inicial (2026-10-15)
- Branch: `main` @ `4ed9268a5` (merge #179 — bomba-relógio janela-do-dia)
- Árvore limpa, exceto 2 untracked do usuário (NÃO TOCAR):
  - `scripts/importar-produtos-odivix.ts`
  - `scripts/importar-prospecao-maps-scraper.ts`
- PR #179: todos os checks verdes após rerun (flake `next/font` no Docker).

## Ciclo
[ ] F0 — estado protegido (ok, ver acima)
[ ] F1 — mapa do projeto (parcial: AGENTS.md + lib/ai + agent-engine já lidos)
[ ] F2 — baseline: `gov:verify` / `test:db` / build
[ ] F3 — auditoria profunda (A–G)
[ ] F4 — priorizar + executar (P0→P3)
[ ] F5 — testes e validação por correção
[ ] F6 — melhorias estruturais
[ ] F7 — docs + relatório final

## Achados
(nenhum ainda — registrar como P0/P1/P2/P3 com evidência + arquivo:linha)

## Triagem F1/F3 (2026-10-15, sem achado — verificado, não presumido)
- `getSession()` no backend: só docs/comentários; zero uso em código. OK.
- `console.log(` em `app|lib|components`: só `lib/logger.ts` (wrapper canônico) + exemplos em comentário. `no-console` no eslint permite warn/error/info. OK.
- `new Response(` em rotas: 11 usos, todos binário/CSV/mídia/SSE/export (ex.: media, avatar, audit/export, import) — `ok()/fail()` é para JSON. OK, sem achado.
- Rate limit: `authRateLimited` cobre login/signup/reset/invite_accept (4/4 do doc); `checkRateLimit` no webhook de captação + dispatcher IA; crons/MCP sem — confere com AGENTS.md. OK.
- `invite-token.ts:16` dev-fallback: inalcançável em prod (`INTERNAL_SECRET` required em `lib/env.ts:95`, derruba boot). OK.
- Próximo vetor: handlers com service role sem filtro `organization_id` (89 rotas, sem gate — auditoria manual por rota).

## Log
- 2026-10-15: missão iniciada. main atualizada p/ 4ed9268a5. Baseline `gov:verify` em execução.
- 2026-10-15: triagem batch 2 — rate-limit/invite-token/.env/public-paths/MCP/internal/Sentry/.env rastreado: tudo confere, sem achado. P3: docs dizem idempotency em "1 rota" mas há 2 (`lgpd/requests/[id]/approve` + `financeiro/recebiveis/[id]/pagamentos`) — drift de doc (AGENTS.md:244, ARCHITECTURE.md:32).
- 2026-10-15: `branding.test.ts` 29 passed (marca própria íntegra).
- Frentes em background: baseline gov:verify + subagente service-role + subagente validação-de-rotas.
- 2026-10-15: baseline `gov:verify` → 8513 passed, 3 failed SÓ em `rate-limit.test.ts` ("contador em memória"): teste presumia fallback em memória, mas `.env.local` tem Upstash real → `incr` ia ao Redis e o mapa ficava vazio. Pré-existente e ambiental (CI sem credencial passa). FIX: mock de `@upstash/redis`+`@/lib/env` no teste (precedente em `rate-limit-misconf.test.ts`) → 19 passed nos 4 arquivos de credenciais/rate-limit.
- 2026-10-15: P1 service-role corrigido — `ai/credentials/route.ts:109` POST re-lia view sem `.eq organization_id` → adicionado. Testes credenciais 11 passed.
- 2026-10-15: P1 rethrow/throw→`fail()` corrigidos — `webhooks/in/[token]:548` (`throw err` → `fail internal_error 500`), `onboarding/whatsapp/session` (ensure sem try → `fail internal_error 500`; `NextResponse.json waha_start_failed` → `fail upstream_unavailable 502`, import removido), `webhooks/meta/[token]:158` (`NextResponse.json` → `ok()` com mesmos campos). tsc+eslint limpos nos 5 arquivos.
- 2026-10-15: P1 #1 `partner/templates` POST sem schema → schema Zod (`acao` enum, `category` enum, `components` array, `criar` exige nome/idioma/conteúdo; ação desconhecida = 422, antes sincronizava silencioso). tsc+lint limpos, `templates-do-parceiro` 38 passed (inclui guarda de fonte `corpo.acao === "criar"` preservada).
- 2026-10-15: P2 #14 `arquivar-todas` verificado — `confirmar !== true` já é fail-closed estrito; rebaixado, sem mudança.
- 2026-10-15: padrão rethrow (`throw err` após `ApiError` → 500 HTML fora do envelope) eliminado nas 48 ocorrências em `route.ts` (46 via script + `bulk-tag` loop + `cases/reply` transação, ambas revisadas à mão). `throw err` restante em rotas: 0. tsc projeto inteiro limpo.
- 2026-10-15: P2 #25/#27 envelope — `health` (`NextResponse.json` → `ok()`, mesmo corpo `{data}`; `OkOptions.status` estendido p/ 503 só do health) + 3 crons agenda-google (7 trocas → `ok()`/`fail()`). tsc+lint limpos.
- 2026-10-15: P2 cat4 (códigos fora do catálogo): rename DIRETO é quebra de wire — `conflict` é comparado em `commercial-orders/route.ts:124-127`. Medido: 52 fora do catálogo. Em vez de renomear, criei o gate `tests/unit/api-error-codes.test.ts` (allowlist herdada que só encolhe, padrão `branding.test.ts`) → 2 passed.
- 2026-10-15: re-`gov:verify` pós-correções → 8515 passed, 2 failed (eram 3; rate-limit zerado). Restantes a identificar.
- 2026-10-15: falha 1 era MINHA (`ai-cases-routes` travava o throw no rollback): teste atualizado p/ o contrato novo (500 `internal_error` + rollback + release preservados) — comportamento validado, teste desatualizado.
- 2026-10-15: falha 2 pré-existente e ambiental (`certificado-a1`: `.env.local` define `FISCAL_CERTS_DIR` p/ temp do macOS; CI sem ele passa). FIX hermético (stubEnv + import dinâmico, mesmo padrão). 28 passed nos 3 arquivos.
- 2026-10-15: P2 #15 uploads verificados um a um — todos validam: products/images (size + magic bytes), conversations/media (size + MIME), partner/templates/media (allowlist + 5MB), fiscal/certificado (delega a `decidirCertificado`, testado), invoices/xmls (300 arq + 30MB), proof (magic bytes + 10MB). Sem mudança.
- 2026-10-15: crons verificados: 100% referenciam `INTERNAL_CRON_SECRET` (+ fallback `INTERNAL_SECRET`), fail-closed sem segredo. Comparação é `===`/`includes` (não `timingSafeEqual`) — P3 documentado (oráculo de timing impraticável aqui; trocar 25 rotas = risco sem ganho).
- 2026-10-15: `test:e2e:smoke` VERDE (32 passed) após instalar Chromium. Falhas anteriores eram só browser ausente.
- 2026-10-15: `prospeccao-mapa.spec.ts` VERDE (1 passed) após corrigir seletor ambíguo pré-existente (aba "Encontrar empresas" da fase 6). Rodou no bundle sem o fix (vale como regressão); prova visual do fix do travamento pendente do usuário.
- 2026-10-15: o gate novo quebrou o `typecheck` (`m[1]` e `Set<literais>` sob `noUncheckedIndexedAccess`): corrigido (`as string`, `Set<string>`). tsc limpo. `gov:verify` relançado.
- 2026-10-15: workers auditados (subagente): 0 tenant-scope issues, teto de retry global OK. 11 achados.
- 2026-10-15: **P0 `lgpd-redact-worker` tenant (offset sobre conjunto mutável pulava ~100 contatos/lote)** + P1 (org marcada `redacted` com pendências) CORRIGIDOS: loop sem offset + exclusão de falhas da seleção + retry dos falhados na próxima execução + flip da org só com zero falhas. Regressão `lgpd-redact-tenant.test.ts` (250 contatos + falha persistente) com prova RED (2 falhas no antigo) e GREEN. tsc+lint limpos.
- 2026-10-15: P1 `ai-response-worker` (retry reinseria outbound) CORRIGIDO: âncora `metadata.inbound_message_id` + checagem pré-insert. Regressão `ai-response-worker-dedup.test.ts` com RED (2 falhas) e GREEN.
- 2026-10-15: P2/P3 workers: `console.*` → `logger` estruturado com `organization_id` (sentiment 3, rag-indexer 8, + header atualizado); `organization_id` adicionado aos logs de falha permanente (response/media); `markStatus` do media-persist re-lê metadata antes de fundir (lost update estreitado a ms, risco residual documentado).
- 2026-10-15: diff total 59 arquivos (+391/−178), revisado por amostragem (bulk-tag, contacts, conversations, credentials) — só as trocas intencionais. Re-`test:unit` completo rodando p/ caçar as 3 falhas (meus 8 testes passam isolados).
- 2026-10-15: as 3 falhas eram no teste IRMÃO (`sent-via`): o stub devolvia a linha inbound p/ qualquer `maybeSingle` e a dedup entendia "já respondido". Stub corrigido p/ honrar o filtro de metadata (cenários dele não têm outbound prévia). 9 passed nos 3 arquivos do worker, tsc limpo. `gov:verify` final relançado.
- 2026-10-15: **`gov:verify` VERDE TOTAL: 806 arquivos, 8525 passed.** F2/F5 concluídos p/ unit. Falta: `test:db` (Docker) e `test:e2e` (app+DB).
- 2026-10-15: **`test:db` VERDE: 150 arquivos, 1368 passed** (RLS + baseline install/update). Todos os gates locais verdes. `pnpm build` lançado (valida bundle prod com as rotas alteradas).
- 2026-10-15: build local OOM com heap default (~2GB) — ambiental, não regressão (`Dockerfile:39` exige 4GB). Relançado com `NODE_OPTIONS=--max-old-space-size=4096` → **EXIT=0**. Validação completa: typecheck + lint + 806 unit + 150 invariants + build prod.
