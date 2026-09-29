# Medição de performance — antes × depois (Fases 0–6)

Data: 2026-09-29. Objetivo: registrar a medição "depois" do plano de otimização
(`/app`, `/app/inbox`, `/app/indicadores`) contra o baseline `dev-server.log`
(Fase 0).

## Ambiente e método

- **Instrumento (idêntico nos dois lados):** o log do próprio dev server, linhas
  `GET /rota 200 in X (next.js, proxy.ts, application-code)`. `application-code`
  é o render/RSC real da página; `next.js` é compilação do Turbopack (só existe
  em dev); `proxy.ts` é o tempo de chamada ao Supabase local.
- **Antes:** `dev-server.log` (298 KB, sessão anterior, antes das mudanças).
- **Depois:** `dev-server-depois.log` — `next dev` (Next 16.3.3, Turbopack) na
  porta **3001** (host canônico do `NEXT_PUBLIC_APP_URL`), três passadas do
  Playwright, login como `e2e-manager` (sem MFA), 2 cargas por rota.
- **Stack:** Supabase local via `npx supabase start` (migrations fora do caminho
  no start, como no CI; extensions + `baseline.sql` idempotente em seguida —
  apêndice 0245 aplicado com `ON_ERROR_STOP=1`, exit 0). Volume restaurado do
  backup local: **5 orgs / 7 users / 19 conversations / 89 messages** — mesma
  linhagem de dados do baseline (o seed encontrou os usuários E2E já existentes).
- **HAR:** `evidence/perf-otimizacao/depois.har` (3,1 MB; `content: "omit"` —
  headers e timings sem corpos; `embed` resultou em 129 MB e foi descartado).
  HAR "antes" nunca existiu: a Fase 0 ficou bloqueada com o stack offline; o
  antes oficial é o `dev-server.log`.

## Rotas de página — carga quente (compilação já feita, `next.js < 100ms`)

| Rota | Antes (n) | Depois (n) | Variação (application-code) |
|---|---|---|---|
| `/app` | total 1082–1465 ms · app **653–1004 ms** (4) | total 374–922 ms · app **312–828 ms** (5) | ~1,4–2× mais rápido |
| `/app/inbox` | total 465–732 ms · app **413–604 ms** (6) | total 282–441 ms · app **223–378 ms** (8) | ~1,7× mais rápido |
| `/app/indicadores` | total 11,9–23,3 s · app **11,8–17,1 s** (3) | total 363–483 ms · app **305–422 ms** (4) | **~30× mais rápido** |

Frio (primeira visita do dev server, `next.js` de 1,8–5,9 s) continua em
4,9–7,0 s no depois — é o compile do Turbopack em desenvolvimento, não custo do
app; não existe em produção (`next build`/`next start`).

Amostras cruas do depois (ordem cronológica, primeira passada):

```
GET /app/inbox  200 in 4.9s  (next.js: 4.4s, proxy: 64ms,  app: 361ms)   ← compile frio no login
GET /app        200 in 7.0s  (next.js: 5.9s, proxy: 74ms,  app: 1049ms)  ← compile frio
GET /app        200 in 662ms (next.js: 43ms,  proxy: 154ms, app: 466ms)  ← quente
GET /app/inbox  200 in 441ms (next.js: 11ms,  proxy: 52ms,  app: 378ms)  ← quente
GET /app/inbox  200 in 285ms (next.js: 8ms,   proxy: 55ms,  app: 223ms)  ← quente
GET /app/indicadores 200 in 2.4s (next.js: 1824ms, proxy: 66ms,  app: 504ms)
GET /app/indicadores 200 in 816ms (next.js: 185ms, proxy: 124ms, app: 507ms)
```

O antes de `/app/indicadores` é consistente nas 3 amostras (11,8 / 15,3 /
17,1 s de application-code) — inclusive a amostra com `next.js: 9ms` (100%
quente) que gastou 11,8 s de application-code; não é ruído de compilação.

## XHRs do inbox (total, ms)

