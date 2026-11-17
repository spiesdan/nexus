# Integrações e infraestrutura

> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/inventario-completo.ts`.
> Fonte: `lib/, app/, workers/, .env.example, docker-compose.prod.yml`. Gerado em 2026-11-17T16:38:51.452Z. Não editar à mão.

## Integrações — quem é chamado de fora

| Integração | Arquivos que a citam |
|---|---|
| WAHA (WhatsApp) | 91 |
| Meta / WhatsApp Cloud | 43 |
| Nuvemshop / Tiendanube | 59 |
| Google (Agenda/OAuth) | 46 |
| IA (gateway e provedores) | 77 |
| Redis / Upstash (fila e rate limit) | 14 |
| E-mail (Resend) | 31 |
| Sentry | 20 |
| Mercos | 69 |
| Mapa (MapLibre / Nominatim / OSM) | 23 |

## Workers (`workers/`)

**16** arquivos.

- `workers/ai-handoff-from-sentiment.handler.ts`
- `workers/ai-response-worker.handler.ts`
- `workers/ai-response-worker.ts`
- `workers/ai-sentiment-worker.handler.ts`
- `workers/ai-sentiment-worker.ts`
- `workers/lgpd-export-worker.handler.ts`
- `workers/lgpd-export-worker.ts`
- `workers/lgpd-redact-worker.handler.ts`
- `workers/lgpd-redact-worker.ts`
- `workers/media-derive-worker.handler.ts`
- `workers/media-derive-worker.ts`
- `workers/media-persist-worker.handler.ts`
- `workers/media-persist-worker.ts`
- `workers/rag-indexer.handler.ts`
- `workers/rag-indexer.ts`
- `workers/storage-cleanup-worker.ts`

## Rotas de cron (`app/api/**/cron/**`) — 30

- `/api/v1/cron/agenda-google-push`
- `/api/v1/cron/agenda-google-refresh`
- `/api/v1/cron/agenda-google-sync`
- `/api/v1/cron/agent-dispatcher`
- `/api/v1/cron/attendant-heartbeat`
- `/api/v1/cron/automatic-sales`
- `/api/v1/cron/channel-health`
- `/api/v1/cron/contact-avatars`
- `/api/v1/cron/contact-phones`
- `/api/v1/cron/contact-proposals-watcher`
- `/api/v1/cron/data-retention`
- `/api/v1/cron/event-log-drain`
- `/api/v1/cron/expedition-notices`
- `/api/v1/cron/fiscal-drain`
- `/api/v1/cron/fiscal-entradas-sync`
- `/api/v1/cron/followup-flow-worker`
- `/api/v1/cron/kb-conversations-batch`
- `/api/v1/cron/lgpd-sla-watcher`
- `/api/v1/cron/mercos-import`
- `/api/v1/cron/meu-dia-alertas`
- `/api/v1/cron/prospecting-drain`
- `/api/v1/cron/prospecting-fit`
- `/api/v1/cron/prospecting-send`
- `/api/v1/cron/recover-stuck-messages`
- `/api/v1/cron/risk-watcher`
- `/api/v1/cron/routing-worker`
- `/api/v1/cron/snooze-watcher`
- `/api/v1/cron/storage-redaction`
- `/api/v1/cron/sync-model-catalog`
- `/api/v1/cron/webhook-log-retention`

## Serviços do `docker-compose.prod.yml`

- `options`
- `app`
- `worker`
- `waha`
- `fiscal`
- `mercos`
- `ocr`
- `rota`
- `redis`
- `srh`
- `scheduler`
- `caddy`
- `waha-data`
- `waha-media`
- `caddy-data`
- `caddy-config`
- `mercos-state`
- `internal`

## Variáveis de ambiente declaradas em `.env.example` — 104

- `AGENT_DISPATCH_CONSUMER`
- `AI_BUDGET_ENFORCEMENT`
- `AI_CRED_AES_KEY`
- `AI_GATEWAY_API_KEY`
- `AI_GATEWAY_BASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_API_KEY`
- `APP_ACCENT_HEX`
- `APP_LOCALE`
- `APP_LOGO_URL`
- `APP_NAME`
- `AUDIT_LOG_RETENTION_DAYS`
- `CPF_ENCRYPTION_KEY`
- `DISCORD_WEBHOOK_URL`
- `DISCOVERY_CACHE_TTL`
- `EVENT_LOG_DRAIN_BATCH_SIZE`
- `EVENT_LOG_DRAIN_IDLE_INTERVAL_MS`
- `EVENT_LOG_DRAIN_INTERVAL_MS`
- `FISCAL_RESP_TEC_CNPJ`
- `FISCAL_RESP_TEC_CONTATO`
- `FISCAL_RESP_TEC_EMAIL`
- `FISCAL_RESP_TEC_FONE`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEOCODER_MIN_INTERVALO_MS`
- `GEOCODER_UA`
- `GEOCODER_URL`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_PLACES_ENABLED`
- `IMPERSONATE_COOKIE_SECRET`
- `INTERNAL_AGENT_RUN_STUB`
- `INTERNAL_CRON_SECRET`
- `INTERNAL_SECRET`
- `JOB_QUEUE_RETENTION_DAYS`
- `LAYA_API_KEY`
- `LAYA_DECISAO_POR_TICK`
- `LAYA_FIT_POR_TICK`
- `LAYA_TIMEOUT_MS`
- `LAYA_URL`
- `LEAD_CAPTURE_RETENTION_DAYS`
- `LGPD_DPO_EMAIL`
- `LGPD_EXPORT_EXPIRES_HOURS`
- `LGPD_SIGNING_KEY`
- `MAPS_BROWSER_ENABLED`
- `MERCOS_EMAIL`
- `MERCOS_EMPRESA`
- `MERCOS_POLL_MS`
- `MERCOS_SCRAPE_TIMEOUT_MS`
- `MERCOS_SENHA`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_VERSION`
- `META_PHONE_NUMBER_ID`
- `META_SYSTEM_USER_TOKEN`
- `META_WABA_ID`
- `META_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NUVEMSHOP_APP_ID`
- `NUVEMSHOP_CLIENT_ID`
- `NUVEMSHOP_CLIENT_SECRET`
- `NUVEMSHOP_ENABLED`
- `NUVEMSHOP_OAUTH_ENCRYPTION_KEY`
- `OCR_SERVICE_URL`
- `OCR_TIMEOUT_MS`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_APP_TITLE`
- `OPENROUTER_APP_URL`
- `OPENROUTER_BASE_URL`
- `OSM_OVERPASS_URL`
- `OSRM_URL`
- `PROSPECCAO_EXPANSAO`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ROTA_SOLVER_TIMEOUT_MS`
- `ROTA_SOLVER_URL`
- `SENTRY_DSN`
- `SUPABASE_DB_ADMIN_URL`
- `SUPABASE_DB_URL`
- `SUPABASE_IMAGE_TRANSFORM`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPPORT_EMAIL`
- `UPSTASH_REDIS_REST_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `VAPID_PRIVATE_KEY`
- `VAPID_PUBLIC_KEY`
- `VERCEL_AI_GATEWAY_URL`
- `WAHA_API_BASE_URL`
- `WAHA_API_KEY`
- `WAHA_BYO_ENCRYPTION_KEY`
- `WAHA_HMAC_SECRET`
- `WAHA_WEBHOOK_BASE_URL`
- `WAHA_WEBHOOK_REQUIRE_SIGNATURE`
- `WEBHOOK_LOG_BODY_RETENTION_DAYS`
- `WEBHOOK_LOG_ROW_RETENTION_DAYS`
- `WHATSAPP_RESTART_ALL_SESSIONS`
- `ZERNIO_ACCOUNT_ID`
- `ZERNIO_API_BASE_URL`
- `ZERNIO_API_KEY`