| Endpoint | Antes (min–máx) | Depois (min–máx) |
|---|---|---|
| `/api/v1/ai/inbox?status=open` | 442–474 | 280–4000 |
| `/api/v1/conversations/counts` | 387–5600 | 281–4000 |
| `/api/v1/conversations?comando=…` | 299–5300 | 265–1538 |
| `/api/v1/channel-sessions` | 244–5700 | 168–3900 |
| `/api/v1/conversation-tags` | 332–5700 | 269–4100 |
| `/api/v1/auth/realtime-token` | 128–5300 | 194–671 |
| `/api/v1/system/version` | 311–6300 | 179–3800 |
| `/api/v1/ai/automatico-ativo` | 326–5700 | 255–1539 |

Mins em geral menores (sem regressão sistemática); os máximos de ambas as
colunas são o compile do handler na primeira visita, em dev.

## Proxy agregado (todas as linhas)

| | n | média | min | máx |
|---|---|---|---|---|
| Antes (`dev-server.log`) | 1748 | 108 ms | 43 ms | 2700 ms |
| Depois (`dev-server-depois.log`) | 220 | 110 ms | 5 ms | 246 ms |

Estável — a Fase 1 (`Promise.all` no layout) não mexe no proxy; só reduz a
espera total do servidor.

## Leitura por fase

- **Fase 6** (`contexto-indicadores` `LIMITE` 25000→5000, `getUserById` só do
  ranking, ordem da janela DESC): responde por queda de ~30× em
  `/app/indicadores` — a versão antiga fazia fan-out de `getUserById` por
  membros do org fora do ranking e varria muito mais linhas.
- **Fase 1** (`loadAuthUser` com `cache()` + `Promise.all` de 6 promessas no
  `app/app/layout.tsx`): o servidor não serializa mais auth + org + conexões
  caídas + marca + MFA; some das contagens de antes (465–732 → 282–441 ms no
  inbox; 1082–1465 → 374–922 ms no home).
- **Fase 3** (polls 10s→30s / 5s→60s): não aparece no tempo de primeira carga;
  efeito é em carga contínua (menos `/api/v1/channel-sessions` e
  `/api/v1/system/version` por minuto aberto — antes n=126 e n=43 no log
  longo, depois n=9 e n=21 em passadas curtas equivalentes).
- **Fase 2** (`staleTimes` 30/180): visível no banner de dev
  (`Experiments: staleTimes`) e reduz re-render em navegação client-side — não
  isolado nesta medição de cargas full-load.
- **Fase 4** (Sentry `tracesSampleRate: 0`): não há Sentry ativo local
  (`SENTRY_DSN=off`), então zero efeito medido aqui; vale em produção.

## Ressalvas

1. O baseline foi capturado sob carga de máquina claramente mais alta (amostras
   de antes com `proxy.ts` de 400–900 ms e outliers de 5–6 s; depois no máximo
   246 ms). Isso infla o "antes" um pouco; ainda assim, as 3 amostras de
   `/app/indicadores` com application-code ≥ 11,8 s — uma delas 100% quente —
   versus 4 amostras de depois em 305–507 ms, são a prova estrutural do ganho.
2. Volume de dados pequeno (19 conversations) e idêntico nos dois lados — o
   ganho da Fase 6 escala com o teto de 5000 linhas e com o nº de membros; em
   produção com volume maior o corte de 25000→5000 muda mais ainda.
3. Modo dev: compilação fria do Turbopack (4,9–7,0 s) faz parte de todos os
   números máximos; números de produção saem de `next build` + `next start`.
4. Número de amostras pequeno (n=3 a 9 por rota no antes, n=4 a 9 no depois) —
   leia faixas, não médias.

## Reprodução

```bash
# stack (migrations fora do caminho, como o e2e.yml)
Move-Item supabase\migrations <temp>; New-Item supabase\migrations
npx supabase@latest start
# extensions + baseline (docker exec psql) — ver .github/workflows/e2e.yml
pnpm exec tsx scripts/seed-e2e-credentials.ts   # grava .e2e-creds.json
node node_modules\next\dist\bin\next dev --port 3001 > dev-server-depois.log
```

O drive da medição foi um script temporário (apagado): Playwright/Chromium,
login com `#email`/`#password` de `.e2e-creds.json` (mesmo padrão dos
`scripts/qa-wave-*.ts`), `page.goto` × 2 por rota com `recordHar`, e a
extração das linhas `GET` dos dois logs.
